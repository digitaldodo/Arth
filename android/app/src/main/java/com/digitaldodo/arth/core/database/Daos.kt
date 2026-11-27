package com.digitaldodo.arth.core.database

import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Dao
interface TransactionDao {
    @Query("""
        SELECT * FROM transactions 
        WHERE isDeleted = 0 
        ORDER BY transactionDate DESC, createdAt DESC, id DESC
    """)
    fun observeAll(): Flow<List<TransactionEntity>>

    @Query("""
        SELECT * FROM transactions 
        WHERE isDeleted = 0 
        ORDER BY transactionDate DESC, createdAt DESC, id DESC 
        LIMIT :limit
    """)
    fun observeRecent(limit: Int): Flow<List<TransactionEntity>>

    @Query("""
        SELECT * FROM transactions 
        WHERE isDeleted = 0 
          AND transactionDate >= :startDate 
          AND transactionDate <= :endDate
        ORDER BY transactionDate DESC, createdAt DESC, id DESC
    """)
    fun observeByDateRange(startDate: Long, endDate: Long): Flow<List<TransactionEntity>>

    @Query("""
        SELECT * FROM transactions 
        WHERE isDeleted = 0 
          AND (categoryName LIKE '%' || :query || '%' 
               OR notes LIKE '%' || :query || '%' 
               OR counterparty LIKE '%' || :query || '%')
        ORDER BY transactionDate DESC, createdAt DESC, id DESC
    """)
    fun searchTransactions(query: String): Flow<List<TransactionEntity>>

    @Query("SELECT * FROM transactions WHERE id = :id LIMIT 1")
    suspend fun getById(id: String): TransactionEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(transaction: TransactionEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(transactions: List<TransactionEntity>)

    @Update
    suspend fun update(transaction: TransactionEntity)

    @Query("UPDATE transactions SET isDeleted = 1, updatedAt = :updatedAt, syncStatus = 'PENDING' WHERE id = :id")
    suspend fun softDelete(id: String, updatedAt: Long = System.currentTimeMillis())

    @Query("SELECT * FROM transactions WHERE isDeleted = 0")
    suspend fun getAllActive(): List<TransactionEntity>

    // Financial calculations adhering to baseline snapshot rule:
    // Only transactions with transactionDate > balancesConfiguredAt affect current balance!
    @Query("""
        SELECT COALESCE(SUM(amountPaise), 0) FROM transactions 
        WHERE isDeleted = 0 
          AND type = 'INCOME' 
          AND paymentMode = :paymentMode 
          AND transactionDate > :configuredAt
    """)
    suspend fun getPostBaselineIncome(paymentMode: String, configuredAt: Long): Long

    @Query("""
        SELECT COALESCE(SUM(amountPaise), 0) FROM transactions 
        WHERE isDeleted = 0 
          AND type = 'EXPENSE' 
          AND paymentMode = :paymentMode 
          AND transactionDate > :configuredAt
    """)
    suspend fun getPostBaselineExpense(paymentMode: String, configuredAt: Long): Long

    // Aggregations for period-specific reporting (e.g. Current Month or Lifetime)
    @Query("""
        SELECT COALESCE(SUM(amountPaise), 0) FROM transactions 
        WHERE isDeleted = 0 
          AND type = 'INCOME' 
          AND transactionDate >= :startDate 
          AND transactionDate <= :endDate
    """)
    fun observePeriodIncome(startDate: Long, endDate: Long): Flow<Long>

    @Query("""
        SELECT COALESCE(SUM(amountPaise), 0) FROM transactions 
        WHERE isDeleted = 0 
          AND type = 'EXPENSE' 
          AND transactionDate >= :startDate 
          AND transactionDate <= :endDate
    """)
    fun observePeriodExpense(startDate: Long, endDate: Long): Flow<Long>

    @Query("""
        SELECT COALESCE(SUM(amountPaise), 0) FROM transactions 
        WHERE isDeleted = 0 
          AND type = 'EXPENSE' 
          AND necessity = :necessity 
          AND transactionDate >= :startDate 
          AND transactionDate <= :endDate
    """)
    fun observeNecessityExpense(necessity: String, startDate: Long, endDate: Long): Flow<Long>

    @Query("""
        SELECT * FROM transactions 
        WHERE isDeleted = 0 
          AND amountPaise = :amountPaise 
          AND ABS(transactionDate - :date) <= :windowMillis 
        LIMIT 5
    """)
    suspend fun findPotentialDuplicates(amountPaise: Long, date: Long, windowMillis: Long = 172800000L): List<TransactionEntity>

    @Query("""
        SELECT * FROM transactions 
        WHERE isDeleted = 0 
          AND (notes LIKE '%' || :refNumber || '%' OR counterparty LIKE '%' || :refNumber || '%') 
        LIMIT 1
    """)
    suspend fun findByReference(refNumber: String): TransactionEntity?
}

@Dao
interface CategoryDao {
    @Query("SELECT * FROM categories ORDER BY sortOrder ASC, name ASC")
    fun observeAll(): Flow<List<CategoryEntity>>

