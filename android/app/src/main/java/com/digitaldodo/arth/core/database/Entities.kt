package com.digitaldodo.arth.core.database

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import com.digitaldodo.arth.core.model.*

@Entity(
    tableName = "transactions",
    indices = [
        Index(value = ["transactionDate", "createdAt", "id"], name = "idx_tx_sort"),
        Index(value = ["categoryId"], name = "idx_tx_category"),
        Index(value = ["isDeleted"], name = "idx_tx_deleted")
    ]
)
data class TransactionEntity(
    @PrimaryKey val id: String,
    val userId: String,
    val amountPaise: Long,
    val type: String,
    val paymentMode: String,
    val necessity: String,
    val categoryId: String,
    val categoryName: String,
    val categoryIcon: String,
    val categoryColor: String,
    val transactionDate: Long,
    val notes: String?,
    val counterparty: String?,
    val isDeleted: Boolean = false,
    val syncStatus: String = SyncStatus.PENDING.name,
    val createdAt: Long,
    val updatedAt: Long
) {
    fun toDomain(): Transaction = Transaction(
        id = id,
        userId = userId,
        amountPaise = amountPaise,
        type = runCatching { TransactionType.valueOf(type) }.getOrDefault(TransactionType.EXPENSE),
        paymentMode = runCatching { PaymentMode.valueOf(paymentMode) }.getOrDefault(PaymentMode.ONLINE),
        necessity = NecessityTier.fromString(necessity),
        categoryId = categoryId,
        categoryName = categoryName,
        categoryIcon = categoryIcon,
        categoryColor = categoryColor,
        transactionDate = transactionDate,
        notes = notes,
        counterparty = counterparty,
        isDeleted = isDeleted,
        syncStatus = runCatching { SyncStatus.valueOf(syncStatus) }.getOrDefault(SyncStatus.PENDING),
        createdAt = createdAt,
        updatedAt = updatedAt
    )

    companion object {
        fun fromDomain(domain: Transaction): TransactionEntity = TransactionEntity(
            id = domain.id,
            userId = domain.userId,
            amountPaise = domain.amountPaise,
            type = domain.type.name,
            paymentMode = domain.paymentMode.name,
            necessity = domain.necessity.name,
            categoryId = domain.categoryId,
            categoryName = domain.categoryName,
            categoryIcon = domain.categoryIcon,
            categoryColor = domain.categoryColor,
            transactionDate = domain.transactionDate,
            notes = domain.notes,
            counterparty = domain.counterparty,
            isDeleted = domain.isDeleted,
            syncStatus = domain.syncStatus.name,
            createdAt = domain.createdAt,
            updatedAt = domain.updatedAt
        )
    }
}

@Entity(tableName = "categories")
data class CategoryEntity(
    @PrimaryKey val id: String,
    val name: String,
    val icon: String,
    val color: String,
    val type: String,
    val isSystem: Boolean,
    val sortOrder: Int,
    val monthlyBudgetPaise: Long = 0L
) {
    fun toDomain(): Category = Category(
        id = id,
        name = name,
        icon = icon,
        color = color,
        type = runCatching { TransactionType.valueOf(type) }.getOrDefault(TransactionType.EXPENSE),
        isSystem = isSystem,
        sortOrder = sortOrder,
        monthlyBudgetPaise = monthlyBudgetPaise
    )

    companion object {
        fun fromDomain(domain: Category): CategoryEntity = CategoryEntity(
            id = domain.id,
            name = domain.name,
            icon = domain.icon,
            color = domain.color,
            type = domain.type.name,
            isSystem = domain.isSystem,
            sortOrder = domain.sortOrder,
            monthlyBudgetPaise = domain.monthlyBudgetPaise
        )
    }
}

@Entity(tableName = "account_balances")
data class AccountBalancesEntity(
    @PrimaryKey val id: String = "primary",
    val cashPaise: Long = 0L,
    val onlinePaise: Long = 0L,
    val balancesConfiguredAt: Long = 0L
) {
    fun toDomain(): AccountBalances = AccountBalances(
        id = id,
        cashPaise = cashPaise,
        onlinePaise = onlinePaise,
        balancesConfiguredAt = balancesConfiguredAt
    )

    companion object {
        fun fromDomain(domain: AccountBalances): AccountBalancesEntity = AccountBalancesEntity(
            id = domain.id,
            cashPaise = domain.cashPaise,
            onlinePaise = domain.onlinePaise,
            balancesConfiguredAt = domain.balancesConfiguredAt
        )
    }
}

