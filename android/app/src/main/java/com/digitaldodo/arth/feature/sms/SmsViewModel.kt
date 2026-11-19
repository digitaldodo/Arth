package com.digitaldodo.arth.feature.sms

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.digitaldodo.arth.core.database.ArthDatabase
import com.digitaldodo.arth.core.database.SmsSuggestionEntity
import com.digitaldodo.arth.core.model.Category
import com.digitaldodo.arth.core.model.NecessityTier
import com.digitaldodo.arth.core.model.PaymentMode
import com.digitaldodo.arth.core.model.SmsSuggestion
import com.digitaldodo.arth.core.model.DuplicateStatus
import com.digitaldodo.arth.core.sms.ScanResult
import com.digitaldodo.arth.core.sms.SmsInboxScanner
import com.digitaldodo.arth.core.sms.FinancialMessageClassifier
import com.digitaldodo.arth.core.sms.SmsPreferencesRepository
import com.digitaldodo.arth.data.repository.CategoryRepository
import com.digitaldodo.arth.data.repository.SmsSuggestionRepository
import com.digitaldodo.arth.data.repository.TransactionRepository
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

data class SmsReviewUiState(
    val pendingSuggestions: List<SmsSuggestion> = emptyList(),
    val categories: List<Category> = emptyList(),
    val selectedSuggestionForEdit: SmsSuggestion? = null,
    val showDisclosure: Boolean = false,
    val isLoading: Boolean = false,
    val isScanning: Boolean = false,
    val scanSummary: String? = null,
    val isTrackingEnabled: Boolean = false,
    val isTrackingPaused: Boolean = false,
    val isAutoAddEnabled: Boolean = false,
    val historicalDays: Int = 30,
    val pendingCount: Int = 0,
    val confirmedCount: Int = 0,
    val dismissedCount: Int = 0,
    val totalProcessedCount: Int = 0,
    val lastScanTimestamp: Long = 0L
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
    private val prefs = SmsPreferencesRepository(application)

    private val _uiState = MutableStateFlow(
        SmsReviewUiState(
            isTrackingEnabled = prefs.isTrackingEnabled,
            isTrackingPaused = prefs.isTrackingPaused,
            isAutoAddEnabled = prefs.isAutoAddEnabled,
            historicalDays = prefs.historicalScanDays,
            totalProcessedCount = prefs.totalMessagesProcessed,
            lastScanTimestamp = prefs.lastScanTimestamp
        )
    )
    val uiState = _uiState.asStateFlow()

    init {
        loadData()
    }

    private fun loadData() {
        viewModelScope.launch {
            combine(
                smsRepo.observePendingSuggestions(),
                categoryRepo.observeCategories(),
                smsRepo.observePendingCount(),
                smsRepo.observeConfirmedCount(),
                smsRepo.observeDismissedCount()
            ) { suggestions, categories, pending, confirmed, dismissed ->
                _uiState.update { current ->
                    current.copy(
                        pendingSuggestions = suggestions,
                        categories = categories,
                        pendingCount = pending,
                        confirmedCount = confirmed,
                        dismissedCount = dismissed,
                        isTrackingEnabled = prefs.isTrackingEnabled,
                        isTrackingPaused = prefs.isTrackingPaused,
                        isAutoAddEnabled = prefs.isAutoAddEnabled,
                        historicalDays = prefs.historicalScanDays,
                        totalProcessedCount = prefs.totalMessagesProcessed,
                        lastScanTimestamp = prefs.lastScanTimestamp,
                        isLoading = false
                    )
                }
            }.collect()
        }
    }

    fun setTrackingEnabled(enabled: Boolean) {
        prefs.isTrackingEnabled = enabled
        _uiState.update { it.copy(isTrackingEnabled = enabled) }
    }

    fun setTrackingPaused(paused: Boolean) {
        prefs.isTrackingPaused = paused
        _uiState.update { it.copy(isTrackingPaused = paused) }
    }

    fun setAutoAddEnabled(enabled: Boolean) {
        prefs.isAutoAddEnabled = enabled
        _uiState.update { it.copy(isAutoAddEnabled = enabled) }
    }

    fun setHistoricalDays(days: Int) {
        prefs.historicalScanDays = days
        _uiState.update { it.copy(historicalDays = days) }
    }

    fun scanHistoricalInbox(lookbackDays: Int = prefs.historicalScanDays, onFinished: ((ScanResult) -> Unit)? = null) {
        viewModelScope.launch {
            _uiState.update { it.copy(isScanning = true, scanSummary = null) }
            val result = SmsInboxScanner.scanHistoricalInbox(
                context = getApplication(),
                lookbackDays = lookbackDays
            )
            _uiState.update {
                it.copy(
                    isScanning = false,
                    lastScanTimestamp = result.lastTimestamp,
                    totalProcessedCount = prefs.totalMessagesProcessed,
                    scanSummary = "Scanned ${result.totalScanned} messages • Found ${result.financialDiscovered} financial (${result.newCandidatesAdded} new, ${result.duplicatesSkipped} duplicates skipped)"
                )
            }
            onFinished?.invoke(result)
        }
    }

    /**
     * Imports a message explicitly shared by the user. The raw text is parsed in memory only;
     * only candidate fields are stored, and every candidate remains pending user review.
     */
    fun importSharedMessage(messageText: String, onResult: (Boolean) -> Unit = {}) {
        val boundedText = messageText.take(10_000)
        if (boundedText.isBlank()) {
            onResult(false)
            return
        }
        viewModelScope.launch {
            val timestamp = System.currentTimeMillis()
            val parsed = FinancialMessageClassifier.classifyAndParse(
                sender = "User-shared message",
                body = boundedText,
                timestamp = timestamp
            )
            if (parsed == null || parsed.classification.name in setOf("NON_FINANCIAL", "BALANCE_ALERT", "FAILED_TRANSACTION")) {
                onResult(false)
                return@launch
            }
            val dao = db.smsSuggestionDao()
            val duplicateByReference = parsed.refNumber?.let { dao.findByRefNumber(it) }
            val duplicateByAmount = if (duplicateByReference == null) dao.findNearMatch(parsed.amountPaise, parsed.timestamp, 120_000L) else null
            if (duplicateByReference != null || duplicateByAmount != null) {
                onResult(false)
                return@launch
            }
            dao.insert(
                SmsSuggestionEntity(
                    id = parsed.id,
                    // Durable marker ensures user-shared imports require date review.
                    sender = "User-shared message",
                    amountPaise = parsed.amountPaise,
                    type = parsed.type.name,
                    paymentMode = parsed.paymentMode.name,
                    merchant = parsed.merchant,
                    refNumber = parsed.refNumber,
                    smsTimestamp = parsed.timestamp,
                    confidence = parsed.confidence,
                    bank = parsed.bank,
                    accountMask = parsed.accountMask,
                    classification = parsed.classification.name,
                    balancePaise = parsed.balancePaise,
                    duplicateStatus = DuplicateStatus.UNIQUE.name,
                    rawSnippet = null
                )
            )
            _uiState.update { it.copy(scanSummary = "Message imported. Review the candidate before adding it to your ledger.") }
            onResult(true)
        }
    }

    fun confirmSuggestion(
        suggestion: SmsSuggestion,
        categoryId: String,
        categoryName: String,
        necessity: NecessityTier?,
        customAmountPaise: Long? = null,
        customDate: Long? = null,
        customMerchant: String? = null,
        customPaymentMode: PaymentMode? = null,
        customNotes: String? = null
    ) {
        viewModelScope.launch {
            smsRepo.confirmSuggestion(
                suggestion = suggestion,
                categoryId = categoryId,
                categoryName = categoryName,
                necessity = necessity,
                customAmountPaise = customAmountPaise,
                customDate = customDate,
                customMerchant = customMerchant,
                customPaymentMode = customPaymentMode,
                customNotes = customNotes
            )
            _uiState.update { it.copy(selectedSuggestionForEdit = null) }
        }
    }

    fun dismissSuggestion(suggestionId: String) {
        viewModelScope.launch {
            smsRepo.dismissSuggestion(suggestionId)
        }
    }

    fun markAsDuplicate(suggestionId: String) {
        viewModelScope.launch {
            smsRepo.markAsDuplicate(suggestionId)
        }
    }

    fun selectSuggestionForEdit(suggestion: SmsSuggestion?) {
        _uiState.update { it.copy(selectedSuggestionForEdit = suggestion) }
    }

    fun showDisclosure(show: Boolean) {
        _uiState.update { it.copy(showDisclosure = show) }
    }

    fun clearAllLocalSmsData() {
        viewModelScope.launch {
            smsRepo.deleteLocalSmsData()
            prefs.lastScanTimestamp = 0L
            _uiState.update {
                it.copy(
                    lastScanTimestamp = 0L,
                    scanSummary = "Locally stored SMS suggestions cleared."
                )
            }
        }
    }

    fun disconnectTracking() {
        viewModelScope.launch {
            prefs.reset()
            smsRepo.deleteLocalSmsData()
            _uiState.update {
                it.copy(
                    isTrackingEnabled = false,
                    isTrackingPaused = false,
                    isAutoAddEnabled = false,
                    lastScanTimestamp = 0L,
                    totalProcessedCount = 0,
                    scanSummary = "SMS tracking disconnected."
                )
            }
        }
    }
}