    @Query("SELECT * FROM categories ORDER BY sortOrder ASC, name ASC")
    suspend fun getAllDirect(): List<CategoryEntity>

    @Query("SELECT * FROM categories WHERE id = :id LIMIT 1")
    suspend fun getById(id: String): CategoryEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(category: CategoryEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(categories: List<CategoryEntity>)

    @Query("DELETE FROM categories WHERE id = :id AND isDefault = 0")
    suspend fun delete(id: String)
}

@Dao
interface AccountBalancesDao {
    @Query("SELECT * FROM account_balances WHERE id = 'primary' LIMIT 1")
    fun observePrimary(): Flow<AccountBalancesEntity?>

    @Query("SELECT * FROM account_balances WHERE id = 'primary' LIMIT 1")
    suspend fun getPrimary(): AccountBalancesEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(balances: AccountBalancesEntity)
}

@Dao
interface PersonDao {
    @Query("SELECT * FROM people ORDER BY createdAt DESC")
    fun observeAll(): Flow<List<PersonEntity>>

    @Query("SELECT * FROM people WHERE id = :id LIMIT 1")
    suspend fun getById(id: String): PersonEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(person: PersonEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(people: List<PersonEntity>)

    @Update
    suspend fun update(person: PersonEntity)

    @Query("DELETE FROM people WHERE id = :id")
    suspend fun delete(id: String)
}

@Dao
interface PersonTransactionDao {
    @Query("SELECT * FROM person_transactions WHERE personId = :personId ORDER BY transactionDate DESC, createdAt DESC")
    fun observeForPerson(personId: String): Flow<List<PersonTransactionEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(transaction: PersonTransactionEntity)

    @Query("DELETE FROM person_transactions WHERE id = :id")
    suspend fun delete(id: String)
}

@Dao
interface SmsSuggestionDao {
    @Query("SELECT * FROM sms_suggestions WHERE status = 'PENDING' ORDER BY smsTimestamp DESC")
    fun observePending(): Flow<List<SmsSuggestionEntity>>

    @Query("SELECT COUNT(*) FROM sms_suggestions WHERE status = 'PENDING'")
    fun observePendingCount(): Flow<Int>

    @Query("SELECT COUNT(*) FROM sms_suggestions WHERE status = 'CONFIRMED'")
    fun observeConfirmedCount(): Flow<Int>

    @Query("SELECT COUNT(*) FROM sms_suggestions WHERE status = 'DISMISSED'")
    fun observeDismissedCount(): Flow<Int>

    @Query("SELECT COUNT(*) FROM sms_suggestions")
    fun observeTotalCount(): Flow<Int>

    @Query("SELECT * FROM sms_suggestions WHERE id = :id LIMIT 1")
    suspend fun getById(id: String): SmsSuggestionEntity?

    @Query("SELECT * FROM sms_suggestions WHERE refNumber = :refNumber LIMIT 1")
    suspend fun findByRefNumber(refNumber: String): SmsSuggestionEntity?

    @Query("SELECT * FROM sms_suggestions WHERE amountPaise = :amountPaise AND ABS(smsTimestamp - :timestamp) < :windowMillis LIMIT 1")
    suspend fun findNearMatch(amountPaise: Long, timestamp: Long, windowMillis: Long = 60000L): SmsSuggestionEntity?

    @Query("SELECT * FROM sms_suggestions WHERE amountPaise = :amountPaise AND ABS(smsTimestamp - :timestamp) <= :windowMillis")
    suspend fun findNearMatches(amountPaise: Long, timestamp: Long, windowMillis: Long = 300000L): List<SmsSuggestionEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(suggestion: SmsSuggestionEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(suggestions: List<SmsSuggestionEntity>)

    @Update
    suspend fun update(suggestion: SmsSuggestionEntity)

    @Query("UPDATE sms_suggestions SET status = :status WHERE id = :id")
    suspend fun updateStatus(id: String, status: String)

    @Query("DELETE FROM sms_suggestions WHERE id = :id")
    suspend fun delete(id: String)

    @Query("DELETE FROM sms_suggestions WHERE status IN ('PENDING', 'DISMISSED')")
    suspend fun deleteUnconfirmed()

    @Query("DELETE FROM sms_suggestions")
    suspend fun deleteAll()
}

@Dao
interface SyncOutboxDao {
    @Query("SELECT * FROM sync_outbox ORDER BY id ASC LIMIT :limit")
    suspend fun getPending(limit: Int = 50): List<SyncOutboxEntity>

    @Query("SELECT COUNT(*) FROM sync_outbox")
    fun observePendingCount(): Flow<Int>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(item: SyncOutboxEntity): Long

    @Query("DELETE FROM sync_outbox WHERE id = :id")
    suspend fun deleteById(id: Long)

    @Query("UPDATE sync_outbox SET attempts = attempts + 1, lastError = :error WHERE id = :id")
    suspend fun recordAttempt(id: Long, error: String)
}
