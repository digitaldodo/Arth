package com.digitaldodo.arth.feature.statement

import android.app.Application
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.digitaldodo.arth.core.database.ArthDatabase
import com.digitaldodo.arth.core.model.Category
import com.digitaldodo.arth.core.model.NecessityTier
import com.digitaldodo.arth.core.model.PaymentMode
import com.digitaldodo.arth.core.model.Transaction
import com.digitaldodo.arth.core.model.TransactionType
import com.digitaldodo.arth.core.sms.IndianCategorizationEngine
import com.digitaldodo.arth.data.repository.CategoryRepository
import com.digitaldodo.arth.data.repository.TransactionRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.BufferedReader
import java.io.InputStreamReader
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.UUID

data class StatementRowUiState(
    val id: String = UUID.randomUUID().toString(),
    val rawText: String,
    val narration: String,
    val dateMillis: Long,
    val dateString: String,
    val amountPaise: Long,
    val type: TransactionType,
    val reference: String?,
    val isDuplicate: Boolean,
    val isSelected: Boolean,
    val category: Category,
    val categorizationMethod: String,
    val confidence: Float
)

data class StatementImportUiState(
    val isProcessing: Boolean = false,
    val fileName: String? = null,
    val rows: List<StatementRowUiState> = emptyList(),
    val totalDebitsPaise: Long = 0L,
    val totalCreditsPaise: Long = 0L,
    val potentialDuplicatesCount: Int = 0,
    val categories: List<Category> = emptyList(),
    val importSuccessCount: Int? = null,
    val errorMessage: String? = null
) {
    val selectedCount: Int get() = rows.count { it.isSelected }
}

class StatementImportViewModel(application: Application) : AndroidViewModel(application) {
    private val db = ArthDatabase.getInstance(application)
    private val transactionRepo = TransactionRepository(
        db.transactionDao(),
        db.accountBalancesDao(),
        db.syncOutboxDao(),
        application
    )
    private val categoryRepo = CategoryRepository(db.categoryDao(), application)

    private val _uiState = MutableStateFlow(StatementImportUiState())
    val uiState = _uiState.asStateFlow()

    init {
        loadCategories()
    }

    private fun loadCategories() {
        viewModelScope.launch {
            categoryRepo.observeCategories().collect { cats ->
                _uiState.update { it.copy(categories = cats) }
            }
        }
    }

    fun toggleRowSelection(rowId: String) {
        _uiState.update { current ->
            current.copy(
                rows = current.rows.map { if (it.id == rowId) it.copy(isSelected = !it.isSelected) else it }
            )
        }
    }

    fun selectAll(select: Boolean) {
        _uiState.update { current ->
            current.copy(
                rows = current.rows.map { it.copy(isSelected = select) }
            )
        }
    }

    fun updateRowCategory(rowId: String, newCategory: Category) {
        _uiState.update { current ->
            current.copy(
                rows = current.rows.map {
                    if (it.id == rowId) it.copy(category = newCategory, categorizationMethod = "user_correction")
                    else it
                }
            )
        }
    }

