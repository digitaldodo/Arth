package com.digitaldodo.arth.core.sms

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.provider.Telephony
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.digitaldodo.arth.MainActivity
import com.digitaldodo.arth.R
import com.digitaldodo.arth.core.database.ArthDatabase
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * Captures eligible transaction notifications from the user's allowlisted financial apps
 * (UPI/banking apps and optionally the default Messages app) without SMS inbox permissions.
 * Notification access is explicitly granted by the user in Android Settings.
 * Raw notification text is parsed locally in memory and is never stored or uploaded.
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
        smsPreferences.lastCaptureError = null
    }

    override fun onListenerDisconnected() {
        smsPreferences.isNotificationListenerConnected = false
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.N) {
            runCatching {
                requestRebind(ComponentName(this, SmsNotificationListenerService::class.java))
            }.onFailure {
                smsPreferences.lastCaptureError = "Notification listener disconnected; reopen Android Settings if alerts pause."
            }
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
        if (sbn.packageName == packageName) return

        val allowedPackages = smsPreferences.allowedNotificationPackages
        val allowDefaultSms = smsPreferences.isNotificationDefaultSmsEnabled
        val defaultSmsPackage = runCatching { Telephony.Sms.getDefaultSmsPackage(this) }.getOrNull()

        val isDefaultSms = allowDefaultSms && !defaultSmsPackage.isNullOrBlank() && sbn.packageName == defaultSmsPackage
        val isAllowlisted = sbn.packageName in allowedPackages
        if (!isDefaultSms && !isAllowlisted) return

        val title = sbn.notification.extras?.getCharSequence(Notification.EXTRA_TITLE)?.toString()
        val content = extractVisibleText(sbn.notification) ?: return
        val pkgName = sbn.packageName
        val postedAt = sbn.postTime
        val monitoringEnabled = smsPreferences.isNotificationMonitoringEnabled
        val sourceLabel = SupportedNotificationSources.resolveSourceLabel(
            packageName = pkgName,
            defaultSmsPackage = defaultSmsPackage,
            defaultSmsLabel = defaultSmsAppLabel(this)
        )

        serviceScope.launch {
            runCatching {
                val parsed = SmsNotificationParser.parseAllowlisted(
                    notificationPackage = pkgName,
                    defaultSmsPackage = defaultSmsPackage,
                    allowedPackages = allowedPackages,
                    allowDefaultSmsApp = allowDefaultSms,
                    title = title,
                    visibleText = content,
                    postedAt = postedAt,
                    monitoringEnabled = monitoringEnabled
                ) ?: return@launch

                val database = ArthDatabase.getInstance(applicationContext)
                val suggestions = database.smsSuggestionDao()
                val transactions = database.transactionDao()

                val refMatchedTx = parsed.refNumber?.let { transactions.findByReference(it) }
                val amountMatchedTxs = transactions.findPotentialDuplicates(parsed.amountPaise, parsed.timestamp)
                val (duplicateStatus, matchedTransactionId) = TransactionDeduplicator.evaluateLedgerDuplicate(
                    amountPaise = parsed.amountPaise,
                    type = parsed.type,
                    merchant = parsed.merchant,
                    refNumber = parsed.refNumber,
                    timestamp = parsed.timestamp,
                    refMatchedTx = refMatchedTx,
                    amountMatchedTxs = amountMatchedTxs
                )

                val candidate = SmsNotificationParser.toSuggestion(parsed, sourceLabel = sourceLabel).copy(
                    duplicateStatus = duplicateStatus,
                    matchedTransactionId = matchedTransactionId
                )

                val exactRefMatch = parsed.refNumber?.takeIf { it.isNotBlank() }?.let { suggestions.findByRefNumber(it) }
                val nearbyMatches = suggestions.findNearMatches(
                    parsed.amountPaise,
                    parsed.timestamp,
                    TransactionDeduplicator.CROSS_SOURCE_WINDOW_MILLIS
                )

                when (val decision = TransactionDeduplicator.evaluatePendingSuggestion(candidate, exactRefMatch, nearbyMatches)) {
                    is TransactionDeduplicator.CandidateDecision.SkipDuplicate -> return@launch
                    is TransactionDeduplicator.CandidateDecision.MergeIntoExisting -> {
                        suggestions.update(
                            decision.mergedEntity.copy(
                                duplicateStatus = duplicateStatus,
                                matchedTransactionId = matchedTransactionId ?: decision.mergedEntity.matchedTransactionId
                            )
                        )
                        smsPreferences.recordSuccessfulCapture(sourceLabel, postedAt)
                    }
                    is TransactionDeduplicator.CandidateDecision.InsertNew -> {
                        suggestions.insert(candidate)
                        smsPreferences.recordSuccessfulCapture(sourceLabel, postedAt)
                        postReviewPrompt(parsed.id.hashCode())
                    }
                }
            }.onFailure { err ->
                smsPreferences.lastCaptureError = err.message ?: "Capture processing interrupted"
            }
        }
    }

    private fun postReviewPrompt(notificationId: Int) {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return

        val reviewIntent = Intent(this, MainActivity::class.java).apply {
            putExtra(MainActivity.EXTRA_OPEN_ROUTE, "sms_review")
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val openApp = PendingIntent.getActivity(
            this,
            notificationId,
            reviewIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        runCatching {
            NotificationCompat.Builder(this, REVIEW_CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_spendsense)
                .setContentTitle("Transaction alert ready for review")
                .setContentText("Tap to review and confirm in SpendSense")
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
