package com.digitaldodo.arth.core.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.digitaldodo.arth.core.security.SecureStorage

class SyncWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        val secureStorage = SecureStorage(applicationContext)
        if (!secureStorage.isLoggedIn()) {
            return Result.success()
        }

        val syncService = AccountSyncService.getInstance(applicationContext)
        val result = syncService.syncAll()

        return if (result.isSuccess) {
            Result.success()
        } else {
            Result.retry()
        }
    }
}
