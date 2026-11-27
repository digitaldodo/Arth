package com.digitaldodo.arth.feature.sms

import android.Manifest
import android.app.Application
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.digitaldodo.arth.BuildConfig
import com.digitaldodo.arth.core.database.ArthDatabase
import com.digitaldodo.arth.core.database.SmsSuggestionEntity
import com.digitaldodo.arth.core.model.Category
import com.digitaldodo.arth.core.model.DuplicateStatus
import com.digitaldodo.arth.core.model.NecessityTier
import com.digitaldodo.arth.core.model.PaymentMode
import com.digitaldodo.arth.core.model.SmsSuggestion
import com.digitaldodo.arth.core.sms.DiscoveredNotificationSource
import com.digitaldodo.arth.core.sms.FinancialMessageClassifier
import com.digitaldodo.arth.core.sms.ScanResult
import com.digitaldodo.arth.core.sms.SmsInboxScanner
import com.digitaldodo.arth.core.sms.SmsNotificationListenerService
import com.digitaldodo.arth.core.sms.SmsPreferencesRepository
import com.digitaldodo.arth.core.sms.SupportedNotificationSources
import com.digitaldodo.arth.core.sms.TransactionDeduplicator
import com.digitaldodo.arth.data.repository.CategoryRepository
import com.digitaldodo.arth.data.repository.SmsSuggestionRepository
import com.digitaldodo.arth.data.repository.TransactionRepository
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

