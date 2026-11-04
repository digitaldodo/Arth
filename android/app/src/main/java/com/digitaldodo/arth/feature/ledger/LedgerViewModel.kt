package com.digitaldodo.arth.feature.ledger

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.digitaldodo.arth.core.database.ArthDatabase
import com.digitaldodo.arth.core.model.NecessityTier
import com.digitaldodo.arth.core.model.PaymentMode
import com.digitaldodo.arth.core.model.Transaction
import com.digitaldodo.arth.core.model.TransactionType
import com.digitaldodo.arth.data.repository.TransactionRepository
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

enum class LedgerFilter {
    ALL, EXPENSE, INCOME, CASH, ONLINE, ESSENTIAL, OPTIONAL, LUXURY
}

data class LedgerUiState(
    val searchQuery: String = "",
    val activeFilter: LedgerFilter = LedgerFilter.ALL,
    val transactions: List<Transaction> = emptyList(),
    val filteredTransactions: List<Transaction> = emptyList(),
    val selectedTransaction: Transaction? = null,
    val isLoading: Boolean = false
)

class LedgerViewModel(application: Application) : AndroidViewModel(application) {
    private val db = ArthDatabase.getInstance(application)
    private val repo = TransactionRepository(
        db.transactionDao(),
        db.accountBalancesDao(),
        db.syncOutboxDao(),
        application
    )

    private val _uiState = MutableStateFlow(LedgerUiState())
    val uiState = _uiState.asStateFlow()

    init {
        loadTransactions()
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            try {
                repo.refreshTransactions()
            } catch (_: Exception) {
            } finally {
                _uiState.update { it.copy(isLoading = false) }
            }
        }
    }

    private fun loadTransactions() {
        viewModelScope.launch {
            repo.observeAllTransactions().collectLatest { list ->
                _uiState.update { current ->
                    current.copy(
                        transactions = list,
                        filteredTransactions = applyFilters(list, current.searchQuery, current.activeFilter)
                    )
                }
            }
        }
    }

    fun onSearchQueryChanged(query: String) {
        _uiState.update { current ->
            current.copy(
                searchQuery = query,
                filteredTransactions = applyFilters(current.transactions, query, current.activeFilter)
            )
        }
    }

    fun setFilter(filter: LedgerFilter) {
        _uiState.update { current ->
            current.copy(
                activeFilter = filter,
                filteredTransactions = applyFilters(current.transactions, current.searchQuery, filter)
            )
        }
    }

    fun selectTransaction(transaction: Transaction?) {
        _uiState.update { it.copy(selectedTransaction = transaction) }
    }

    fun deleteTransaction(id: String) {
        viewModelScope.launch {
            repo.softDeleteTransaction(id)
            selectTransaction(null)
        }
    }

    private fun applyFilters(
        list: List<Transaction>,
        query: String,
        filter: LedgerFilter
    ): List<Transaction> {
        val q = query.trim().lowercase()
        return list.filter { tx ->
            val matchesQuery = q.isBlank() ||
                tx.categoryName.lowercase().contains(q) ||
                (tx.counterparty?.lowercase()?.contains(q) == true) ||
                (tx.notes?.lowercase()?.contains(q) == true)

            val matchesFilter = when (filter) {
                LedgerFilter.ALL -> true
                LedgerFilter.EXPENSE -> tx.type == TransactionType.EXPENSE
                LedgerFilter.INCOME -> tx.type == TransactionType.INCOME
                LedgerFilter.CASH -> tx.paymentMode == PaymentMode.CASH
                LedgerFilter.ONLINE -> tx.paymentMode == PaymentMode.ONLINE
                LedgerFilter.ESSENTIAL -> tx.necessity == NecessityTier.ESSENTIAL
                LedgerFilter.OPTIONAL -> tx.necessity == NecessityTier.OPTIONAL
                LedgerFilter.LUXURY -> tx.necessity == NecessityTier.LUXURY
            }

            matchesQuery && matchesFilter
        }
    }
}
