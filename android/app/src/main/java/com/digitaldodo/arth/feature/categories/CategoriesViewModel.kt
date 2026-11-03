package com.digitaldodo.arth.feature.categories

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.digitaldodo.arth.core.database.ArthDatabase
import com.digitaldodo.arth.core.model.Category
import com.digitaldodo.arth.core.model.TransactionType
import com.digitaldodo.arth.data.repository.CategoryRepository
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.util.UUID

data class CategoriesUiState(
    val categories: List<Category> = emptyList(),
    val selectedType: TransactionType = TransactionType.EXPENSE,
    val showAddDialog: Boolean = false
)

class CategoriesViewModel(application: Application) : AndroidViewModel(application) {
    private val db = ArthDatabase.getInstance(application)
    private val repo = CategoryRepository(db.categoryDao())

    private val _uiState = MutableStateFlow(CategoriesUiState())
    val uiState = _uiState.asStateFlow()

    init {
        loadCategories()
    }

    private fun loadCategories() {
        viewModelScope.launch {
            repo.observeCategories().collectLatest { list ->
                _uiState.update { it.copy(categories = list) }
            }
        }
    }

    fun setType(type: TransactionType) {
        _uiState.update { it.copy(selectedType = type) }
    }

    fun showAddDialog(show: Boolean) {
        _uiState.update { it.copy(showAddDialog = show) }
    }

    fun addCategory(name: String, type: TransactionType) {
        if (name.isBlank()) return
        viewModelScope.launch {
            repo.addCategory(
                Category(
                    id = UUID.randomUUID().toString(),
                    name = name.trim(),
                    type = type,
                    isSystem = false,
                    sortOrder = 50
                )
            )
            showAddDialog(false)
        }
    }

    fun deleteCategory(id: String) {
        viewModelScope.launch {
            repo.deleteCategory(id)
        }
    }
}
