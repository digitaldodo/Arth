package com.digitaldodo.arth.core.sms

import com.digitaldodo.arth.core.model.Money
import com.digitaldodo.arth.core.model.PaymentMode
import com.digitaldodo.arth.core.model.TransactionType
import java.util.Locale
import java.util.UUID

data class ParsedSms(
    val id: String = UUID.randomUUID().toString(),
    val sender: String,
    val amountPaise: Long,
    val type: TransactionType,
    val paymentMode: PaymentMode,
    val merchant: String?,
    val refNumber: String?,
    val timestamp: Long,
    val confidence: Int
)

object SmsParser {

    private val amountRegex = Regex(
        "(?:(?:INR|Rs\\.?|₹|debited\\s+(?:by|with)|credited\\s+(?:by|with)|paid|for)\\s*)([0-9][0-9,]*(?:\\.[0-9]{1,2})?)",
        RegexOption.IGNORE_CASE
    )

    private val upiRefRegex = Regex(
        "\\b(?:UPI\\s*Ref(?:\\s*no)?|Ref(?:erence)?\\s*(?:no|id)?|UTR|txn(?:\\s*id)?)\\s*[:#-]?\\s*([A-Za-z0-9]{6,})",
        RegexOption.IGNORE_CASE
    )

    private val merchantRegex = Regex(
        "\\b(?:to|at|by|from|towards|info\\s*:\\s*|vpa)\\s+([A-Za-z0-9][A-Za-z0-9 .&'_-]{1,40}?)(?=\\s+(?:on|using|via|ref|utr|upi|avl|bal|a/c)|[.,;]|$)",
        RegexOption.IGNORE_CASE
    )

    private val otpPattern = Regex(
        "\\b(OTP|one[- ]time password|verification code|security code|secret code)\\b",
        RegexOption.IGNORE_CASE
    )

    private val promoPattern = Regex(
        "\\b(congratulations|pre-approved|apply now|loan offer|credit card offer|discount|cashback offer)\\b",
        RegexOption.IGNORE_CASE
    )

    private val debitKeywords = Regex(
        "\\b(debited|spent|paid|sent|withdrawn|purchase at|deducted)\\b",
        RegexOption.IGNORE_CASE
    )

    private val creditKeywords = Regex(
        "\\b(credited|received|deposited|refunded|added to account)\\b",
        RegexOption.IGNORE_CASE
    )

    /**
     * Parses an incoming SMS message. Returns null if the message is non-financial,
     * promotional, an OTP, or cannot be parsed with sufficient confidence.
     */
    fun parse(sender: String, body: String, timestamp: Long): ParsedSms? {
        val cleanBody = body.trim()
        if (cleanBody.isBlank()) return null

        // 1. Filter out OTPs and 2FA messages immediately
        if (otpPattern.containsMatchIn(cleanBody)) {
            // An OTP message should never become a transaction suggestion
            return null
        }

        // 2. Filter out pure promotional/marketing messages
        if (promoPattern.containsMatchIn(cleanBody) &&
            !debitKeywords.containsMatchIn(cleanBody) &&
            !creditKeywords.containsMatchIn(cleanBody)) {
            return null
        }

        // 3. Determine transaction type (debit / credit)
        val isDebit = debitKeywords.containsMatchIn(cleanBody)
        val isCredit = creditKeywords.containsMatchIn(cleanBody)

        if (!isDebit && !isCredit) {
            // Not a transaction notification
            return null
        }

        val type = if (isCredit) TransactionType.INCOME else TransactionType.EXPENSE

        // 4. Extract amount
        val amountMatch = amountRegex.find(cleanBody) ?: return null
        val amountRaw = amountMatch.groupValues[1].replace(",", "")
        val amountPaise = try {
            Money.rupeesToPaise(amountRaw)
        } catch (_: Exception) {
            return null
        }

        if (amountPaise <= 0L) return null

        // 5. Determine payment mode (Cash withdrawal vs Online)
        val isAtm = cleanBody.contains("ATM", ignoreCase = true) || cleanBody.contains("cash withdrawal", ignoreCase = true)
        val paymentMode = if (isAtm) PaymentMode.CASH else PaymentMode.ONLINE

        // 6. Extract counterparty / merchant
        val merchantCandidates = merchantRegex.findAll(cleanBody).mapNotNull { match ->
            match.groupValues.getOrNull(1)?.trim()?.trimEnd('.', ',')
        }.filter { candidate ->
            candidate.length >= 2 &&
            !Regex("^(your|bank|account|ac|my)\\b", RegexOption.IGNORE_CASE).matches(candidate) &&
            !candidate.contains("bank", ignoreCase = true)
        }.toList()

        val merchant = if (isDebit) {
            val toAtRegex = Regex(
                "\\b(?:to|at|vpa|towards)\\s+([A-Za-z0-9][A-Za-z0-9 .&'_-]{1,40}?)(?=\\s+(?:on|using|via|ref|utr|upi|avl|bal|a/c)|[.,;]|$)",
                RegexOption.IGNORE_CASE
            )
            toAtRegex.find(cleanBody)?.groupValues?.getOrNull(1)?.trim()?.trimEnd('.', ',')
                ?: merchantCandidates.firstOrNull()
        } else {
            merchantCandidates.firstOrNull()
        }

        // 7. Extract reference number / UTR
        val refNumber = upiRefRegex.find(cleanBody)?.groupValues?.getOrNull(1)?.uppercase(Locale.ROOT)

        // 8. Confidence calculation
        var confidence = 70
        if (refNumber != null) confidence += 15
        if (merchant != null) confidence += 15

        return ParsedSms(
            sender = sender,
            amountPaise = amountPaise,
            type = type,
            paymentMode = paymentMode,
            merchant = merchant,
            refNumber = refNumber,
            timestamp = timestamp,
            confidence = confidence.coerceAtMost(100)
        )
    }
}