@Entity(tableName = "people")
data class PersonEntity(
    @PrimaryKey val id: String,
    val name: String,
    val phone: String?,
    val notes: String?,
    val totalBalancePaise: Long = 0L,
    val createdAt: Long = System.currentTimeMillis()
) {
    fun toDomain(): Person = Person(
        id = id,
        name = name,
        phone = phone,
        notes = notes,
        totalBalancePaise = totalBalancePaise,
        createdAt = createdAt
    )

    companion object {
        fun fromDomain(domain: Person): PersonEntity = PersonEntity(
            id = domain.id,
            name = domain.name,
            phone = domain.phone,
            notes = domain.notes,
            totalBalancePaise = domain.totalBalancePaise,
            createdAt = domain.createdAt
        )
    }
}

@Entity(
    tableName = "person_transactions",
    indices = [Index(value = ["personId", "transactionDate"], name = "idx_person_tx")]
)
data class PersonTransactionEntity(
    @PrimaryKey val id: String,
    val personId: String,
    val amountPaise: Long,
    val type: String,
    val paymentMode: String,
    val notes: String?,
    val transactionDate: Long,
    val createdAt: Long
) {
    fun toDomain(): PersonTransaction = PersonTransaction(
        id = id,
        personId = personId,
        amountPaise = amountPaise,
        type = runCatching { PersonTransactionType.valueOf(type) }.getOrDefault(PersonTransactionType.LENT),
        paymentMode = runCatching { PaymentMode.valueOf(paymentMode) }.getOrDefault(PaymentMode.ONLINE),
        notes = notes,
        transactionDate = transactionDate,
        createdAt = createdAt
    )

    companion object {
        fun fromDomain(domain: PersonTransaction): PersonTransactionEntity = PersonTransactionEntity(
            id = domain.id,
            personId = domain.personId,
            amountPaise = domain.amountPaise,
            type = domain.type.name,
            paymentMode = domain.paymentMode.name,
            notes = domain.notes,
            transactionDate = domain.transactionDate,
            createdAt = domain.createdAt
        )
    }
}

@Entity(
    tableName = "sms_suggestions",
    indices = [Index(value = ["status", "smsTimestamp"], orders = [Index.Order.ASC, Index.Order.DESC], name = "idx_sms_status")]
)
data class SmsSuggestionEntity(
    @PrimaryKey val id: String,
    val sender: String,
    val amountPaise: Long,
    val type: String,
    val paymentMode: String,
    val merchant: String?,
    val refNumber: String?,
    val smsTimestamp: Long,
    val confidence: Int,
    val status: String = SuggestionStatus.PENDING.name
) {
    fun toDomain(): SmsSuggestion = SmsSuggestion(
        id = id,
        sender = sender,
        amountPaise = amountPaise,
        type = runCatching { TransactionType.valueOf(type) }.getOrDefault(TransactionType.EXPENSE),
        paymentMode = runCatching { PaymentMode.valueOf(paymentMode) }.getOrDefault(PaymentMode.ONLINE),
        merchant = merchant,
        refNumber = refNumber,
        smsTimestamp = smsTimestamp,
        confidence = confidence,
        status = runCatching { SuggestionStatus.valueOf(status) }.getOrDefault(SuggestionStatus.PENDING)
    )

    companion object {
        fun fromDomain(domain: SmsSuggestion): SmsSuggestionEntity = SmsSuggestionEntity(
            id = domain.id,
            sender = domain.sender,
            amountPaise = domain.amountPaise,
            type = domain.type.name,
            paymentMode = domain.paymentMode.name,
            merchant = domain.merchant,
            refNumber = domain.refNumber,
            smsTimestamp = domain.smsTimestamp,
            confidence = domain.confidence,
            status = domain.status.name
        )
    }
}

@Entity(tableName = "sync_outbox")
data class SyncOutboxEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0L,
    val entityType: String,
    val entityId: String,
    val operation: String,
    val payloadJson: String,
    val attempts: Int = 0,
    val lastError: String? = null,
    val createdAt: Long = System.currentTimeMillis()
)
