package com.digitaldodo.arth

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import androidx.core.app.NotificationCompat
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager

class FinancialNotificationListener : NotificationListenerService() {
    override fun onListenerConnected() {
        super.onListenerConnected()
        getSharedPreferences("detection", MODE_PRIVATE).edit().putBoolean("listener_connected", true).apply()
    }

    override fun onListenerDisconnected() {
        getSharedPreferences("detection", MODE_PRIVATE).edit().putBoolean("listener_connected", false).apply()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) requestRebind(android.content.ComponentName(this, FinancialNotificationListener::class.java))
        super.onListenerDisconnected()
    }

    override fun onDestroy() {
        getSharedPreferences("detection", MODE_PRIVATE).edit().putBoolean("listener_connected", false).apply()
        super.onDestroy()
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val prefs = getSharedPreferences("detection", MODE_PRIVATE)
        if (!prefs.getBoolean("enabled", false)) return
        if (NativeAuth.userId(this).isNullOrBlank()) return
        if (sbn.isOngoing || sbn.notification.flags and Notification.FLAG_GROUP_SUMMARY != 0) return
        val allowed = prefs.getStringSet("allowed_packages", emptySet()).orEmpty()
        if (sbn.packageName !in allowed) return
        val extras = sbn.notification.extras ?: return
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)
        val parts = mutableListOf<CharSequence>()
        extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.let(parts::add)
        extras.getCharSequence(Notification.EXTRA_TEXT)?.let(parts::add)
        extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)?.forEach(parts::add)
        val text = parts.distinct().joinToString(" ")
        val result = TransactionMessageParser.parse(title, text, sbn.postTime)
        val keyDigest = java.security.MessageDigest.getInstance("SHA-256").digest(sbn.key.toByteArray()).joinToString("") { "%02x".format(it) }
        val row = CandidateStore(this).insert(result, sbn.packageName, keyDigest, prefs.getInt("retention_days", 30))
        if (row <= 0) return
        postGenericReviewAlert(row.toLong())
    }

    private fun postGenericReviewAlert(candidateId: Long) {
        val hideDetails = getSharedPreferences("detection", MODE_PRIVATE).getBoolean("private_alerts", true)
        val candidate = CandidateStore(this).candidate(candidateId)
        val manager = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(NotificationChannel(CHANNEL, "Transaction reviews", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "Private alerts when a supported app appears to post a financial transaction"
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                setSound(null, null)
                enableVibration(false)
            })
        }
        val intent = Intent(this, MainActivity::class.java).putExtra("candidate_id", candidateId)
        val pending = PendingIntent.getActivity(this, candidateId.toInt(), intent,
            PendingIntent.FLAG_UPDATE_CURRENT or if (Build.VERSION.SDK_INT >= 23) PendingIntent.FLAG_IMMUTABLE else 0)
        val notification = NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(if (hideDetails) "Possible transaction detected" else "Possible transaction · ${candidate?.amount?.let { "₹$it" } ?: "Review details"}")
            .setContentText(if (hideDetails) "Open Arth to review the details" else listOfNotNull(candidate?.amount?.let { "₹$it" }, candidate?.merchant, candidate?.date).joinToString(" · ").ifBlank { "Open Arth to review the details" })
            .setVisibility(if (hideDetails) NotificationCompat.VISIBILITY_PRIVATE else NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(NotificationCompat.CATEGORY_EVENT)
            .setAutoCancel(true).setContentIntent(pending).build()
        manager.notify((candidateId % Int.MAX_VALUE).toInt(), notification)
    }

    companion object { private const val CHANNEL = "transaction_reviews" }
}
