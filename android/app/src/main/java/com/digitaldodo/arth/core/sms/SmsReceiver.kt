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

        val pendingResult = goAsync()
        val appContext = context.applicationContext

        CoroutineScope(Dispatchers.IO).launch {
            try {
                // Parse on IO dispatcher entirely on-device in memory
                val parsed = FinancialMessageClassifier.classifyAndParse(sender, fullBody, timestamp)
                    ?: return@launch

                if (parsed.classification == FinancialClassification.NON_FINANCIAL ||
                    parsed.classification == FinancialClassification.BALANCE_ALERT ||
                    parsed.classification == FinancialClassification.FAILED_TRANSACTION) {
                    return@launch
                }

                val db = ArthDatabase.getInstance(appContext)
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

                val exactRefMatch = parsed.refNumber?.takeIf { it.isNotBlank() }?.let { suggestionDao.findByRefNumber(it) }
                val nearbyMatches = suggestionDao.findNearMatches(
                    parsed.amountPaise,
                    parsed.timestamp,
                    TransactionDeduplicator.CROSS_SOURCE_WINDOW_MILLIS
                )

                when (val decision = TransactionDeduplicator.evaluatePendingSuggestion(entity, exactRefMatch, nearbyMatches)) {
                    is TransactionDeduplicator.CandidateDecision.SkipDuplicate -> return@launch
                    is TransactionDeduplicator.CandidateDecision.MergeIntoExisting -> {
                        suggestionDao.update(
                            decision.mergedEntity.copy(
                                duplicateStatus = duplicateStatus,
                                matchedTransactionId = matchedTxId ?: decision.mergedEntity.matchedTransactionId
                            )
                        )
                        prefs.recordSuccessfulCapture(parsed.bank ?: "Bank SMS", parsed.timestamp)
                    }
                    is TransactionDeduplicator.CandidateDecision.InsertNew -> {
                        suggestionDao.insert(entity)
                        prefs.recordSuccessfulCapture(parsed.bank ?: "Bank SMS", parsed.timestamp)

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
                    }
                }
            } finally {
                pendingResult.finish()
            }
        }
    }
}
