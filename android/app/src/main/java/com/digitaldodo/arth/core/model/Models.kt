package com.digitaldodo.arth.core.model

import kotlinx.serialization.Serializable
import java.util.UUID

enum class TransactionType {
    INCOME, EXPENSE, TRANSFER
}

enum class PaymentMode {
    CASH, ONLINE
}

enum class NecessityTier {
    NEEDS, WANTS, SAVINGS;

    companion object {
        fun fromString(value: String?): NecessityTier = when (value?.uppercase()) {
            "NEEDS" -> NEEDS
            "WANTS" -> WANTS
            "SAVINGS", "INVESTMENTS" -> SAVINGS
            else -> NEEDS
        }
    }
}

enum class SyncStatus {
    SYNCED, PENDING, FAILED
}

enum class PersonTransactionType {
    LENT, BORROWED, SETTLEMENT
}

enum class SuggestionStatus {
    PENDING, CONFIRMED, DISMISSED
}

@Serializable
data class Transaction(
    val id: String = UUID.randomUUID().toString(),
    val userId: String = "",
    val amountPaise: Long = 0L,
    val type: TransactionType = TransactionType.EXPENSE,
    val paymentMode: PaymentMode = PaymentMode.ONLINE,
    val necessity: NecessityTier = NecessityTier.NEEDS,
    val categoryId: String = "",
    val categoryName: String = "",
    val categoryIcon: String = "category",
    val categoryColor: String = "#78716C",
    val transactionDate: Long = System.currentTimeMillis(),
    val notes: String? = null,
    val counterparty: String? = null,
    val isDeleted: Boolean = false,
    val syncStatus: SyncStatus = SyncStatus.PENDING,
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis()
) {
    val formattedAmount: String get() = Money.formatPaise(amountPaise, showSign = (type == TransactionType.INCOME))
}

@Serializable
data class Category(
    val id: String = UUID.randomUUID().toString(),
    val name: String = "",
    val icon: String = "category",
    val color: String = "#3B82F6",
    val type: TransactionType = TransactionType.EXPENSE,
    val isSystem: Boolean = false,
    val sortOrder: Int = 0,
    val monthlyBudgetPaise: Long = 0L
)

@Serializable
data class AccountBalances(
    val id: String = "primary",
    val cashPaise: Long = 0L,
    val onlinePaise: Long = 0L,
    val balancesConfiguredAt: Long = 0L
) {
    val totalPaise: Long get() = cashPaise + onlinePaise
    val formattedTotal: String get() = Money.formatPaise(totalPaise)
    val formattedCash: String get() = Money.formatPaise(cashPaise)
    val formattedOnline: String get() = Money.formatPaise(onlinePaise)
}

@Serializable
data class Person(
    val id: String = UUID.randomUUID().toString(),
    val name: String = "",
    val phone: String? = null,
    val notes: String? = null,
    val totalBalancePaise: Long = 0L, // Positive = they owe user; Negative = user owes them
    val createdAt: Long = System.currentTimeMillis()
) {
    val formattedBalance: String get() = Money.formatPaise(kotlin.math.abs(totalBalancePaise))
    val isOwedToUser: Boolean get() = totalBalancePaise > 0
    val isUserOwing: Boolean get() = totalBalancePaise < 0
    val isSettled: Boolean get() = totalBalancePaise == 0L
}

@Serializable
data class PersonTransaction(
    val id: String = UUID.randomUUID().toString(),
    val personId: String = "",
    val amountPaise: Long = 0L,
    val type: PersonTransactionType = PersonTransactionType.LENT,
    val paymentMode: PaymentMode = PaymentMode.ONLINE,
    val notes: String? = null,
    val transactionDate: Long = System.currentTimeMillis(),
    val createdAt: Long = System.currentTimeMillis()
)

@Serializable
data class SmsSuggestion(
    val id: String = UUID.randomUUID().toString(),
    val sender: String = "",
    val amountPaise: Long = 0L,
    val type: TransactionType = TransactionType.EXPENSE,
    val paymentMode: PaymentMode = PaymentMode.ONLINE,
    val merchant: String? = null,
    val refNumber: String? = null,
    val smsTimestamp: Long = System.currentTimeMillis(),
    val confidence: Int = 80,
    val status: SuggestionStatus = SuggestionStatus.PENDING
) {
    val formattedAmount: String get() = Money.formatPaise(amountPaise)
}

@Serializable
data class SyncOutboxItem(
    val id: Long = 0L,
    val entityType: String,
    val entityId: String,
    val operation: String,
    val payloadJson: String,
    val attempts: Int = 0,
    val lastError: String? = null,
    val createdAt: Long = System.currentTimeMillis()
)

data class DashboardSummary(
    val totalBalancePaise: Long = 0L,
    val cashBalancePaise: Long = 0L,
    val onlineBalancePaise: Long = 0L,
    val totalIncomePaise: Long = 0L,
    val totalExpensePaise: Long = 0L,
    val netSavingsPaise: Long = 0L,
    val needsExpensePaise: Long = 0L,
    val wantsExpensePaise: Long = 0L,
    val savingsExpensePaise: Long = 0L,
    val recentTransactions: List<Transaction> = emptyList(),
    val pendingSmsCount: Int = 0
)
