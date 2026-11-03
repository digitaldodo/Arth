package com.digitaldodo.arth.core.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.digitaldodo.arth.core.database.ArthDatabase
import com.digitaldodo.arth.core.model.SyncStatus
import com.digitaldodo.arth.core.network.CreateTransactionApiRequest
import com.digitaldodo.arth.core.network.NetworkClient
import com.digitaldodo.arth.core.security.SecureStorage
import kotlinx.serialization.json.Json

class SyncWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    private val json = Json { ignoreUnknownKeys = true }

    override suspend fun doWork(): Result {
        val secureStorage = SecureStorage(applicationContext)
        if (!secureStorage.isLoggedIn()) {
            return Result.success() // Can't sync without auth, wait until logged in
        }

        val db = ArthDatabase.getInstance(applicationContext)
        val outboxDao = db.syncOutboxDao()
        val transactionDao = db.transactionDao()
        val arthApi = NetworkClient.createArthApi(secureStorage)

        val pending = outboxDao.getPending(limit = 25)
        if (pending.isEmpty()) {
            return Result.success()
        }

        var anyFailed = false

        for (item in pending) {
            try {
                if (item.entityType == "TRANSACTION") {
                    if (item.operation == "INSERT") {
                        val request = json.decodeFromString<CreateTransactionApiRequest>(item.payloadJson)
                        val response = arthApi.createTransaction(request)
                        if (response.transaction != null || response.idempotentReplay) {
                            outboxDao.deleteById(item.id)
                            transactionDao.getById(item.entityId)?.let { current ->
                                transactionDao.update(current.copy(syncStatus = SyncStatus.SYNCED.name))
                            }
                        } else {
                            outboxDao.recordAttempt(item.id, "Server failed to record transaction")
                            anyFailed = true
                        }
                    } else if (item.operation == "DELETE") {
                        outboxDao.deleteById(item.id)
                    }
                }
            } catch (e: Exception) {
                outboxDao.recordAttempt(item.id, e.message ?: "Network error during sync")
                anyFailed = true
            }
        }

        return if (anyFailed) Result.retry() else Result.success()
    }
}
