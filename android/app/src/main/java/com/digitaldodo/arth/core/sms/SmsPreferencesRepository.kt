package com.digitaldodo.arth.core.sms

import android.content.Context
import android.content.SharedPreferences

class SmsPreferencesRepository(context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences("arth_sms_preferences", Context.MODE_PRIVATE)

    var isTrackingEnabled: Boolean
        get() = prefs.getBoolean(KEY_TRACKING_ENABLED, false)
        set(value) = prefs.edit().putBoolean(KEY_TRACKING_ENABLED, value).apply()

    var isTrackingPaused: Boolean
        get() = prefs.getBoolean(KEY_TRACKING_PAUSED, false)
        set(value) = prefs.edit().putBoolean(KEY_TRACKING_PAUSED, value).apply()

    var isNotificationMonitoringEnabled: Boolean
        get() = prefs.getBoolean(KEY_NOTIFICATION_MONITORING_ENABLED, false)
        set(value) = prefs.edit().putBoolean(KEY_NOTIFICATION_MONITORING_ENABLED, value).apply()

    var isNotificationListenerConnected: Boolean
        get() = prefs.getBoolean(KEY_NOTIFICATION_LISTENER_CONNECTED, false)
        set(value) = prefs.edit().putBoolean(KEY_NOTIFICATION_LISTENER_CONNECTED, value).apply()

    var isAutoAddEnabled: Boolean
        get() = prefs.getBoolean(KEY_AUTO_ADD_ENABLED, false)
        set(value) = prefs.edit().putBoolean(KEY_AUTO_ADD_ENABLED, value).apply()

    var historicalScanDays: Int
        get() = prefs.getInt(KEY_HISTORICAL_DAYS, 30)
        set(value) = prefs.edit().putInt(KEY_HISTORICAL_DAYS, value).apply()

    var lastScanTimestamp: Long
        get() = prefs.getLong(KEY_LAST_SCAN_TS, 0L)
        set(value) = prefs.edit().putLong(KEY_LAST_SCAN_TS, value).apply()

    var lastScannedSmsId: Long
        get() = prefs.getLong(KEY_LAST_SCANNED_ID, 0L)
        set(value) = prefs.edit().putLong(KEY_LAST_SCANNED_ID, value).apply()

    var totalMessagesProcessed: Int
        get() = prefs.getInt(KEY_TOTAL_PROCESSED, 0)
        set(value) = prefs.edit().putInt(KEY_TOTAL_PROCESSED, value).apply()

    fun incrementProcessedCount(count: Int = 1) {
        totalMessagesProcessed += count
    }

    fun reset() {
        prefs.edit().clear().apply()
    }

    companion object {
        private const val KEY_TRACKING_ENABLED = "sms_tracking_enabled"
        private const val KEY_TRACKING_PAUSED = "sms_tracking_paused"
        private const val KEY_NOTIFICATION_MONITORING_ENABLED = "sms_notification_monitoring_enabled"
        private const val KEY_NOTIFICATION_LISTENER_CONNECTED = "sms_notification_listener_connected"
        private const val KEY_AUTO_ADD_ENABLED = "sms_auto_add_enabled"
        private const val KEY_HISTORICAL_DAYS = "sms_historical_days"
        private const val KEY_LAST_SCAN_TS = "sms_last_scan_ts"
        private const val KEY_LAST_SCANNED_ID = "sms_last_scanned_id"
        private const val KEY_TOTAL_PROCESSED = "sms_total_processed"
    }
}
