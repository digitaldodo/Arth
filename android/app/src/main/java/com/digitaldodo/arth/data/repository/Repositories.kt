package com.digitaldodo.arth.data.repository

import android.content.Context
import androidx.work.*
import com.digitaldodo.arth.core.database.*
import com.digitaldodo.arth.core.model.*
import com.digitaldodo.arth.core.network.CreateTransactionApiRequest
import com.digitaldodo.arth.core.network.NetworkClient
import com.digitaldodo.arth.core.security.SecureStorage
import com.digitaldodo.arth.core.sync.SyncWorker
import kotlinx.coroutines.flow.*
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.text.SimpleDateFormat
import java.util.*

class TransactionRepository(
    private val transactionDao: TransactionDao,
    private val balancesDao: AccountBalancesDao,
    private val outboxDao: SyncOutboxDao,
    private val context: Context
) {
    private val json = Json { ignoreUnknownKeys = true }

    fun observeAllTransactions(): Flow<List<Transaction>> {
        return transactionDao.observeAll().map { list -> list.map { it.toDomain() } }
    }

    fun observeRecentTransactions(limit: Int = 10): Flow<List<Transaction>> {
        return transactionDao.observeRecent(limit).map { list -> list.map { it.toDomain() } }
    }

    fun searchTransactions(query: String): Flow<List<Transaction>> {
        return transactionDao.searchTransactions(query).map { list -> list.map { it.toDomain() } }
    }

    suspend fun getTransactionById(id: String): Transaction? {
        return transactionDao.getById(id)?.toDomain()
    }

    suspend fun addTransaction(transaction: Transaction) {
        val entity = TransactionEntity.fromDomain(transaction.copy(syncStatus = SyncStatus.PENDING))
        transactionDao.insert(entity)

        // Enqueue outbox sync payload formatted exactly to backend CreateTransactionRequest contract
        val sdfDate = SimpleDateFormat("yyyy-MM-dd", Locale.ROOT)
        val dateObj = Date(transaction.transactionDate)

        val amountRupees = String.format(Locale.ROOT, "%.2f", transaction.amountPaise / 100.0)
        val apiRequest = CreateTransactionApiRequest(
            id = transaction.id,
            amount = amountRupees,
            type = if (transaction.type == TransactionType.INCOME) "income" else "expense",
            categoryId = transaction.categoryId,
            transactionDate = sdfDate.format(dateObj),
            paymentMethod = if (transaction.paymentMode == PaymentMode.CASH) "cash" else "online",
            necessity = if (transaction.type == TransactionType.EXPENSE) {
                transaction.necessity?.apiValue ?: "essential"
            } else {
                null
            },
            description = transaction.counterparty ?: transaction.categoryName,
            notes = transaction.notes,
            recordedAt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.ROOT).apply {
                timeZone = TimeZone.getTimeZone("UTC")
            }.format(Date(transaction.createdAt))
        )

        outboxDao.insert(
            SyncOutboxEntity(
                entityType = "TRANSACTION",
                entityId = transaction.id,
                operation = "INSERT",
                payloadJson = json.encodeToString(apiRequest)
            )
        )

        // Trigger WorkManager sync
        triggerSync(context)
    }

    suspend fun softDeleteTransaction(id: String) {
        transactionDao.softDelete(id)
        outboxDao.insert(
            SyncOutboxEntity(
                entityType = "TRANSACTION",
                entityId = id,
                operation = "DELETE",
                payloadJson = """{"id":"$id"}"""
            )
        )
        triggerSync(context)
    }

    suspend fun refreshTransactions(): Result<Int> {
        val secureStorage = SecureStorage(context)
        if (!secureStorage.isLoggedIn()) return Result.failure(IllegalStateException("Sign in to Arth first."))

        return try {
            val api = NetworkClient.createArthApi(secureStorage)
            val currentUserId = secureStorage.getUserId() ?: ""
            var page = 1
            var totalFetched = 0
            val sdfDate = SimpleDateFormat("yyyy-MM-dd", Locale.ROOT)
            val sdfIso = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.ROOT).apply {
                timeZone = TimeZone.getTimeZone("UTC")
            }
            val pendingOutboxIds = outboxDao.getPending(1000).map { it.entityId }.toSet()

            while (true) {
                val response = api.getTransactions(page = page, pageSize = 50)
                if (response.items.isEmpty()) break

                val entities = response.items.mapNotNull { dto ->
                    // Do not overwrite local changes if this entity is pending in outbox
                    if (pendingOutboxIds.contains(dto.id)) {
                        return@mapNotNull null
                    }

                    val txDateMillis = try {
                        sdfDate.parse(dto.transactionDate)?.time ?: System.currentTimeMillis()
                    } catch (_: Exception) {
                        System.currentTimeMillis()
                    }

                    val createdMillis = try {
                        val str = dto.createdAt ?: dto.recordedAt
                        if (str != null) sdfIso.parse(str)?.time ?: txDateMillis else txDateMillis
                    } catch (_: Exception) {
                        txDateMillis
                    }

                    val updatedMillis = try {
                        val str = dto.updatedAt ?: dto.createdAt
                        if (str != null) sdfIso.parse(str)?.time ?: createdMillis else createdMillis
                    } catch (_: Exception) {
                        createdMillis
                    }

                    TransactionEntity(
                        id = dto.id,
                        userId = currentUserId,
                        amountPaise = dto.amountPaise,
                        type = dto.type.uppercase(),
                        paymentMode = dto.paymentMethod.uppercase(),
                        necessity = dto.necessity,
                        categoryId = dto.categoryId,
                        categoryName = dto.categoryName ?: "General",
                        categoryIcon = "🧾",
                        categoryColor = "#78716C",
                        transactionDate = txDateMillis,
                        notes = dto.notes,
                        counterparty = dto.description,
                        isDeleted = false,
                        syncStatus = SyncStatus.SYNCED.name,
                        createdAt = createdMillis,
                        updatedAt = updatedMillis
                    )
                }

                if (entities.isNotEmpty()) {
                    transactionDao.insertAll(entities)
                    totalFetched += entities.size
                }

                if (!response.hasMore || response.items.size < 50) break
                page++
            }

            Result.success(totalFetched)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /**
     * Calculates the true current balances based on:
     * Baseline Starting Balances + Σ(Inflow post-baseline) - Σ(Outflow post-baseline)
     */
    suspend fun calculateBalances(): AccountBalances {
        val starting = balancesDao.getPrimary() ?: AccountBalancesEntity()
        val configuredAt = starting.balancesConfiguredAt

        val cashIncome = transactionDao.getPostBaselineIncome("CASH", configuredAt)
        val cashExpense = transactionDao.getPostBaselineExpense("CASH", configuredAt)
        val currentCash = starting.cashPaise + cashIncome - cashExpense

        val onlineIncome = transactionDao.getPostBaselineIncome("ONLINE", configuredAt)
        val onlineExpense = transactionDao.getPostBaselineExpense("ONLINE", configuredAt)
        val currentOnline = starting.onlinePaise + onlineIncome - onlineExpense

        return AccountBalances(
            id = "primary",
            cashPaise = currentCash,
            onlinePaise = currentOnline,
            totalAvailablePaise = currentCash + currentOnline,
            startingCashPaise = starting.startingCashPaise,
            startingOnlinePaise = starting.startingOnlinePaise,
            balancesConfiguredAt = configuredAt
        )
    }

    companion object {
        fun triggerSync(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val syncRequest = OneTimeWorkRequestBuilder<SyncWorker>()
                .setConstraints(constraints)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, java.util.concurrent.TimeUnit.SECONDS)
                .build()

            WorkManager.getInstance(context).enqueueUniqueWork(
                "ArthSyncWork",
                ExistingWorkPolicy.REPLACE,
                syncRequest
            )
        }
    }
}

