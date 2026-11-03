package com.digitaldodo.arth.data.repository

import android.content.Context
import androidx.work.*
import com.digitaldodo.arth.core.database.*
import com.digitaldodo.arth.core.model.*
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

        // Enqueue outbox sync payload
        val sdfDate = SimpleDateFormat("yyyy-MM-dd", Locale.ROOT)
        val sdfTime = SimpleDateFormat("HH:mm", Locale.ROOT)
        val dateObj = Date(transaction.transactionDate)

        val amountRupees = String.format(Locale.ROOT, "%.2f", transaction.amountPaise / 100.0)
        val payload = mapOf(
            "id" to transaction.id,
            "amount" to amountRupees,
            "direction" to if (transaction.type == TransactionType.INCOME) "income" else "expense",
            "merchant" to (transaction.counterparty ?: transaction.categoryName),
            "transaction_date" to sdfDate.format(dateObj),
            "transaction_time" to sdfTime.format(dateObj),
            "payment_method" to (if (transaction.paymentMode == PaymentMode.CASH) "Cash" else "Online"),
            "category_id" to transaction.categoryId,
            "necessity" to transaction.necessity.name,
            "notes" to transaction.notes.orEmpty()
        )

        outboxDao.insert(
            SyncOutboxEntity(
                entityType = "TRANSACTION",
                entityId = transaction.id,
                operation = "INSERT",
                payloadJson = json.encodeToString(payload)
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
    private val categoryDao: CategoryDao
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
                balancesConfiguredAt = now
            )
        )
    }

    suspend fun recordTransfer(amountPaise: Long, fromCash: Boolean, notes: String?) {
        val now = System.currentTimeMillis()
        val fromMode = if (fromCash) PaymentMode.CASH else PaymentMode.ONLINE
        val toMode = if (fromCash) PaymentMode.ONLINE else PaymentMode.CASH

        // Outflow from source account
        val outflow = Transaction(
            id = UUID.randomUUID().toString(),
            amountPaise = amountPaise,
            type = TransactionType.TRANSFER,
            paymentMode = fromMode,
            necessity = NecessityTier.NEEDS,
            categoryId = "cat-misc-expense",
            categoryName = "Transfer to $toMode",
            transactionDate = now,
            notes = notes ?: "Transfer from $fromMode to $toMode",
            createdAt = now,
            updatedAt = now
        )

        // Inflow to destination account
        val inflow = Transaction(
            id = UUID.randomUUID().toString(),
            amountPaise = amountPaise,
            type = TransactionType.INCOME,
            paymentMode = toMode,
            necessity = NecessityTier.NEEDS,
            categoryId = "cat-misc-income",
            categoryName = "Transfer from $fromMode",
            transactionDate = now + 1, // ensure sequence
            notes = notes ?: "Transfer received from $fromMode",
            createdAt = now + 1,
            updatedAt = now + 1
        )

        transactionDao.insert(TransactionEntity.fromDomain(outflow))
        transactionDao.insert(TransactionEntity.fromDomain(inflow))
    }
}

class PeopleRepository(
    private val personDao: PersonDao,
    private val personTransactionDao: PersonTransactionDao
) {
    fun observePeople(): Flow<List<Person>> {
        return personDao.observeAll().map { list -> list.map { it.toDomain() } }
    }

    suspend fun addPerson(name: String, phone: String?, notes: String?): Person {
        val person = Person(name = name, phone = phone, notes = notes)
        personDao.insert(PersonEntity.fromDomain(person))
        return person
    }

    fun observeTransactionsForPerson(personId: String): Flow<List<PersonTransaction>> {
        return personTransactionDao.observeForPerson(personId).map { list -> list.map { it.toDomain() } }
    }

    suspend fun recordPersonTransaction(
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
        val newBalance = when (type) {
            PersonTransactionType.LENT -> currentBalance + amountPaise
            PersonTransactionType.BORROWED -> currentBalance - amountPaise
            PersonTransactionType.SETTLEMENT -> 0L
        }
        personDao.update(person.copy(totalBalancePaise = newBalance))
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
        necessity: NecessityTier
    ) {
        // Create actual transaction
        val tx = Transaction(
            id = UUID.randomUUID().toString(),
            amountPaise = suggestion.amountPaise,
            type = suggestion.type,
            paymentMode = suggestion.paymentMode,
            necessity = necessity,
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
