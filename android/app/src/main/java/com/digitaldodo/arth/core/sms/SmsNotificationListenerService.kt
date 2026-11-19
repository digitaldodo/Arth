package com.digitaldodo.arth.core.sms

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ComponentName
import android.content.Intent
import android.provider.Telephony
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import com.digitaldodo.arth.core.database.ArthDatabase
import com.digitaldodo.arth.core.model.DuplicateStatus
import com.digitaldodo.arth.MainActivity
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import android.content.pm.PackageManager

/**
 * Imports visible transaction alerts from the user's default SMS app without inbox permissions.
 * Notification access is separately granted by the user in Android Settings. Raw notification
 * text is parsed in memory and is never written to the database or sent to the backend.
 */
class SmsNotificationListenerService : NotificationListenerService() {
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private lateinit var smsPreferences: SmsPreferencesRepository

    override fun onCreate() {
        super.onCreate()
        smsPreferences = SmsPreferencesRepository(applicationContext)
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            getSystemService(NotificationManager::class.java)?.createNotificationChannel(
                NotificationChannel(REVIEW_CHANNEL, "Transaction review", NotificationManager.IMPORTANCE_DEFAULT).apply {
                    description = "Private prompts to review detected transaction alerts"
                    lockscreenVisibility = Notification.VISIBILITY_PRIVATE
                    setSound(null, null)
                    enableVibration(false)
                }
            )
        }
    }

    override fun onListenerConnected() {
        super.onListenerConnected()
        smsPreferences.isNotificationListenerConnected = true
    }

    override fun onListenerDisconnected() {
        smsPreferences.isNotificationListenerConnected = false
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.N) {
            requestRebind(ComponentName(this, SmsNotificationListenerService::class.java))
        }
        super.onListenerDisconnected()
    }

    override fun onDestroy() {
        if (::smsPreferences.isInitialized) smsPreferences.isNotificationListenerConnected = false
        serviceScope.cancel()
        super.onDestroy()
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        if (!::smsPreferences.isInitialized || !smsPreferences.isNotificationMonitoringEnabled) return
        if (sbn.isOngoing || sbn.notification.flags and Notification.FLAG_GROUP_SUMMARY != 0) return

        val defaultSmsPackage = Telephony.Sms.getDefaultSmsPackage(this) ?: return
        if (sbn.packageName != defaultSmsPackage || sbn.packageName == packageName) return

        val content = extractVisibleText(sbn.notification) ?: return
        if (content.isBlank()) return

        // Classify on the callback and pass only extracted fields to background storage work.
        val title = sbn.notification.extras?.getCharSequence(Notification.EXTRA_TITLE)?.toString()
        val parsed = SmsNotificationParser.parse(
            notificationPackage = sbn.packageName,
            defaultSmsPackage = defaultSmsPackage,
            title = title,
            visibleText = content,
            postedAt = sbn.postTime,
            monitoringEnabled = smsPreferences.isNotificationMonitoringEnabled
        ) ?: return

        serviceScope.launch {
            val database = ArthDatabase.getInstance(applicationContext)
            val suggestions = database.smsSuggestionDao()
            val transactions = database.transactionDao()

            if (!parsed.refNumber.isNullOrBlank() && suggestions.findByRefNumber(parsed.refNumber) != null) return@launch
            if (parsed.refNumber.isNullOrBlank()) {
                val nearMatch = suggestions.findNearMatch(parsed.amountPaise, parsed.timestamp, DUPLICATE_WINDOW_MILLIS)
                if (nearMatch != null && (parsed.merchant.isNullOrBlank() || nearMatch.merchant.equals(parsed.merchant, true))) return@launch
            }

            var duplicateStatus = DuplicateStatus.UNIQUE.name
            var matchedTransactionId: String? = null
            if (!parsed.refNumber.isNullOrBlank()) {
                transactions.findByReference(parsed.refNumber)?.let { matched ->
                    duplicateStatus = DuplicateStatus.POTENTIAL_DUPLICATE.name
                    matchedTransactionId = matched.id
                }
            }
            if (matchedTransactionId == null) {
                transactions.findPotentialDuplicates(parsed.amountPaise, parsed.timestamp).firstOrNull()?.let { matched ->
                    duplicateStatus = DuplicateStatus.POTENTIAL_DUPLICATE.name
                    matchedTransactionId = matched.id
                }
            }

            suggestions.insert(
                SmsNotificationParser.toSuggestion(parsed).copy(
                    duplicateStatus = duplicateStatus,
                    matchedTransactionId = matchedTransactionId
                )
            )
            smsPreferences.incrementProcessedCount()
            postReviewPrompt(parsed.id.hashCode())
        }
    }

    private fun postReviewPrompt(notificationId: Int) {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return

        val openApp = PendingIntent.getActivity(
            this,
            notificationId,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        runCatching {
            NotificationCompat.Builder(this, REVIEW_CHANNEL)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle("Transaction alert ready for review")
                .setContentText("Open SpendSense to review the details")
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .setCategory(NotificationCompat.CATEGORY_EVENT)
                .setAutoCancel(true)
                .setContentIntent(openApp)
                .build()
                .also { getSystemService(NotificationManager::class.java)?.notify(notificationId, it) }
        }
    }

    private fun extractVisibleText(notification: Notification): String? {
        val extras = notification.extras ?: return null
        val parts = buildList {
            extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()?.let(::add)
            extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()?.let(::add)
            extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)?.forEach { add(it.toString()) }
        }.distinct()
        return parts.joinToString(" ").take(MAX_NOTIFICATION_LENGTH).takeIf(String::isNotBlank)
    }

    companion object {
        private const val MAX_NOTIFICATION_LENGTH = 10_000
        private const val DUPLICATE_WINDOW_MILLIS = 120_000L
        private const val REVIEW_CHANNEL = "sms_transaction_review"

        fun hasNotificationAccess(context: android.content.Context): Boolean {
            val enabledListeners = android.provider.Settings.Secure.getString(
                context.contentResolver,
                "enabled_notification_listeners"
            ).orEmpty()
            val expected = ComponentName(context, SmsNotificationListenerService::class.java).flattenToString()
            return enabledListeners.split(':').any { it.equals(expected, ignoreCase = true) }
        }

        fun defaultSmsAppLabel(context: android.content.Context): String? {
            val packageName = Telephony.Sms.getDefaultSmsPackage(context) ?: return null
            return runCatching {
                val applicationInfo = context.packageManager.getApplicationInfo(packageName, 0)
                context.packageManager.getApplicationLabel(applicationInfo).toString()
            }.getOrDefault(packageName)
        }

        fun openNotificationAccessSettings(context: android.content.Context) {
            val intent = android.content.Intent(android.provider.Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
            intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
        }
    }
}
