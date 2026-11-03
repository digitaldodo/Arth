package com.digitaldodo.arth

import android.app.Activity
import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import android.os.Bundle
import com.digitaldodo.arth.core.database.ArthDatabase
import com.digitaldodo.arth.core.security.AppLockManager

class ArthApplication : Application() {
    private var startedActivityCount = 0
    private var isChangingConfigurations = false

    override fun onCreate() {
        super.onCreate()
        ArthDatabase.getInstance(this)
        createNotificationChannels()
        AppLockManager.initialize(this)

        registerActivityLifecycleCallbacks(object : ActivityLifecycleCallbacks {
            override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {}

            override fun onActivityStarted(activity: Activity) {
                if (startedActivityCount == 0 && !isChangingConfigurations) {
                    AppLockManager.onAppForegrounded(this@ArthApplication)
                }
                startedActivityCount++
            }

            override fun onActivityResumed(activity: Activity) {}
            override fun onActivityPaused(activity: Activity) {}

            override fun onActivityStopped(activity: Activity) {
                isChangingConfigurations = activity.isChangingConfigurations
                startedActivityCount--
                if (startedActivityCount == 0 && !isChangingConfigurations) {
                    AppLockManager.onAppBackgrounded()
                }
            }

            override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}
            override fun onActivityDestroyed(activity: Activity) {}
        })
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_TRANSACTIONS,
                "Transaction Alerts",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "Notifications for detected bank and UPI transactions"
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(channel)
        }
    }

    companion object {
        const val CHANNEL_TRANSACTIONS = "arth_transactions_channel"
    }
}