enum class CaptureStatusKind(val label: String) {
    ENABLED("Enabled"),
    PERMISSION_REQUIRED("Permission required"),
    ACCESS_DISABLED("Access disabled"),
    NO_SOURCES_SELECTED("No supported sources selected"),
    UNSUPPORTED("Unsupported device/configuration"),
    CAPTURE_ERROR("Capture error")
}

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
    val isNotificationMonitoringEnabled: Boolean = false,
    val isNotificationDefaultSmsEnabled: Boolean = true,
    val hasNotificationAccess: Boolean = false,
    val isNotificationListenerConnected: Boolean = false,
    val discoveredSources: List<DiscoveredNotificationSource> = emptyList(),
    val defaultSmsAppLabel: String? = null,
    val isAutoAddEnabled: Boolean = false,
    val historicalDays: Int = 30,
    val pendingCount: Int = 0,
    val confirmedCount: Int = 0,
    val dismissedCount: Int = 0,
    val totalProcessedCount: Int = 0,
    val lastScanTimestamp: Long = 0L,
    val lastCaptureTimestamp: Long = 0L,
    val lastCaptureSource: String? = null,
    val lastCaptureError: String? = null
) {
    val enabledSourcesCount: Int
        get() = discoveredSources.count { it.isEnabled } + if (isNotificationDefaultSmsEnabled && !defaultSmsAppLabel.isNullOrBlank()) 1 else 0

    fun resolveCaptureStatus(hasSmsPermission: Boolean): CaptureStatusKind {
        if (!BuildConfig.NOTIFICATION_CAPTURE_SUPPORTED && !BuildConfig.SMS_DETECTION_SUPPORTED) {
            return CaptureStatusKind.UNSUPPORTED
        }
        val anyCaptureOn = (isNotificationMonitoringEnabled && hasNotificationAccess) ||
            (BuildConfig.SMS_DETECTION_SUPPORTED && hasSmsPermission && isTrackingEnabled && !isTrackingPaused)
        if (!lastCaptureError.isNullOrBlank() && isNotificationMonitoringEnabled && hasNotificationAccess && !isNotificationListenerConnected) {
            return CaptureStatusKind.CAPTURE_ERROR
        }
        if (isNotificationMonitoringEnabled && !hasNotificationAccess) {
            return CaptureStatusKind.PERMISSION_REQUIRED
        }
        if (isNotificationMonitoringEnabled && hasNotificationAccess && enabledSourcesCount == 0) {
            return CaptureStatusKind.NO_SOURCES_SELECTED
        }
        if (anyCaptureOn) {
            return CaptureStatusKind.ENABLED
        }
        return if (hasNotificationAccess || (BuildConfig.SMS_DETECTION_SUPPORTED && hasSmsPermission)) {
            CaptureStatusKind.ACCESS_DISABLED
        } else {
            CaptureStatusKind.PERMISSION_REQUIRED
        }
    }
}

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

    private val _uiState = MutableStateFlow(buildSnapshot(SmsReviewUiState()))
    val uiState = _uiState.asStateFlow()

    init {
        loadData()
    }

    private fun buildSnapshot(base: SmsReviewUiState): SmsReviewUiState {
        val context = getApplication<Application>()
        return base.copy(
            isTrackingEnabled = prefs.isTrackingEnabled,
            isTrackingPaused = prefs.isTrackingPaused,
            isNotificationMonitoringEnabled = prefs.isNotificationMonitoringEnabled,
            isNotificationDefaultSmsEnabled = prefs.isNotificationDefaultSmsEnabled,
            hasNotificationAccess = SmsNotificationListenerService.hasNotificationAccess(context),
            isNotificationListenerConnected = prefs.isNotificationListenerConnected,
            discoveredSources = SupportedNotificationSources.inspectSources(context, prefs.allowedNotificationPackages),
            defaultSmsAppLabel = SmsNotificationListenerService.defaultSmsAppLabel(context),
            isAutoAddEnabled = prefs.isAutoAddEnabled,
            historicalDays = prefs.historicalScanDays,
            totalProcessedCount = prefs.totalMessagesProcessed,
            lastScanTimestamp = prefs.lastScanTimestamp,
            lastCaptureTimestamp = prefs.lastCaptureTimestamp,
            lastCaptureSource = prefs.lastCaptureSource,
            lastCaptureError = prefs.lastCaptureError
        )
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
                    buildSnapshot(
                        current.copy(
                            pendingSuggestions = suggestions,
                            categories = categories,
                            pendingCount = pending,
                            confirmedCount = confirmed,
                            dismissedCount = dismissed,
                            isLoading = false
                        )
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

    fun setNotificationMonitoringEnabled(enabled: Boolean) {
        prefs.isNotificationMonitoringEnabled = enabled
        if (enabled) prefs.lastCaptureError = null
        _uiState.update { buildSnapshot(it) }
    }

    fun setNotificationDefaultSmsEnabled(enabled: Boolean) {
        prefs.isNotificationDefaultSmsEnabled = enabled
        _uiState.update { buildSnapshot(it) }
    }

    fun toggleNotificationSource(packageName: String, enabled: Boolean) {
        prefs.toggleAllowedPackage(packageName, enabled)
        _uiState.update { buildSnapshot(it) }
    }

    fun disableCapture() {
        prefs.isNotificationMonitoringEnabled = false
        prefs.isTrackingPaused = true
        _uiState.update { buildSnapshot(it) }
    }

    fun clearPendingSuggestions() {
        viewModelScope.launch {
            smsRepo.deleteLocalSmsData()
            _uiState.update { it.copy(scanSummary = "Pending unconfirmed alerts cleared.") }
        }
    }

    fun refreshNotificationAccessState() {
        _uiState.update { buildSnapshot(it) }
    }

    fun setAutoAddEnabled(enabled: Boolean) {
        prefs.isAutoAddEnabled = enabled
        _uiState.update { it.copy(isAutoAddEnabled = enabled) }
    }

    fun setHistoricalDays(days: Int) {
        prefs.historicalScanDays = days
        _uiState.update { it.copy(historicalDays = days) }
    }

    fun hasSmsPermissions(): Boolean {
        val context = getApplication<Application>()
        return ContextCompat.checkSelfPermission(context, Manifest.permission.READ_SMS) == PackageManager.PERMISSION_GRANTED &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED
    }

    fun scanHistoricalInbox(lookbackDays: Int = prefs.historicalScanDays, onFinished: ((ScanResult) -> Unit)? = null) {
        viewModelScope.launch {
            _uiState.update { it.copy(isScanning = true, scanSummary = null) }
            val result = SmsInboxScanner.scanHistoricalInbox(
                context = getApplication(),
                lookbackDays = lookbackDays
            )
            _uiState.update {
                buildSnapshot(
                    it.copy(
                        isScanning = false,
                        scanSummary = "Scanned ${result.totalScanned} messages • Found ${result.financialDiscovered} financial (${result.newCandidatesAdded} new, ${result.duplicatesSkipped} duplicates skipped)"
                    )
                )
            }
            onFinished?.invoke(result)
        }
    }

    /**
     * Imports a message explicitly shared by the user. Raw text is parsed in memory only;
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

            val suggestionDao = db.smsSuggestionDao()
            val transactionDao = db.transactionDao()
            val refMatchedTx = parsed.refNumber?.let { transactionDao.findByReference(it) }
            val amountMatchedTxs = transactionDao.findPotentialDuplicates(parsed.amountPaise, parsed.timestamp)
            val (duplicateStatus, matchedTxId) = TransactionDeduplicator.evaluateLedgerDuplicate(
                amountPaise = parsed.amountPaise,
                type = parsed.type,
                merchant = parsed.merchant,
                refNumber = parsed.refNumber,
                timestamp = parsed.timestamp,
                refMatchedTx = refMatchedTx,
                amountMatchedTxs = amountMatchedTxs
            )

            val candidate = SmsSuggestionEntity(
                id = parsed.id,
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
                duplicateStatus = duplicateStatus,
                matchedTransactionId = matchedTxId,
                rawSnippet = null
            )

            val exactRefMatch = parsed.refNumber?.takeIf { it.isNotBlank() }?.let { suggestionDao.findByRefNumber(it) }
            val nearbyMatches = suggestionDao.findNearMatches(
                parsed.amountPaise,
                parsed.timestamp,
                TransactionDeduplicator.CROSS_SOURCE_WINDOW_MILLIS
            )

            when (val decision = TransactionDeduplicator.evaluatePendingSuggestion(candidate, exactRefMatch, nearbyMatches)) {
                is TransactionDeduplicator.CandidateDecision.SkipDuplicate -> {
                    onResult(false)
                    return@launch
                }
                is TransactionDeduplicator.CandidateDecision.MergeIntoExisting -> {
                    suggestionDao.update(decision.mergedEntity)
                }
                is TransactionDeduplicator.CandidateDecision.InsertNew -> {
                    suggestionDao.insert(candidate)
                }
            }

            prefs.recordSuccessfulCapture("Share Sheet", timestamp)
            _uiState.update {
                buildSnapshot(
                    it.copy(scanSummary = "Message imported. Review the candidate before adding it to your ledger.")
                )
            }
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

    fun selectForEdit(suggestion: SmsSuggestion?) {
        _uiState.update { it.copy(selectedSuggestionForEdit = suggestion) }
    }

    fun setShowDisclosure(show: Boolean) {
        _uiState.update { it.copy(showDisclosure = show) }
    }
}