class CategoryRepository(
    private val categoryDao: CategoryDao,
    private val context: Context? = null
) {
    fun observeCategories(): Flow<List<Category>> {
        return categoryDao.observeAll().map { list -> list.map { it.toDomain() } }
    }

    suspend fun addCategory(category: Category) {
        categoryDao.insert(CategoryEntity.fromDomain(category))
    }

    suspend fun deleteCategory(id: String) {
        categoryDao.delete(id)
    }

    suspend fun refreshCategories(): Result<Int> {
        val ctx = context ?: return Result.failure(IllegalStateException("No context available"))
        val secureStorage = SecureStorage(ctx)
        if (!secureStorage.isLoggedIn()) return Result.failure(IllegalStateException("Sign in to Arth first."))

        return try {
            val api = NetworkClient.createArthApi(secureStorage)
            val response = api.getCategories()
            if (response.categories.isNotEmpty()) {
                val entities = response.categories.map { dto ->
                    CategoryEntity(
                        id = dto.id,
                        name = dto.name,
                        icon = dto.icon ?: "🏷️",
                        color = dto.color ?: "#3B82F6",
                        type = dto.type.uppercase(),
                        isDefault = dto.isDefault,
                        sortOrder = dto.sortOrder,
                        isArchived = dto.isArchived
                    )
                }
                categoryDao.insertAll(entities)
            }
            Result.success(response.categories.size)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}

class BalanceRepository(
    private val balancesDao: AccountBalancesDao,
    private val transactionDao: TransactionDao,
    private val context: Context
) {
    fun observeBalances(): Flow<AccountBalances> {
        return balancesDao.observePrimary().map { entity ->
            entity?.toDomain() ?: AccountBalances()
        }
    }

    suspend fun setStartingBalances(cashPaise: Long, onlinePaise: Long) {
        val now = System.currentTimeMillis()
        balancesDao.upsert(
            AccountBalancesEntity(
                id = "primary",
                cashPaise = cashPaise,
                onlinePaise = onlinePaise,
                startingCashPaise = cashPaise,
                startingOnlinePaise = onlinePaise,
                balancesConfiguredAt = now
            )
        )
    }

    suspend fun refreshBalances(): Result<AccountBalances> {
        val secureStorage = SecureStorage(context)
        if (!secureStorage.isLoggedIn()) return Result.failure(IllegalStateException("Sign in to Arth first."))

        return try {
            val api = NetworkClient.createArthApi(secureStorage)
            val dto = api.getBalances()
            val existing = balancesDao.getPrimary()

            val configuredAtMillis = if (!dto.configuredAt.isNullOrBlank()) {
                try {
                    SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.ROOT).apply {
                        timeZone = TimeZone.getTimeZone("UTC")
                    }.parse(dto.configuredAt!!)?.time ?: (existing?.balancesConfiguredAt ?: 0L)
                } catch (_: Exception) {
                    existing?.balancesConfiguredAt ?: 0L
                }
            } else {
                existing?.balancesConfiguredAt ?: 0L
            }

            val entity = AccountBalancesEntity(
                id = "primary",
                cashPaise = dto.cashPaise,
                onlinePaise = dto.onlinePaise,
                startingCashPaise = dto.startingCashPaise,
                startingOnlinePaise = dto.startingOnlinePaise,
                balancesConfiguredAt = configuredAtMillis
            )
            balancesDao.upsert(entity)
            Result.success(entity.toDomain())
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun recordTransfer(amountPaise: Long, fromCash: Boolean, notes: String?) {
        val now = System.currentTimeMillis()
        val fromMode = if (fromCash) PaymentMode.CASH else PaymentMode.ONLINE
        val toMode = if (fromCash) PaymentMode.ONLINE else PaymentMode.CASH

        // Outflow from source account
        val outflow = Transaction(
            id = UUID.randomUUID().toString(),
            amountPaise = amountPaise,
            type = TransactionType.EXPENSE,
            paymentMode = fromMode,
            necessity = NecessityTier.ESSENTIAL,
            categoryId = "cat-other-expense",
            categoryName = "Transfer to ${toMode.label}",
            transactionDate = now,
            notes = notes ?: "Transfer from ${fromMode.label} to ${toMode.label}",
            createdAt = now,
            updatedAt = now
        )

        // Inflow to destination account
        val inflow = Transaction(
            id = UUID.randomUUID().toString(),
            amountPaise = amountPaise,
            type = TransactionType.INCOME,
            paymentMode = toMode,
            necessity = null,
            categoryId = "cat-other-income",
            categoryName = "Transfer from ${fromMode.label}",
            transactionDate = now + 1,
            notes = notes ?: "Transfer received from ${fromMode.label}",
            createdAt = now + 1,
            updatedAt = now + 1
        )

        transactionDao.insert(TransactionEntity.fromDomain(outflow))
        transactionDao.insert(TransactionEntity.fromDomain(inflow))
    }
}

class PeopleRepository(
    private val personDao: PersonDao,
    private val personTransactionDao: PersonTransactionDao,
    private val context: Context? = null
) {
    fun observePeople(): Flow<List<Person>> {
        return personDao.observeAll().map { list -> list.map { it.toDomain() } }
    }

    fun observeTransactionsForPerson(personId: String): Flow<List<PersonTransaction>> {
        return personTransactionDao.observeForPerson(personId).map { list -> list.map { it.toDomain() } }
    }

    suspend fun addPerson(name: String, phone: String?, notes: String?): Person {
        val person = Person(name = name, phone = phone, notes = notes)
        personDao.insert(PersonEntity.fromDomain(person))
        return person
    }

    suspend fun recordPersonTransaction(
        personId: String,
        amountPaise: Long,
        type: PersonTransactionType,
        paymentMode: PaymentMode,
        notes: String?
    ) = recordTransaction(personId, amountPaise, type, paymentMode, notes)

    suspend fun recordTransaction(
        personId: String,
        amountPaise: Long,
        type: PersonTransactionType,
        paymentMode: PaymentMode,
        notes: String?
    ) {
        val tx = PersonTransaction(
            personId = personId,
            amountPaise = amountPaise,
            type = type,
            paymentMode = paymentMode,
            notes = notes
        )
        personTransactionDao.insert(PersonTransactionEntity.fromDomain(tx))

        // Update person aggregate debt
        val person = personDao.getById(personId) ?: return
        val currentBalance = person.totalBalancePaise
        val currentGiven = person.moneyGivenPaise
        val currentReceived = person.moneyReceivedPaise

        val (newBalance, newGiven, newReceived) = when (type) {
            PersonTransactionType.LENT -> Triple(currentBalance + amountPaise, currentGiven + amountPaise, currentReceived)
            PersonTransactionType.BORROWED -> Triple(currentBalance - amountPaise, currentGiven, currentReceived + amountPaise)
            PersonTransactionType.SETTLEMENT -> Triple(0L, currentGiven, currentReceived)
        }
        personDao.update(
            person.copy(
                totalBalancePaise = newBalance,
                moneyGivenPaise = newGiven,
                moneyReceivedPaise = newReceived
            )
        )
    }

    suspend fun refreshPeople() {
        val ctx = context ?: return
        val secureStorage = SecureStorage(ctx)
        if (!secureStorage.isLoggedIn()) return

        try {
            val api = NetworkClient.createArthApi(secureStorage)
            val response = api.getPeople()
            if (response.people.isNotEmpty()) {
                val entities = response.people.map { dto ->
                    PersonEntity(
                        id = dto.id,
                        name = dto.name,
                        phone = null,
                        notes = null,
                        totalBalancePaise = dto.netBalancePaise,
                        moneyGivenPaise = dto.moneyGivenPaise,
                        moneyReceivedPaise = dto.moneyReceivedPaise
                    )
                }
                personDao.insertAll(entities)
            }
        } catch (_: Exception) {
            // Keep local data
        }
    }
}

class SmsSuggestionRepository(
    private val suggestionDao: SmsSuggestionDao,
    private val transactionRepository: TransactionRepository
) {
    fun observePendingSuggestions(): Flow<List<SmsSuggestion>> {
        return suggestionDao.observePending().map { list -> list.map { it.toDomain() } }
    }

    fun observePendingCount(): Flow<Int> {
        return suggestionDao.observePendingCount()
    }

    suspend fun confirmSuggestion(
        suggestion: SmsSuggestion,
        categoryId: String,
        categoryName: String,
        necessity: NecessityTier?
    ) {
        val tx = Transaction(
            id = UUID.randomUUID().toString(),
            amountPaise = suggestion.amountPaise,
            type = suggestion.type,
            paymentMode = suggestion.paymentMode,
            necessity = if (suggestion.type == TransactionType.EXPENSE) (necessity ?: NecessityTier.ESSENTIAL) else null,
            categoryId = categoryId,
            categoryName = categoryName,
            transactionDate = suggestion.smsTimestamp,
            notes = buildString {
                if (!suggestion.refNumber.isNullOrBlank()) append("Ref: ${suggestion.refNumber} ")
                if (!suggestion.sender.isNullOrBlank()) append("(${suggestion.sender})")
            }.trim().takeIf { it.isNotBlank() },
            counterparty = suggestion.merchant
        )

        transactionRepository.addTransaction(tx)
        suggestionDao.updateStatus(suggestion.id, SuggestionStatus.CONFIRMED.name)
    }

    suspend fun dismissSuggestion(suggestionId: String) {
        suggestionDao.updateStatus(suggestionId, SuggestionStatus.DISMISSED.name)
    }
}
