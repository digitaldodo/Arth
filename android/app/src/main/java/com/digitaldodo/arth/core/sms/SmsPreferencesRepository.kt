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

    var isNotificationDefaultSmsEnabled: Boolean
        get() = prefs.getBoolean(KEY_NOTIFICATION_DEFAULT_SMS_ENABLED, true)
        set(value) = prefs.edit().putBoolean(KEY_NOTIFICATION_DEFAULT_SMS_ENABLED, value).apply()

    var allowedNotificationPackages: Set<String>
        get() = prefs.getStringSet(KEY_ALLOWED_NOTIFICATION_PACKAGES, null)
            ?.toSet()
            ?: SupportedNotificationSources.defaultAllowedPackages
        set(value) = prefs.edit().putStringSet(KEY_ALLOWED_NOTIFICATION_PACKAGES, value.toSet()).apply()

    var lastCaptureTimestamp: Long
        get() = prefs.getLong(KEY_LAST_CAPTURE_TS, 0L)
        set(value) = prefs.edit().putLong(KEY_LAST_CAPTURE_TS, value).apply()

    var lastCaptureSource: String?
        get() = prefs.getString(KEY_LAST_CAPTURE_SOURCE, null)
        set(value) = prefs.edit().putString(KEY_LAST_CAPTURE_SOURCE, value).apply()

    var lastCaptureError: String?
        get() = prefs.getString(KEY_LAST_CAPTURE_ERROR, null)
        set(value) = prefs.edit().putString(KEY_LAST_CAPTURE_ERROR, value).apply()

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

    var hasCompletedFirstLaunchOnboarding: Boolean
        get() = prefs.getBoolean(KEY_FIRST_LAUNCH_ONBOARDED, false)
        set(value) = prefs.edit().putBoolean(KEY_FIRST_LAUNCH_ONBOARDED, value).apply()

    fun toggleAllowedPackage(packageName: String, enabled: Boolean) {
        val updated = allowedNotificationPackages.toMutableSet()
        if (enabled) updated.add(packageName) else updated.remove(packageName)
        allowedNotificationPackages = updated
    }

    fun recordSuccessfulCapture(sourceLabel: String, timestamp: Long = System.currentTimeMillis()) {
        lastCaptureTimestamp = timestamp
        lastCaptureSource = sourceLabel
        lastCaptureError = null
        incrementProcessedCount(1)
    }

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
        private const val KEY_NOTIFICATION_DEFAULT_SMS_ENABLED = "sms_notification_default_sms_enabled"
        private const val KEY_ALLOWED_NOTIFICATION_PACKAGES = "sms_allowed_notification_packages"
        private const val KEY_LAST_CAPTURE_TS = "sms_last_capture_ts"
        private const val KEY_LAST_CAPTURE_SOURCE = "sms_last_capture_source"
        private const val KEY_LAST_CAPTURE_ERROR = "sms_last_capture_error"
        private const val KEY_AUTO_ADD_ENABLED = "sms_auto_add_enabled"
        private const val KEY_HISTORICAL_DAYS = "sms_historical_days"
        private const val KEY_LAST_SCAN_TS = "sms_last_scan_ts"
        private const val KEY_LAST_SCANNED_ID = "sms_last_scanned_id"
        private const val KEY_TOTAL_PROCESSED = "sms_total_processed"
        private const val KEY_FIRST_LAUNCH_ONBOARDED = "sms_first_launch_onboarded"
    }
}
