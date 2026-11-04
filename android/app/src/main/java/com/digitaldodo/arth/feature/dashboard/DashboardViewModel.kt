package com.digitaldodo.arth.feature.dashboard

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.digitaldodo.arth.core.database.ArthDatabase
import com.digitaldodo.arth.core.model.*
import com.digitaldodo.arth.core.network.CategorySpendingDto
import com.digitaldodo.arth.core.security.SecureStorage
import com.digitaldodo.arth.core.sync.AccountSyncService
import com.digitaldodo.arth.data.repository.BalanceRepository
import com.digitaldodo.arth.data.repository.SmsSuggestionRepository
import com.digitaldodo.arth.data.repository.TransactionRepository
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.util.Calendar

enum class DashboardPeriod(val label: String) {
    THIS_MONTH("This Month"),
    LAST_30_DAYS("Last 30 Days"),
    LIFETIME("Lifetime")
}

sealed class DashboardDataState {
    object InitialLoading : DashboardDataState()
    data class FreshServerData(val lastSyncedAt: Long) : DashboardDataState()
    data class CachedData(val lastSyncedAt: Long) : DashboardDataState()
    object EmptyAccount : DashboardDataState()
    data class SyncError(val message: String) : DashboardDataState()
}

data class DashboardUiState(
    val dataState: DashboardDataState = DashboardDataState.InitialLoading,
    val period: DashboardPeriod = DashboardPeriod.THIS_MONTH,
    val totalBalancePaise: Long = 0L,
    val cashBalancePaise: Long = 0L,
    val onlineBalancePaise: Long = 0L,
    val startingCashPaise: Long = 0L,
    val startingOnlinePaise: Long = 0L,
    val balancesConfigured: Boolean = false,
    val periodIncomePaise: Long = 0L,
    val periodExpensePaise: Long = 0L,
    val essentialExpensePaise: Long = 0L,
    val optionalExpensePaise: Long = 0L,
    val luxuryExpensePaise: Long = 0L,
    val recentTransactions: List<Transaction> = emptyList(),
    val spendingComposition: List<CategorySpendingDto> = emptyList(),
    val pendingSmsCount: Int = 0,
    val isRefreshing: Boolean = false,
    val lastSyncedAt: Long = 0L
) {
    val netCashFlowPaise: Long get() = periodIncomePaise - periodExpensePaise
}

class DashboardViewModel(application: Application) : AndroidViewModel(application) {
    private val db = ArthDatabase.getInstance(application)
    private val transactionRepo = TransactionRepository(
        db.transactionDao(),
        db.accountBalancesDao(),
        db.syncOutboxDao(),
        application
    )
    private val balanceRepo = BalanceRepository(
        db.accountBalancesDao(),
        db.transactionDao(),
        application
    )
    private val smsRepo = SmsSuggestionRepository(db.smsSuggestionDao(), transactionRepo)
    private val syncService = AccountSyncService.getInstance(application)
    private val secureStorage = SecureStorage(application)

    private val _period = MutableStateFlow(DashboardPeriod.THIS_MONTH)
    val period = _period.asStateFlow()

    private val _uiState = MutableStateFlow(DashboardUiState())
    val uiState = _uiState.asStateFlow()

    init {
        loadDashboard()
        refresh()
    }

