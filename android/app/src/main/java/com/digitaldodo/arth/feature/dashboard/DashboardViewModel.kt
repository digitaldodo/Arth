package com.digitaldodo.arth.feature.dashboard

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.digitaldodo.arth.core.database.ArthDatabase
import com.digitaldodo.arth.core.model.*
import com.digitaldodo.arth.data.repository.BalanceRepository
import com.digitaldodo.arth.data.repository.SmsSuggestionRepository
import com.digitaldodo.arth.data.repository.TransactionRepository
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.util.Calendar

enum class DashboardPeriod {
    THIS_MONTH, LAST_30_DAYS, LIFETIME
}

data class DashboardUiState(
    val period: DashboardPeriod = DashboardPeriod.THIS_MONTH,
    val totalBalancePaise: Long = 0L,
    val cashBalancePaise: Long = 0L,
    val onlineBalancePaise: Long = 0L,
    val periodIncomePaise: Long = 0L,
    val periodExpensePaise: Long = 0L,
    val needsExpensePaise: Long = 0L,
    val wantsExpensePaise: Long = 0L,
    val savingsExpensePaise: Long = 0L,
    val recentTransactions: List<Transaction> = emptyList(),
    val pendingSmsCount: Int = 0,
    val isLoading: Boolean = false
) {
    val netSavingsPaise: Long get() = periodIncomePaise - periodExpensePaise
}

class DashboardViewModel(application: Application) : AndroidViewModel(application) {
    private val db = ArthDatabase.getInstance(application)
    private val transactionRepo = TransactionRepository(
        db.transactionDao(),
        db.accountBalancesDao(),
        db.syncOutboxDao(),
        application
    )
    private val smsRepo = SmsSuggestionRepository(db.smsSuggestionDao(), transactionRepo)

    private val _period = MutableStateFlow(DashboardPeriod.THIS_MONTH)
    val period = _period.asStateFlow()

    private val _uiState = MutableStateFlow(DashboardUiState())
    val uiState = _uiState.asStateFlow()

    init {
        loadDashboard()
    }

    fun setPeriod(period: DashboardPeriod) {
        _period.value = period
        loadDashboard()
    }

    fun refresh() {
        loadDashboard()
    }

    private fun loadDashboard() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }

            // 1. Calculate active account balances
            val balances = transactionRepo.calculateBalances()

            // 2. Observe pending SMS suggestions count
            smsRepo.observePendingCount().collectLatest { count ->
                _uiState.update { it.copy(pendingSmsCount = count) }
            }
        }

        viewModelScope.launch {
            combine(
                transactionRepo.observeAllTransactions(),
                _period
            ) { transactions, selectedPeriod ->
                val now = System.currentTimeMillis()
                val (startDate, endDate) = when (selectedPeriod) {
                    DashboardPeriod.THIS_MONTH -> {
                        val cal = Calendar.getInstance().apply {
                            set(Calendar.DAY_OF_MONTH, 1)
                            set(Calendar.HOUR_OF_DAY, 0)
                            set(Calendar.MINUTE, 0)
                            set(Calendar.SECOND, 0)
                            set(Calendar.MILLISECOND, 0)
                        }
                        cal.timeInMillis to now
                    }
                    DashboardPeriod.LAST_30_DAYS -> {
                        (now - 30L * 24 * 60 * 60 * 1000) to now
                    }
                    DashboardPeriod.LIFETIME -> {
                        0L to Long.MAX_VALUE
                    }
                }

                val periodTxs = transactions.filter { it.transactionDate in startDate..endDate }

                var income = 0L
                var expense = 0L
                var needs = 0L
                var wants = 0L
                var savings = 0L

                for (tx in periodTxs) {
                    if (tx.type == TransactionType.INCOME) {
                        income += tx.amountPaise
                    } else if (tx.type == TransactionType.EXPENSE) {
                        expense += tx.amountPaise
                        when (tx.necessity) {
                            NecessityTier.NEEDS -> needs += tx.amountPaise
                            NecessityTier.WANTS -> wants += tx.amountPaise
                            NecessityTier.SAVINGS -> savings += tx.amountPaise
                        }
                    }
                }

                val balances = transactionRepo.calculateBalances()

                DashboardUiState(
                    period = selectedPeriod,
                    totalBalancePaise = balances.totalPaise,
                    cashBalancePaise = balances.cashPaise,
                    onlineBalancePaise = balances.onlinePaise,
                    periodIncomePaise = income,
                    periodExpensePaise = expense,
                    needsExpensePaise = needs,
                    wantsExpensePaise = wants,
                    savingsExpensePaise = savings,
                    recentTransactions = transactions.take(6),
                    pendingSmsCount = _uiState.value.pendingSmsCount,
                    isLoading = false
                )
            }.collect { newState ->
                _uiState.value = newState
            }
        }
    }
}
