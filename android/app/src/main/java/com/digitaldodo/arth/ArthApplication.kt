package com.digitaldodo.arth

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import com.digitaldodo.arth.core.database.ArthDatabase

class ArthApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        // Initialize Room DB eagerly
        ArthDatabase.getInstance(this)
        createNotificationChannels()
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
