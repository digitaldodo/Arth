package com.digitaldodo.arth.feature.sms

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.digitaldodo.arth.core.database.ArthDatabase
import com.digitaldodo.arth.core.model.Category
import com.digitaldodo.arth.core.model.NecessityTier
import com.digitaldodo.arth.core.model.SmsSuggestion
import com.digitaldodo.arth.data.repository.CategoryRepository
import com.digitaldodo.arth.data.repository.SmsSuggestionRepository
import com.digitaldodo.arth.data.repository.TransactionRepository
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

data class SmsReviewUiState(
    val pendingSuggestions: List<SmsSuggestion> = emptyList(),
    val categories: List<Category> = emptyList(),
    val selectedSuggestion: SmsSuggestion? = null,
    val showDisclosure: Boolean = false,
    val isLoading: Boolean = false
)

class SmsViewModel(application: Application) : AndroidViewModel(application) {
    private val db = ArthDatabase.getInstance(application)
    private val transactionRepo = TransactionRepository(
        db.transactionDao(),
        db.accountBalancesDao(),
        db.syncOutboxDao(),
        application
    )
    private val smsRepo = SmsSuggestionRepository(db.smsSuggestionDao(), transactionRepo)
    private val categoryRepo = CategoryRepository(db.categoryDao())

    private val _uiState = MutableStateFlow(SmsReviewUiState())
    val uiState = _uiState.asStateFlow()

    init {
        loadData()
    }

    private fun loadData() {
        viewModelScope.launch {
            combine(
                smsRepo.observePendingSuggestions(),
                categoryRepo.observeCategories()
            ) { suggestions, categories ->
                SmsReviewUiState(
                    pendingSuggestions = suggestions,
                    categories = categories,
                    isLoading = false
                )
            }.collectLatest { newState ->
                _uiState.value = newState
            }
        }
    }

    fun confirmSuggestion(
        suggestion: SmsSuggestion,
        categoryId: String,
        categoryName: String,
        necessity: NecessityTier?
    ) {
        viewModelScope.launch {
            smsRepo.confirmSuggestion(suggestion, categoryId, categoryName, necessity)
        }
    }

    fun dismissSuggestion(suggestionId: String) {
        viewModelScope.launch {
            smsRepo.dismissSuggestion(suggestionId)
        }
    }

    fun showDisclosure(show: Boolean) {
        _uiState.update { it.copy(showDisclosure = show) }
    }
}