    fun processStatementUri(uri: Uri, name: String?) {
        _uiState.update { it.copy(isProcessing = true, fileName = name, errorMessage = null, importSuccessCount = null) }
        viewModelScope.launch {
            try {
                val parsed = withContext(Dispatchers.IO) {
                    parseStatementStream(uri)
                }
                if (parsed.isEmpty()) {
                    _uiState.update {
                        it.copy(
                            isProcessing = false,
                            errorMessage = "No valid transactions found. Make sure the file is a CSV or statement table."
                        )
                    }
                    return@launch
                }

                var debits = 0L
                var credits = 0L
                var dups = 0

                for (row in parsed) {
                    if (row.type == TransactionType.EXPENSE) debits += row.amountPaise
                    else credits += row.amountPaise
                    if (row.isDuplicate) dups++
                }

                _uiState.update {
                    it.copy(
                        isProcessing = false,
                        rows = parsed,
                        totalDebitsPaise = debits,
                        totalCreditsPaise = credits,
                        potentialDuplicatesCount = dups
                    )
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isProcessing = false,
                        errorMessage = e.message ?: "Failed to process bank statement"
                    )
                }
            }
        }
    }

    private suspend fun parseStatementStream(uri: Uri): List<StatementRowUiState> {
        val resolver = getApplication<Application>().contentResolver
        val lines = mutableListOf<String>()
        resolver.openInputStream(uri)?.use { stream ->
            BufferedReader(InputStreamReader(stream, Charsets.UTF_8)).use { reader ->
                var line = reader.readLine()
                while (line != null && lines.size < 5000) {
                    if (line.isNotBlank()) lines.add(line)
                    line = reader.readLine()
                }
            }
        }

        if (lines.isEmpty()) return emptyList()

        val parsedRows = mutableListOf<StatementRowUiState>()
        val defaultExpenseCategory = _uiState.value.categories.find { it.type == TransactionType.EXPENSE && it.isDefault }
            ?: _uiState.value.categories.firstOrNull { it.type == TransactionType.EXPENSE }
            ?: Category(id = "cat-other-expense", name = "Other Expense")

        val defaultIncomeCategory = _uiState.value.categories.find { it.type == TransactionType.INCOME && it.isDefault }
            ?: _uiState.value.categories.firstOrNull { it.type == TransactionType.INCOME }
            ?: Category(id = "cat-other-income", name = "Other Income")

        val txDao = db.transactionDao()
        val dateFormats = listOf(
            SimpleDateFormat("yyyy-MM-dd", Locale.ROOT),
            SimpleDateFormat("dd/MM/yyyy", Locale.ROOT),
            SimpleDateFormat("dd-MM-yyyy", Locale.ROOT),
            SimpleDateFormat("dd MMM yyyy", Locale.ROOT)
        )

        for (line in lines) {
            val tokens = splitCsvLine(line)
            if (tokens.size < 3) continue

            // Heuristic detection: find a date and an amount
            var dateMillis: Long? = null
            var dateStr: String? = null
            var amountPaise: Long? = null
            var isCredit = false
            var narration = ""
            var refNo: String? = null

            for (token in tokens) {
                val trimmed = token.trim().replace("\"", "")
                if (dateMillis == null) {
                    for (df in dateFormats) {
                        try {
                            val parsed = df.parse(trimmed)
                            if (parsed != null && parsed.year > 100) { // Valid year
                                dateMillis = parsed.time
                                dateStr = SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(parsed)
                                break
                            }
                        } catch (_: Exception) {}
                    }
                }

                // Check amount (e.g. 1,250.00 or 500)
                val cleanAmount = trimmed.replace("₹", "").replace("Rs.", "").replace(",", "").trim()
                val doubleVal = cleanAmount.toDoubleOrNull()
                if (doubleVal != null && doubleVal > 0.0 && doubleVal < 50_000_000.0 && amountPaise == null) {
                    amountPaise = (doubleVal * 100.0 + 0.5).toLong()
                }

                // Check credit keywords in line
                if (trimmed.equals("CR", ignoreCase = true) || trimmed.contains("deposit", ignoreCase = true) || trimmed.contains("credit", ignoreCase = true)) {
                    isCredit = true
                }

                // Reference detection
                if (trimmed.startsWith("REF-", ignoreCase = true) || trimmed.startsWith("UTR", ignoreCase = true) || (trimmed.length in 10..22 && trimmed.all { it.isLetterOrDigit() })) {
                    if (refNo == null && !trimmed.all { it.isDigit() }) {
                        refNo = trimmed
                    }
                }

                if (trimmed.length > 5 && !trimmed.matches(Regex("^[0-9.,/-]+$")) && narration.isBlank()) {
                    narration = trimmed
                }
            }

            if (dateMillis != null && amountPaise != null && amountPaise > 0L) {
                val txType = if (isCredit) TransactionType.INCOME else TransactionType.EXPENSE
                val finalNarration = narration.ifBlank { "Statement Transaction" }

                // Check duplicates against local ledger
                var isDup = false
                if (!refNo.isNullOrBlank()) {
                    val match = txDao.findByReference(refNo)
                    if (match != null) isDup = true
                }
                if (!isDup) {
                    val dups = txDao.findPotentialDuplicates(amountPaise, dateMillis)
                    if (dups.isNotEmpty()) isDup = true
                }

                // Shared Categorization Suggestion
                val suggestion = IndianCategorizationEngine.suggestCategory(
                    context = getApplication(),
                    narration = finalNarration,
                    categories = _uiState.value.categories,
                    type = txType
                )

                val assignedCategory = suggestion?.category ?: (if (txType == TransactionType.EXPENSE) defaultExpenseCategory else defaultIncomeCategory)
                val method = suggestion?.method ?: "manual"
                val conf = suggestion?.confidence ?: 0.5f

                parsedRows.add(
                    StatementRowUiState(
                        rawText = line,
                        narration = finalNarration,
                        dateMillis = dateMillis,
                        dateString = dateStr ?: "Unknown Date",
                        amountPaise = amountPaise,
                        type = txType,
                        reference = refNo,
                        isDuplicate = isDup,
                        isSelected = !isDup, // Uncheck duplicate candidates by default
                        category = assignedCategory,
                        categorizationMethod = method,
                        confidence = conf
                    )
                )
            }
        }

        return parsedRows
    }

    private fun splitCsvLine(line: String): List<String> {
        val tokens = mutableListOf<String>()
        val sb = StringBuilder()
        var inQuotes = false
        for (char in line) {
            when (char) {
                '"' -> inQuotes = !inQuotes
                ',' -> {
                    if (inQuotes) sb.append(char)
                    else {
                        tokens.add(sb.toString().trim())
                        sb.clear()
                    }
                }
                else -> sb.append(char)
            }
        }
        tokens.add(sb.toString().trim())
        return tokens
    }

    fun commitImport(onSuccess: (Int) -> Unit) {
        val selected = _uiState.value.rows.filter { it.isSelected }
        if (selected.isEmpty()) {
            _uiState.update { it.copy(errorMessage = "Please select at least one transaction to import") }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isProcessing = true, errorMessage = null) }
            val batchId = UUID.randomUUID().toString()
            var importedCount = 0

            for (row in selected) {
                val tx = Transaction(
                    id = UUID.randomUUID().toString(),
                    amountPaise = row.amountPaise,
                    type = row.type,
                    paymentMode = PaymentMode.ONLINE,
                    necessity = if (row.type == TransactionType.EXPENSE) NecessityTier.ESSENTIAL else null,
                    categoryId = row.category.id,
                    categoryName = row.category.name,
                    categoryIcon = row.category.icon,
                    categoryColor = row.category.color,
                    transactionDate = row.dateMillis,
                    notes = buildString {
                        if (!row.reference.isNullOrBlank()) append("Ref: ${row.reference} ")
                        append("[Imported from statement]")
                    }.trim(),
                    counterparty = row.narration,
                    statementReference = row.reference,
                    importBatchId = batchId,
                    ingestionSource = "bank_statement",
                    parserVersion = "android_statement_parser_v1",
                    categoryVerified = true,
                    categorizationMethod = row.categorizationMethod,
                    categorySuggestionConfidence = row.confidence
                )
                transactionRepo.addTransaction(tx)
                importedCount++
            }

            _uiState.update {
                it.copy(
                    isProcessing = false,
                    rows = emptyList(),
                    importSuccessCount = importedCount
                )
            }
            onSuccess(importedCount)
        }
    }
}
