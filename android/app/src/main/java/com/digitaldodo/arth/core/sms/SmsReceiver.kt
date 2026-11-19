package com.digitaldodo.arth.core.sms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import com.digitaldodo.arth.core.database.ArthDatabase
import com.digitaldodo.arth.core.database.SmsSuggestionEntity
import com.digitaldodo.arth.core.model.DuplicateStatus
import com.digitaldodo.arth.core.model.FinancialClassification
import com.digitaldodo.arth.core.model.SuggestionStatus
import com.digitaldodo.arth.data.repository.SmsSuggestionRepository
import com.digitaldodo.arth.data.repository.TransactionRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class SmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

        val prefs = SmsPreferencesRepository(context)
        if (!prefs.isTrackingEnabled || prefs.isTrackingPaused) {
            return
        }

        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
        if (messages.isNullOrEmpty()) return

        val fullBody = buildString {
            for (msg in messages) {
                append(msg.displayMessageBody)
            }
        }
        val sender = messages[0].displayOriginatingAddress ?: "Unknown"
        val timestamp = messages[0].timestampMillis

        // Parse entirely on-device in memory
        val parsed = FinancialMessageClassifier.classifyAndParse(sender, fullBody, timestamp) ?: return

        // Exclude non-financial, balance only, or failed transactions from pending queue
        if (parsed.classification == FinancialClassification.NON_FINANCIAL ||
            parsed.classification == FinancialClassification.BALANCE_ALERT ||
            parsed.classification == FinancialClassification.FAILED_TRANSACTION) {
            return
        }

        val pendingResult = goAsync()
        val appContext = context.applicationContext

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val db = ArthDatabase.getInstance(appContext)
                val suggestionDao = db.smsSuggestionDao()
                val transactionDao = db.transactionDao()

                // Check duplicate in suggestions
                if (!parsed.refNumber.isNullOrBlank()) {
                    val existing = suggestionDao.findByRefNumber(parsed.refNumber)
                    if (existing != null) return@launch
                } else {
                    val nearMatch = suggestionDao.findNearMatch(parsed.amountPaise, parsed.timestamp, 120000L)
                    if (nearMatch != null && nearMatch.merchant == parsed.merchant) return@launch
                }

                // Check duplicate in confirmed transactions
                var duplicateStatus = DuplicateStatus.UNIQUE.name
                var matchedTxId: String? = null

                if (!parsed.refNumber.isNullOrBlank()) {
                    val txMatch = transactionDao.findByReference(parsed.refNumber)
                    if (txMatch != null) {
                        duplicateStatus = DuplicateStatus.POTENTIAL_DUPLICATE.name
                        matchedTxId = txMatch.id
                    }
                }

                if (matchedTxId == null) {
                    val potentialDups = transactionDao.findPotentialDuplicates(parsed.amountPaise, parsed.timestamp)
                    if (potentialDups.isNotEmpty()) {
                        duplicateStatus = DuplicateStatus.POTENTIAL_DUPLICATE.name
                        matchedTxId = potentialDups.first().id
                    }
                }

                val entity = SmsSuggestionEntity(
                    id = parsed.id,
                    sender = parsed.sender,
                    amountPaise = parsed.amountPaise,
                    type = parsed.type.name,
                    paymentMode = parsed.paymentMode.name,
                    merchant = parsed.merchant,
                    refNumber = parsed.refNumber,
                    smsTimestamp = parsed.timestamp,
                    confidence = parsed.confidence,
                    status = SuggestionStatus.PENDING.name,
                    bank = parsed.bank,
                    accountMask = parsed.accountMask,
                    classification = parsed.classification.name,
                    balancePaise = parsed.balancePaise,
                    duplicateStatus = duplicateStatus,
                    matchedTransactionId = matchedTxId,
                    rawSnippet = null
                )

                suggestionDao.insert(entity)
                prefs.incrementProcessedCount(1)

                // Optional auto-add if explicitly enabled by user, high confidence, and uniquely verified
                if (prefs.isAutoAddEnabled && parsed.confidence >= 95 && duplicateStatus == DuplicateStatus.UNIQUE.name) {
                    val smsRepo = SmsSuggestionRepository(
                        suggestionDao,
                        TransactionRepository(
                            transactionDao,
                            db.accountBalancesDao(),
                            db.syncOutboxDao(),
                            appContext
                        )
                    )
                    smsRepo.autoConfirmIfEligible(entity.toDomain(), db.categoryDao())
                }
            } finally {
                pendingResult.finish()
            }
        }
    }
}
