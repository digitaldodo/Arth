package com.digitaldodo.arth.core.sync

import android.content.Context
import com.digitaldodo.arth.core.database.ArthDatabase
import com.digitaldodo.arth.core.model.SyncStatus
import com.digitaldodo.arth.core.network.CreateTransactionApiRequest
import com.digitaldodo.arth.core.network.NetworkClient
import com.digitaldodo.arth.core.security.SecureStorage
import com.digitaldodo.arth.data.repository.BalanceRepository
import com.digitaldodo.arth.data.repository.CategoryRepository
import com.digitaldodo.arth.data.repository.PeopleRepository
import com.digitaldodo.arth.data.repository.TransactionRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.Json

sealed class SyncState {
    object Idle : SyncState()
    object Syncing : SyncState()
    data class Success(val timestamp: Long, val transactionsCount: Int) : SyncState()
    data class Error(val message: String, val timestamp: Long) : SyncState()
}

class AccountSyncService private constructor(private val context: Context) {
    private val db = ArthDatabase.getInstance(context)
    private val transactionRepo = TransactionRepository(
        db.transactionDao(),
        db.accountBalancesDao(),
        db.syncOutboxDao(),
        context
    )
    private val categoryRepo = CategoryRepository(db.categoryDao(), context)
    private val balanceRepo = BalanceRepository(db.accountBalancesDao(), db.transactionDao(), context)
    private val peopleRepo = PeopleRepository(db.personDao(), db.personTransactionDao(), context)
    private val secureStorage = SecureStorage(context)
    private val syncMutex = Mutex()
    private val json = Json { ignoreUnknownKeys = true }

    private val _syncState = MutableStateFlow<SyncState>(SyncState.Idle)
    val syncState = _syncState.asStateFlow()

    suspend fun syncAll(): Result<Unit> = syncMutex.withLock {
        if (!secureStorage.isLoggedIn()) {
            return Result.failure(IllegalStateException("User is not signed in to Arth"))
        }

        _syncState.value = SyncState.Syncing

        try {
            // 1. Drain local outbox first so pending local transactions reach server
            val outboxDao = db.syncOutboxDao()
            val transactionDao = db.transactionDao()
            val arthApi = NetworkClient.createArthApi(secureStorage)

            val pending = outboxDao.getPending(limit = 50)
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
                            }
                        } else if (item.operation == "DELETE") {
                            outboxDao.deleteById(item.id)
                        }
                    }
                } catch (_: Exception) {
                    // Non-fatal, continue with inbound sync
                }
            }

            // 2. Refresh Categories
            categoryRepo.refreshCategories()

            // 3. Refresh Transactions (inbound)
            val txResult = transactionRepo.refreshTransactions()

            // 4. Refresh Balances (authoritative from backend)
            balanceRepo.refreshBalances()

            // 5. Refresh People
            peopleRepo.refreshPeople()

            val now = System.currentTimeMillis()
            secureStorage.setLastSyncTimestamp(now)
            _syncState.value = SyncState.Success(now, txResult.getOrDefault(0))
            Result.success(Unit)
        } catch (e: Exception) {
            val errorMsg = e.message ?: "Failed to synchronize financial data"
            _syncState.value = SyncState.Error(errorMsg, System.currentTimeMillis())
            Result.failure(e)
        }
    }

    companion object {
        @Volatile
        private var instance: AccountSyncService? = null

        fun getInstance(context: Context): AccountSyncService {
            return instance ?: synchronized(this) {
                instance ?: AccountSyncService(context.applicationContext).also { instance = it }
            }
        }
    }
}