    fun setPeriod(period: DashboardPeriod) {
        _period.value = period
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isRefreshing = true) }
            val syncResult = syncService.syncAll()
            val lastSync = secureStorage.getLastSyncTimestamp()

            if (syncResult.isFailure && _uiState.value.recentTransactions.isEmpty()) {
                val err = syncResult.exceptionOrNull()?.message ?: "Failed to synchronize with server"
                _uiState.update {
                    it.copy(
                        isRefreshing = false,
                        dataState = DashboardDataState.SyncError(err)
                    )
                }
            } else {
                _uiState.update {
                    it.copy(
                        isRefreshing = false,
                        lastSyncedAt = lastSync,
                        dataState = if (syncResult.isSuccess) {
                            if (it.recentTransactions.isEmpty() && it.totalBalancePaise == 0L) {
                                DashboardDataState.EmptyAccount
                            } else {
                                DashboardDataState.FreshServerData(lastSync)
                            }
                        } else {
                            DashboardDataState.CachedData(lastSync)
                        }
                    )
                }
            }
        }
    }

    private fun loadDashboard() {
        // Observe pending SMS count
        viewModelScope.launch {
            smsRepo.observePendingCount().collectLatest { count ->
                _uiState.update { it.copy(pendingSmsCount = count) }
            }
        }

        // Combine Room streams with Period
        viewModelScope.launch {
            combine(
                transactionRepo.observeAllTransactions(),
                balanceRepo.observeBalances(),
                _period
            ) { transactions, balancesEntity, selectedPeriod ->
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
                var essential = 0L
                var optional = 0L
                var luxury = 0L

                val categoryTotals = mutableMapOf<String, Long>()
                val categoryNames = mutableMapOf<String, String>()
                val categoryColors = mutableMapOf<String, String>()

                for (tx in periodTxs) {
                    if (tx.type == TransactionType.INCOME) {
                        income += tx.amountPaise
                    } else if (tx.type == TransactionType.EXPENSE) {
                        expense += tx.amountPaise
                        when (tx.necessity) {
                            NecessityTier.ESSENTIAL -> essential += tx.amountPaise
                            NecessityTier.OPTIONAL -> optional += tx.amountPaise
                            NecessityTier.LUXURY -> luxury += tx.amountPaise
                            null -> {}
                        }
                        categoryTotals[tx.categoryId] = (categoryTotals[tx.categoryId] ?: 0L) + tx.amountPaise
                        categoryNames[tx.categoryId] = tx.categoryName
                        categoryColors[tx.categoryId] = tx.categoryColor
                    }
                }

                val composition = categoryTotals.map { (catId, amt) ->
                    val share = if (expense > 0L) (amt.toDouble() / expense * 100.0) else 0.0
                    CategorySpendingDto(
                        categoryId = catId,
                        categoryName = categoryNames[catId] ?: "General",
                        categoryColor = categoryColors[catId],
                        categoryIcon = "🏷️",
                        amountPaise = amt,
                        sharePercentage = share
                    )
                }.sortedByDescending { it.amountPaise }

                val calculated = transactionRepo.calculateBalances()
                val lastSync = secureStorage.getLastSyncTimestamp()

                val resolvedState = when {
                    _uiState.value.dataState is DashboardDataState.SyncError && transactions.isEmpty() ->
                        _uiState.value.dataState
                    transactions.isNotEmpty() || calculated.totalPaise > 0L ->
                        if (lastSync > 0L) DashboardDataState.FreshServerData(lastSync) else DashboardDataState.CachedData(lastSync)
                    lastSync > 0L ->
                        DashboardDataState.EmptyAccount
                    else ->
                        _uiState.value.dataState
                }

                DashboardUiState(
                    dataState = resolvedState,
                    period = selectedPeriod,
                    totalBalancePaise = calculated.totalPaise,
                    cashBalancePaise = calculated.cashPaise,
                    onlineBalancePaise = calculated.onlinePaise,
                    startingCashPaise = balancesEntity.startingCashPaise,
                    startingOnlinePaise = balancesEntity.startingOnlinePaise,
                    balancesConfigured = balancesEntity.balancesConfiguredAt > 0L,
                    periodIncomePaise = income,
                    periodExpensePaise = expense,
                    essentialExpensePaise = essential,
                    optionalExpensePaise = optional,
                    luxuryExpensePaise = luxury,
                    recentTransactions = transactions.take(10),
                    spendingComposition = composition,
                    pendingSmsCount = _uiState.value.pendingSmsCount,
                    isRefreshing = _uiState.value.isRefreshing,
                    lastSyncedAt = lastSync
                )
            }.collect { newState ->
                _uiState.value = newState
            }
        }
    }
}
