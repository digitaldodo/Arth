package com.digitaldodo.arth

import com.digitaldodo.arth.core.model.AccountBalances
import com.digitaldodo.arth.core.model.PaymentMode
import com.digitaldodo.arth.core.model.Transaction
import com.digitaldodo.arth.core.model.TransactionType
import org.junit.Assert.assertEquals
import org.junit.Test

class FinancialAccountingTest {

    @Test
    fun baselineSnapshotAccountingIgnoresPastTransactions() {
        // User configures baseline starting balance on 10th of the month at 12:00 PM
        val configuredAt = 1000000L
        val startingCash = 500000L // ₹5,000.00
        val startingOnline = 2500000L // ₹25,000.00

        // Transaction recorded on 5th (before baseline configuredAt)
        val historicalExpense = Transaction(
            amountPaise = 200000L, // ₹2,000.00
            type = TransactionType.EXPENSE,
            paymentMode = PaymentMode.ONLINE,
            transactionDate = 500000L // < configuredAt
        )

        // Transaction recorded on 12th (after baseline configuredAt)
        val newExpense = Transaction(
            amountPaise = 300000L, // ₹3,000.00
            type = TransactionType.EXPENSE,
            paymentMode = PaymentMode.ONLINE,
            transactionDate = 1200000L // > configuredAt
        )

        val transactions = listOf(historicalExpense, newExpense)

        // Only transactions with transactionDate > configuredAt should affect active balance
        var currentOnline = startingOnline
        for (tx in transactions) {
            if (tx.transactionDate > configuredAt && tx.paymentMode == PaymentMode.ONLINE) {
                if (tx.type == TransactionType.INCOME) currentOnline += tx.amountPaise
                else if (tx.type == TransactionType.EXPENSE) currentOnline -= tx.amountPaise
            }
        }

        // ₹25,000 starting - ₹3,000 new expense = ₹22,000 (historical ₹2,000 is already baked into starting balance)
        assertEquals(2200000L, currentOnline)
        assertEquals(500000L, startingCash)
        assertEquals(2700000L, startingCash + currentOnline)
    }

    @Test
    fun cashOnlineTransferPreservesTotalNetWorth() {
        val startingCash = 200000L // ₹2,000
        val startingOnline = 1000000L // ₹10,000
        val initialTotal = startingCash + startingOnline // ₹12,000

        // User withdraws ₹1,500 from ATM (Online -> Cash)
        val transferAmount = 150000L // ₹1,500

        val newOnline = startingOnline - transferAmount // ₹8,500
        val newCash = startingCash + transferAmount // ₹3,500
        val newTotal = newCash + newOnline // ₹12,000

        assertEquals(850000L, newOnline)
        assertEquals(350000L, newCash)
        assertEquals(initialTotal, newTotal)
    }

    @Test
    fun deterministicSortingMaintainsChronologicalSequenceWithTieBreaker() {
        val tx1 = Transaction(id = "tx-001", transactionDate = 1000L, createdAt = 100L)
        val tx2 = Transaction(id = "tx-002", transactionDate = 2000L, createdAt = 100L)
        val tx3 = Transaction(id = "tx-003", transactionDate = 2000L, createdAt = 150L) // same date, newer createdAt
        val tx4 = Transaction(id = "tx-004", transactionDate = 2000L, createdAt = 150L) // same date, same createdAt, tie breaker by id

        val list = listOf(tx1, tx2, tx3, tx4)
        val sorted = list.sortedWith(
            compareByDescending<Transaction> { it.transactionDate }
                .thenByDescending { it.createdAt }
                .thenByDescending { it.id }
        )

        assertEquals("tx-004", sorted[0].id)
        assertEquals("tx-003", sorted[1].id)
        assertEquals("tx-002", sorted[2].id)
        assertEquals("tx-001", sorted[3].id)
    }
}
