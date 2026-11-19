package com.digitaldodo.arth.core.sms

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.provider.Telephony
import androidx.core.content.ContextCompat
import com.digitaldodo.arth.core.database.ArthDatabase
import com.digitaldodo.arth.core.database.SmsSuggestionEntity
import com.digitaldodo.arth.core.model.DuplicateStatus
import com.digitaldodo.arth.core.model.FinancialClassification
import com.digitaldodo.arth.core.model.SuggestionStatus
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

data class ScanResult(
    val totalScanned: Int,
    val financialDiscovered: Int,
    val duplicatesSkipped: Int,
    val newCandidatesAdded: Int,
    val lastTimestamp: Long
)

object SmsInboxScanner {

    suspend fun scanHistoricalInbox(
        context: Context,
        lookbackDays: Int = 30,
        maxMessages: Int = 1000
    ): ScanResult = withContext(Dispatchers.IO) {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED) {
            return@withContext ScanResult(0, 0, 0, 0, 0L)
        }

        val prefs = SmsPreferencesRepository(context)
        val cutoffTimestamp = if (lookbackDays > 0) {
            System.currentTimeMillis() - (lookbackDays.toLong() * 24L * 60L * 60L * 1000L)
        } else {
            0L
        }

        val db = ArthDatabase.getInstance(context)
        val suggestionDao = db.smsSuggestionDao()
        val transactionDao = db.transactionDao()

        var totalScanned = 0
        var financialDiscovered = 0
        var duplicatesSkipped = 0
        var newCandidatesAdded = 0
        var maxTimestampFound = prefs.lastScanTimestamp

        val projection = arrayOf(
            Telephony.Sms._ID,
            Telephony.Sms.ADDRESS,
            Telephony.Sms.BODY,
            Telephony.Sms.DATE,
            Telephony.Sms.DATE_SENT
        )

        val selection = "${Telephony.Sms.DATE} >= ?"
        val selectionArgs = arrayOf(cutoffTimestamp.toString())
        val sortOrder = "${Telephony.Sms.DATE} DESC"

        val resolver = context.contentResolver
        val cursor = try {
            resolver.query(
                Telephony.Sms.Inbox.CONTENT_URI,
                projection,
                selection,
                selectionArgs,
                sortOrder
            )
        } catch (_: Exception) {
            null
        }

        cursor?.use { c ->
            val addressCol = c.getColumnIndex(Telephony.Sms.ADDRESS)
            val bodyCol = c.getColumnIndex(Telephony.Sms.BODY)
            val dateCol = c.getColumnIndex(Telephony.Sms.DATE)

            while (c.moveToNext() && totalScanned < maxMessages) {
                totalScanned++
                val sender = if (addressCol >= 0) c.getString(addressCol) ?: "Unknown" else "Unknown"
                val body = if (bodyCol >= 0) c.getString(bodyCol) ?: "" else ""
                val date = if (dateCol >= 0) c.getLong(dateCol) else System.currentTimeMillis()

                if (date > maxTimestampFound) {
                    maxTimestampFound = date
                }

                // 100% on-device parse
                val parsed = FinancialMessageClassifier.classifyAndParse(sender, body, date) ?: continue

                // Exclude non-financial, OTP, balance only, or failed transactions
                if (parsed.classification == FinancialClassification.NON_FINANCIAL ||
                    parsed.classification == FinancialClassification.BALANCE_ALERT ||
                    parsed.classification == FinancialClassification.FAILED_TRANSACTION) {
                    continue
                }

                financialDiscovered++

                // Check duplicate in suggestions
                val alreadyExists = if (!parsed.refNumber.isNullOrBlank()) {
                    suggestionDao.findByRefNumber(parsed.refNumber) != null
                } else {
                    suggestionDao.findNearMatch(parsed.amountPaise, parsed.timestamp, 120000L) != null
                }

                if (alreadyExists) {
                    duplicatesSkipped++
                    continue
                }

                // Check duplicate in transactions
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
                newCandidatesAdded++
            }
        }

        prefs.lastScanTimestamp = maxTimestampFound
        prefs.incrementProcessedCount(newCandidatesAdded)

        ScanResult(
            totalScanned = totalScanned,
            financialDiscovered = financialDiscovered,
            duplicatesSkipped = duplicatesSkipped,
            newCandidatesAdded = newCandidatesAdded,
            lastTimestamp = maxTimestampFound
        )
    }
}
