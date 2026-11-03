package com.digitaldodo.arth.feature.quickadd

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.digitaldodo.arth.core.database.ArthDatabase
import com.digitaldodo.arth.core.model.*
import com.digitaldodo.arth.data.repository.CategoryRepository
import com.digitaldodo.arth.data.repository.TransactionRepository
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.util.UUID

data class QuickAddUiState(
    val amountPaise: Long = 0L,
    val type: TransactionType = TransactionType.EXPENSE,
    val paymentMode: PaymentMode = PaymentMode.ONLINE,
    val necessity: NecessityTier = NecessityTier.NEEDS,
    val selectedCategory: Category? = null,
    val categories: List<Category> = emptyList(),
    val notes: String = "",
    val counterparty: String = "",
    val isSaved: Boolean = false,
    val errorMessage: String? = null
) {
    val formattedAmount: String get() = Money.formatPaise(amountPaise, includeSymbol = true)
}

class QuickAddViewModel(application: Application) : AndroidViewModel(application) {
    private val db = ArthDatabase.getInstance(application)
    private val transactionRepo = TransactionRepository(
        db.transactionDao(),
        db.accountBalancesDao(),
        db.syncOutboxDao(),
        application
    )
    private val categoryRepo = CategoryRepository(db.categoryDao())

    private val _uiState = MutableStateFlow(QuickAddUiState())
    val uiState = _uiState.asStateFlow()

    init {
        loadCategories()
    }

    private fun loadCategories() {
        viewModelScope.launch {
            categoryRepo.observeCategories().collectLatest { list ->
                _uiState.update { current ->
                    val filtered = list.filter { it.type == current.type }
                    current.copy(
                        categories = filtered,
                        selectedCategory = current.selectedCategory ?: filtered.firstOrNull()
                    )
                }
            }
        }
    }

    fun onDigitPressed(digit: Int) {
        val current = _uiState.value.amountPaise
        if (current > 100_000_000L) return // Cap at reasonable limit (₹1,00,00,000)
        val newAmount = current * 10 + digit
        _uiState.update { it.copy(amountPaise = newAmount, errorMessage = null) }
    }

    fun onBackspacePressed() {
        val current = _uiState.value.amountPaise
        _uiState.update { it.copy(amountPaise = current / 10) }
    }

    fun onClearPressed() {
        _uiState.update { it.copy(amountPaise = 0L) }
    }

    fun setType(type: TransactionType) {
        _uiState.update { current ->
            current.copy(type = type)
        }
        loadCategories()
    }

    fun setPaymentMode(mode: PaymentMode) {
        _uiState.update { it.copy(paymentMode = mode) }
    }

    fun setNecessity(tier: NecessityTier) {
        _uiState.update { it.copy(necessity = tier) }
    }

    fun selectCategory(category: Category) {
        _uiState.update { it.copy(selectedCategory = category) }
    }

    fun onNotesChanged(notes: String) {
        _uiState.update { it.copy(notes = notes) }
    }

    fun onCounterpartyChanged(counterparty: String) {
        _uiState.update { it.copy(counterparty = counterparty) }
    }

    fun save(onSuccess: () -> Unit) {
        val state = _uiState.value
        if (state.amountPaise <= 0L) {
            _uiState.update { it.copy(errorMessage = "Please enter an amount") }
            return
        }

        val category = state.selectedCategory ?: state.categories.firstOrNull() ?: Category(name = "General")

        val tx = Transaction(
            id = UUID.randomUUID().toString(),
            amountPaise = state.amountPaise,
            type = state.type,
            paymentMode = state.paymentMode,
            necessity = state.necessity,
            categoryId = category.id,
            categoryName = category.name,
            categoryIcon = category.icon,
            categoryColor = category.color,
            transactionDate = System.currentTimeMillis(),
            notes = state.notes.trim().takeIf { it.isNotBlank() },
            counterparty = state.counterparty.trim().takeIf { it.isNotBlank() },
            syncStatus = SyncStatus.PENDING
        )

        viewModelScope.launch {
            transactionRepo.addTransaction(tx)
            _uiState.update { it.copy(isSaved = true) }
            onSuccess()
        }
    }

    fun reset() {
        _uiState.value = QuickAddUiState()
        loadCategories()
    }
}
