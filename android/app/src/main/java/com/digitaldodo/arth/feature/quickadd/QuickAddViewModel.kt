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
    val amountInput: String = "",
    val amountPaise: Long = 0L,
    val type: TransactionType = TransactionType.EXPENSE,
    val paymentMode: PaymentMode = PaymentMode.ONLINE,
    val necessity: NecessityTier? = NecessityTier.ESSENTIAL,
    val selectedCategory: Category? = null,
    val categories: List<Category> = emptyList(),
    val transactionDate: Long = System.currentTimeMillis(),
    val description: String = "",
    val notes: String = "",
    val suggestedCategory: Category? = null,
    val suggestionConfidence: Float? = null,
    val suggestionEvidence: String? = null,
    val suggestionMethod: String? = null,
    val isSubmitting: Boolean = false,
    val isSaved: Boolean = false,
    val errorMessage: String? = null
) {
    val formattedAmount: String get() = Money.formatPaise(amountPaise, includeSymbol = true)
    val hasUnsavedChanges: Boolean get() = amountPaise > 0L || description.isNotBlank() || notes.isNotBlank()
}

class QuickAddViewModel(application: Application) : AndroidViewModel(application) {
    private val db = ArthDatabase.getInstance(application)
    private val transactionRepo = TransactionRepository(
        db.transactionDao(),
        db.accountBalancesDao(),
        db.syncOutboxDao(),
        application
    )
    private val categoryRepo = CategoryRepository(db.categoryDao(), application)

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
                        selectedCategory = current.selectedCategory?.takeIf { sel -> filtered.any { it.id == sel.id } }
                            ?: filtered.firstOrNull()
                    )
                }
            }
        }
    }

    fun onAmountInputChanged(raw: String) {
        val clean = raw.filter { it.isDigit() || it == '.' }
        val paise = try {
            if (clean.isBlank()) 0L else Money.rupeesToPaise(clean)
        } catch (_: Exception) {
            _uiState.value.amountPaise
        }
        _uiState.update { it.copy(amountInput = clean, amountPaise = paise, errorMessage = null) }
    }

    fun onDigitPressed(digit: Int) {
        val current = _uiState.value.amountPaise
        if (current > 100_000_000L) return // Cap at ₹1,00,00,000
        val newAmount = current * 10 + digit
        val inrString = Money.paiseToDecimalString(newAmount)
        _uiState.update { it.copy(amountPaise = newAmount, amountInput = inrString, errorMessage = null) }
    }

    fun onBackspacePressed() {
        val current = _uiState.value.amountPaise
        val newAmount = current / 10
        val inrString = if (newAmount == 0L) "" else Money.paiseToDecimalString(newAmount)
        _uiState.update { it.copy(amountPaise = newAmount, amountInput = inrString) }
    }

    fun onClearPressed() {
        _uiState.update { it.copy(amountPaise = 0L, amountInput = "") }
    }

    fun setType(type: TransactionType) {
        _uiState.update { current ->
            current.copy(
                type = type,
                necessity = if (type == TransactionType.EXPENSE) (current.necessity ?: NecessityTier.ESSENTIAL) else null,
                selectedCategory = null
            )
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

    fun setTransactionDate(dateMillis: Long) {
        _uiState.update { it.copy(transactionDate = dateMillis) }
    }

    fun onDescriptionChanged(desc: String) {
        val suggestion = com.digitaldodo.arth.core.sms.IndianCategorizationEngine.suggestCategory(
            context = getApplication(),
            narration = desc,
            categories = _uiState.value.categories,
            type = _uiState.value.type
        )
        _uiState.update { current ->
            current.copy(
                description = desc,
                suggestedCategory = suggestion?.category,
                suggestionConfidence = suggestion?.confidence,
                suggestionEvidence = suggestion?.evidence,
                suggestionMethod = suggestion?.method,
                selectedCategory = if (current.selectedCategory == null && suggestion != null) suggestion.category else current.selectedCategory
            )
        }
    }

    fun applySuggestedCategory() {
        _uiState.value.suggestedCategory?.let { category ->
            _uiState.update { it.copy(selectedCategory = category) }
        }
    }

    fun onNotesChanged(notes: String) {
        _uiState.update { it.copy(notes = notes) }
    }

    fun save(onSuccess: () -> Unit) {
        val state = _uiState.value
        if (state.amountPaise <= 0L) {
            _uiState.update { it.copy(errorMessage = "Please enter an amount greater than zero") }
            return
        }

        val category = state.selectedCategory ?: state.categories.firstOrNull() ?: Category(name = "General")

        val wasSuggested = state.suggestedCategory != null
        val matchedSuggestion = wasSuggested && (category.id == state.suggestedCategory?.id)
        val categoryVerified = wasSuggested && matchedSuggestion
        val categoryWasCorrected = wasSuggested && !matchedSuggestion
        val categorizationMethod = if (categoryWasCorrected) "user_correction" else if (categoryVerified) (state.suggestionMethod ?: "weak_supervision") else "manual"

        if (categoryWasCorrected && state.description.isNotBlank()) {
            com.digitaldodo.arth.core.sms.IndianCategorizationEngine.saveCategoryCorrection(
                context = getApplication(),
                merchantText = state.description,
                categoryId = category.id
            )
        }

        val tx = Transaction(
            id = UUID.randomUUID().toString(),
            amountPaise = state.amountPaise,
            type = state.type,
            paymentMode = state.paymentMode,
            necessity = if (state.type == TransactionType.EXPENSE) (state.necessity ?: NecessityTier.ESSENTIAL) else null,
            categoryId = category.id,
            categoryName = category.name,
            categoryIcon = category.icon,
            categoryColor = category.color,
            transactionDate = state.transactionDate,
            notes = state.notes.trim().takeIf { it.isNotBlank() },
            counterparty = state.description.trim().takeIf { it.isNotBlank() },
            syncStatus = SyncStatus.PENDING,
            ingestionSource = "manual",
            categoryVerified = categoryVerified,
            categorizationMethod = categorizationMethod,
            categorySuggestionConfidence = state.suggestionConfidence,
            categoryEvidence = state.suggestionEvidence,
            categoryWasCorrected = categoryWasCorrected
        )

        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true) }
            try {
                transactionRepo.addTransaction(tx)
                _uiState.update { it.copy(isSubmitting = false, isSaved = true) }
                onSuccess()
            } catch (e: Exception) {
                _uiState.update { it.copy(isSubmitting = false, errorMessage = e.message ?: "Failed to save transaction") }
            }
        }
    }

    fun reset() {
        _uiState.value = QuickAddUiState()
        loadCategories()
    }
}
