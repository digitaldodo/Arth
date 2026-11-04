package com.digitaldodo.arth.feature.balances

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.digitaldodo.arth.core.database.ArthDatabase
import com.digitaldodo.arth.core.model.AccountBalances
import com.digitaldodo.arth.core.model.Money
import com.digitaldodo.arth.data.repository.BalanceRepository
import com.digitaldodo.arth.data.repository.TransactionRepository
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

data class BalancesUiState(
    val currentBalances: AccountBalances = AccountBalances(),
    val startingBalances: AccountBalances = AccountBalances(),
    val showConfigureDialog: Boolean = false,
    val showTransferDialog: Boolean = false
)

class BalancesViewModel(application: Application) : AndroidViewModel(application) {
    private val db = ArthDatabase.getInstance(application)
    private val balanceRepo = BalanceRepository(
        db.accountBalancesDao(),
        db.transactionDao(),
        application
    )
    private val transactionRepo = TransactionRepository(
        db.transactionDao(),
        db.accountBalancesDao(),
        db.syncOutboxDao(),
        application
    )

    private val _uiState = MutableStateFlow(BalancesUiState())
    val uiState = _uiState.asStateFlow()

    init {
        loadBalances()
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            try {
                balanceRepo.refreshBalances()
                val current = transactionRepo.calculateBalances()
                _uiState.update { it.copy(currentBalances = current) }
            } catch (_: Exception) {}
        }
    }

    private fun loadBalances() {
        viewModelScope.launch {
            balanceRepo.observeBalances().collectLatest { starting ->
                val current = transactionRepo.calculateBalances()
                _uiState.update { it.copy(currentBalances = current, startingBalances = starting) }
            }
        }
    }

    fun showConfigureDialog(show: Boolean) {
        _uiState.update { it.copy(showConfigureDialog = show) }
    }

    fun showTransferDialog(show: Boolean) {
        _uiState.update { it.copy(showTransferDialog = show) }
    }

    fun setStartingBalances(cashPaise: Long, onlinePaise: Long) {
        viewModelScope.launch {
            balanceRepo.setStartingBalances(cashPaise, onlinePaise)
            val current = transactionRepo.calculateBalances()
            _uiState.update { it.copy(currentBalances = current, showConfigureDialog = false) }
        }
    }

    fun recordTransfer(amountPaise: Long, fromCash: Boolean, notes: String?) {
        viewModelScope.launch {
            balanceRepo.recordTransfer(amountPaise, fromCash, notes)
            val current = transactionRepo.calculateBalances()
            _uiState.update { it.copy(currentBalances = current, showTransferDialog = false) }
        }
    }
}
