package com.digitaldodo.arth.core.sms

import com.digitaldodo.arth.core.model.FinancialClassification
import com.digitaldodo.arth.core.model.Money
import com.digitaldodo.arth.core.model.PaymentMode
import com.digitaldodo.arth.core.model.TransactionType
import java.text.SimpleDateFormat
import java.util.*

data class ParsedFinancialMessage(
    val id: String = UUID.randomUUID().toString(),
    val sender: String,
    val bank: String?,
    val accountMask: String?,
    val amountPaise: Long,
    val currency: String = "INR",
    val type: TransactionType,
    val paymentMode: PaymentMode,
    val classification: FinancialClassification,
    val merchant: String?,
    val refNumber: String?,
    val balancePaise: Long?,
    val timestamp: Long,
    val confidence: Int,
    val isNeedsReview: Boolean = true
)

object FinancialMessageClassifier {

    data class BankProfile(
        val name: String,
        val shortCodes: Set<String>,
        val keywords: List<String>
    )

    private val supportedBanks = listOf(
        BankProfile("State Bank of India", setOf("SBIINB", "SBIBNK", "SBIPSG", "ATMSBI", "SBICRD", "SBIUPI", "SBIRTC"), listOf("SBI", "State Bank of India")),
        BankProfile("HDFC Bank", setOf("HDFCBK", "HDFCBN", "HDFCAL", "HDFCCC", "HDFCTX"), listOf("HDFC", "HDFC Bank")),
        BankProfile("ICICI Bank", setOf("ICICIB", "ICICIT", "IMOBILE", "ICICIC", "ICICIP"), listOf("ICICI", "ICICI Bank")),
        BankProfile("Axis Bank", setOf("AXISBK", "AXISBN", "AXISCD", "AXISIN"), listOf("Axis", "Axis Bank")),
        BankProfile("Kotak Mahindra Bank", setOf("KOTAKB", "KMBLBK", "KOTAKC"), listOf("Kotak", "Kotak Bank")),
        BankProfile("Punjab National Bank", setOf("PNBSMS", "PUNBNK", "PNBBANK"), listOf("PNB", "Punjab National Bank")),
        BankProfile("Bank of Baroda", setOf("BOBTXN", "BARBOD", "BOBALT"), listOf("BOB", "Bank of Baroda")),
        BankProfile("Canara Bank", setOf("CANBNK", "CNRBANK", "CANARA"), listOf("Canara", "Canara Bank")),
        BankProfile("IDFC FIRST Bank", setOf("IDFCFB", "IDFCBK", "IDFCFT"), listOf("IDFC", "IDFC FIRST")),
        BankProfile("IndusInd Bank", setOf("INDBNK", "INDUSB"), listOf("IndusInd", "IndusInd Bank")),
        BankProfile("Yes Bank", setOf("YESBNK", "YESBN"), listOf("Yes Bank")),
        BankProfile("Federal Bank", setOf("FEDBNK", "FDRLBK"), listOf("Federal Bank")),
        BankProfile("Union Bank of India", setOf("UBIN", "UNIONB"), listOf("Union Bank")),
        BankProfile("Standard Chartered", setOf("SCBANK", "SCBLIN"), listOf("Standard Chartered")),
        BankProfile("Citi Bank", setOf("CITIBK", "CITIIN"), listOf("Citi", "Citibank")),
        BankProfile("RBL Bank", setOf("RBLBNK", "RATNAK"), listOf("RBL", "RBL Bank")),
        BankProfile("Paytm Payments Bank", setOf("PAYTMB", "PYTM"), listOf("Paytm", "Paytm Payments Bank")),
        BankProfile("UPI / Payment Provider", setOf("GPAY", "PHNPAY", "PHONEPE", "CRED", "AMZPAY", "BHIM", "SLICE", "JUPITR", "FIBANK"), listOf("Google Pay", "PhonePe", "CRED", "Amazon Pay", "BHIM"))
    )

    // OTP & Authentication Discard
    private val otpPattern = Regex(
        "\\b(OTP|one[- ]time password|verification code|secret code|security code)\\b|" +
        "\\b(is your secret OTP|valid for [0-9]+ (?:min|minute|sec)|do not share|never share OTP)\\b",
        RegexOption.IGNORE_CASE
    )

    // Login / 2FA Discard
    private val loginAlertPattern = Regex(
        "\\b(logged in|login detected|netbanking login|password changed|profile updated|password reset)\\b",
        RegexOption.IGNORE_CASE
    )

    // Promotional Discard (unless accompanied by verified debit/credit confirmation)
    private val promoPattern = Regex(
        "\\b(congratulations|pre-approved|apply now|loan offer|credit card offer|discount|cashback offer|voucher inside|zero fee)\\b",
        RegexOption.IGNORE_CASE
    )

    // Balance alert without transaction
    private val balanceOnlyPattern = Regex(
        "^(?:(?:your|current)?\\s*(?:available balance|avl bal|a/c bal|balance in a/c|total bal)\\s*[:=]?\\s*(?:INR|Rs\\.?|₹)?\\s*[0-9,]+(?:\\.[0-9]{1,2})?\\s*\\.?)$|" +
        "\\b(?:your available balance in A/c [^ ]+ is (?:INR|Rs\\.?|₹)?\\s*[0-9,]+(?:\\.[0-9]{1,2})?\\.?)$",
        RegexOption.IGNORE_CASE
    )

    // Verbs indicating debit
    private val debitKeywords = Regex(
        "\\b(debited|spent|paid|sent|withdrawn|purchase at|purchase of|deducted|transferred to|payment of)\\b",
        RegexOption.IGNORE_CASE
    )

    // Verbs indicating credit
    private val creditKeywords = Regex(
        "\\b(credited|received|deposited|refunded|refund of|added to account|salary of|salary credited|interest credited)\\b",
        RegexOption.IGNORE_CASE
    )

    // Available Balance regex (separate from transaction amount)
    private val availableBalanceRegex = Regex(
        "\\b(?:Avl(?:\\.?|ailable)?\\s*Bal(?:ance)?|Bal(?:\\.?|ance)?\\s*(?:INR|Rs\\.?|₹)?|A/c\\s*bal(?:ance)?)\\s*[:=-]?\\s*(?:INR|Rs\\.?|₹)?\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)",
        RegexOption.IGNORE_CASE
    )

    // Transaction amount regex: captures verb + amount or currency + amount
    private val transactionAmountRegex = Regex(
        "(?:(?:debited\\s+(?:by|with)|credited\\s+(?:by|with)|spent|paid|withdrawn|transferred|salary of|refund of|payment of)\\s*(?:INR|Rs\\.?|₹)?\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?))|" +
        "(?:(?:INR|Rs\\.?|₹)\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)\\s*(?:debited|spent|paid|withdrawn|credited|received|deposited|transferred|refunded))|" +
        "(?:\\b(?:INR|Rs\\.?|₹)\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)\\b)",
        RegexOption.IGNORE_CASE
    )

    // UPI reference / UTR / RRN
    private val upiRefRegex = Regex(
        "\\b(?:UPI\\s*Ref(?:erence)?(?:\\s*no)?|UTR|RRN|Ref(?:erence)?\\s*(?:no|id)?|Txn(?:\\s*id)?|transaction\\s*id)\\s*[:#-]?\\s*([A-Za-z0-9]{6,25})\\b",
        RegexOption.IGNORE_CASE
    )

    // Masked Account or Card number (e.g. A/c XX1234, card ending 5678)
    private val accountMaskRegex = Regex(
        "\\b(?:A/c|Acct|Account|Card|card)\\s*(?:no\\.?)?\\s*[:#-]?\\s*[*X]*([0-9]{3,4})\\b|" +
        "\\bending\\s*(?:with\\s*)?[*X]*([0-9]{4})\\b",
        RegexOption.IGNORE_CASE
    )

    // Counterparty / Merchant
    private val merchantRegex = Regex(
        "\\b(?:to|at|vpa|towards|info\\s*:\\s*|by|from)\\s+([A-Za-z0-9][A-Za-z0-9 .&'_-]{1,40}?)(?=\\s+(?:on|using|via|ref|utr|upi|avl|bal|a/c|card|with|at)|[.,;]|$)",
        RegexOption.IGNORE_CASE
    )

    private val supportedDateFormats = listOf(
        "dd-MMM-yy", "dd-MMM-yyyy", "dd MMM yyyy", "dd MMM, yyyy",
        "dd-MM-yyyy", "dd/MM/yyyy", "dd.MM.yyyy", "yyyy-MM-dd"
    )

    /**
     * Identifies the financial institution from sender header or message body.
     */
    fun identifyBank(sender: String, body: String): Pair<String?, String?> {
        val cleanSender = sender.trim().uppercase(Locale.ROOT)
        // Strip common 2-character telecom prefix (e.g. "AD-HDFCBK" -> "HDFCBK", "VK-SBIINB" -> "SBIINB")
        val strippedSender = if (cleanSender.length >= 4 && cleanSender[2] == '-') {
            cleanSender.substring(3)
        } else {
            cleanSender
        }

        for (bank in supportedBanks) {
            for (code in bank.shortCodes) {
                if (strippedSender.contains(code) || cleanSender.contains(code)) {
                    return bank.name to code
                }
            }
        }

        for (bank in supportedBanks) {
            for (keyword in bank.keywords) {
                if (body.contains(keyword, ignoreCase = true)) {
                    return bank.name to (bank.shortCodes.firstOrNull())
                }
            }
        }

        return null to null
    }

    /**
     * Classifies and parses an incoming or historical SMS message.
     * Returns null if the message is non-financial, OTP, promotional, or unparseable.
     */
    fun classifyAndParse(sender: String, body: String, timestamp: Long): ParsedFinancialMessage? {
        val cleanBody = body.trim()
        if (cleanBody.isBlank()) return null

        // 1. Immediately discard OTPs
        if (otpPattern.containsMatchIn(cleanBody)) {
            return null
        }

        // 2. Discard login & security alerts
        if (loginAlertPattern.containsMatchIn(cleanBody) &&
            !debitKeywords.containsMatchIn(cleanBody) &&
            !creditKeywords.containsMatchIn(cleanBody)) {
            return null
        }

        // 3. Discard promotional messages without financial movements
        if (promoPattern.containsMatchIn(cleanBody) &&
            !debitKeywords.containsMatchIn(cleanBody) &&
            !creditKeywords.containsMatchIn(cleanBody)) {
            return null
        }

        // 4. Check pure balance enquiries
        if (balanceOnlyPattern.containsMatchIn(cleanBody)) {
            return null
        }

        // 5. Check failed / declined transactions
        val isFailed = cleanBody.contains("failed", ignoreCase = true) ||
            cleanBody.contains("declined", ignoreCase = true) ||
            cleanBody.contains("unsuccessful", ignoreCase = true) ||
            cleanBody.contains("could not be processed", ignoreCase = true)

        val isDebit = debitKeywords.containsMatchIn(cleanBody)
        val isCredit = creditKeywords.containsMatchIn(cleanBody)

        if (!isDebit && !isCredit && !isFailed) {
            return null
        }

        // 6. Extract available balance first so we don't confuse it with transaction amount
        val avlBalMatch = availableBalanceRegex.find(cleanBody)
        val balancePaise = avlBalMatch?.groupValues?.getOrNull(1)?.let { rawBal ->
            try {
                Money.rupeesToPaise(rawBal.replace(",", ""))
            } catch (_: Exception) {
                null
            }
        }

        // 7. Extract transaction amount
        val amountPaise = extractTransactionAmount(cleanBody, avlBalMatch?.range)
        if (amountPaise == null || amountPaise <= 0L) {
            return null
        }

        // 8. Determine classification & event type
        val classification = determineClassification(cleanBody, isDebit, isCredit, isFailed)

        val direction = when {
            classification == FinancialClassification.SALARY ||
            classification == FinancialClassification.INTEREST ||
            classification == FinancialClassification.REFUND ||
            classification == FinancialClassification.REVERSAL ||
            classification == FinancialClassification.UPI_RECEIPT ||
            (isCredit && !isDebit) -> TransactionType.INCOME
            else -> TransactionType.EXPENSE
        }

        // 9. Determine payment mode (Cash for ATM withdrawals; Online for UPI/Cards/Transfers)
        val isAtm = classification == FinancialClassification.ATM_WITHDRAWAL ||
            cleanBody.contains("ATM", ignoreCase = true) ||
            cleanBody.contains("cash withdrawal", ignoreCase = true)
        val paymentMode = if (isAtm) PaymentMode.CASH else PaymentMode.ONLINE

        // 10. Identify bank
        val (bankName, _) = identifyBank(sender, cleanBody)

        // 11. Extract masked account or card
        val accountMask = extractAccountMask(cleanBody)

        // 12. Extract reference number / UTR
        val refNumber = upiRefRegex.find(cleanBody)?.groupValues?.getOrNull(1)?.uppercase(Locale.ROOT)

        // 13. Extract counterparty / merchant
        val merchant = extractMerchant(cleanBody, direction)

        // 14. Extract explicit transaction date if present
        val parsedDate = extractDate(cleanBody) ?: timestamp

        // 15. Confidence scoring
        var confidence = 65
        if (bankName != null) confidence += 10
        if (!refNumber.isNullOrBlank()) confidence += 15
        if (!merchant.isNullOrBlank()) confidence += 10
        if (!accountMask.isNullOrBlank()) confidence += 5
        if (isDebit && isCredit) confidence -= 15 // Ambiguous dual verbs

        return ParsedFinancialMessage(
            sender = sender,
            bank = bankName,
            accountMask = accountMask,
            amountPaise = amountPaise,
            type = direction,
            paymentMode = paymentMode,
            classification = classification,
            merchant = merchant,
            refNumber = refNumber,
            balancePaise = balancePaise,
            timestamp = parsedDate,
            confidence = confidence.coerceIn(40, 100),
            isNeedsReview = confidence < 90 || merchant.isNullOrBlank()
        )
    }

    private fun extractTransactionAmount(body: String, balanceRange: IntRange?): Long? {
        val matches = transactionAmountRegex.findAll(body)
        for (match in matches) {
            // Avoid matching inside the Available Balance substring
            if (balanceRange != null && (match.range.first in balanceRange || match.range.last in balanceRange)) {
                continue
            }

            val amountStr = match.groupValues.drop(1).firstOrNull { it.isNotBlank() } ?: continue
            val cleanStr = amountStr.replace(",", "").trim()
            val paise = try {
                Money.rupeesToPaise(cleanStr)
            } catch (_: Exception) {
                null
            }

            if (paise != null && paise > 0L) {
                return paise
            }
        }
        return null
    }

    private fun determineClassification(
        body: String,
        isDebit: Boolean,
        isCredit: Boolean,
        isFailed: Boolean
    ): FinancialClassification {
        val lower = body.lowercase(Locale.ROOT)

        if (lower.contains("refunded") || lower.contains("refund of") || lower.contains("refund for")) {
            return FinancialClassification.REFUND
        }

        if (lower.contains("reversed") || lower.contains("credited back")) {
            return FinancialClassification.REVERSAL
        }

        if (isFailed) {
            return FinancialClassification.FAILED_TRANSACTION
        }

        if (lower.contains("withdrawn from atm") || lower.contains("atm cash") ||
            lower.contains("cash withdrawn at atm") || lower.contains("atm wdl")) {
            return FinancialClassification.ATM_WITHDRAWAL
        }

        if (lower.contains("salary of") || lower.contains("salary credited")) {
            return FinancialClassification.SALARY
        }

        if ((lower.contains("interest") && lower.contains("credit")) || lower.contains("interest for a/c")) {
            return FinancialClassification.INTEREST
        }

        if (lower.contains("upi") || lower.contains("vpa") || lower.contains("gpay") || lower.contains("phonepe")) {
            return if (isCredit && !isDebit) FinancialClassification.UPI_RECEIPT else FinancialClassification.UPI_PAYMENT
        }

        if (lower.contains("card ending") || lower.contains("credit card") || lower.contains("debit card") || lower.contains("card xx")) {
            return FinancialClassification.CARD_TRANSACTION
        }

        if (lower.contains("neft")) return FinancialClassification.NEFT
        if (lower.contains("imps")) return FinancialClassification.IMPS
        if (lower.contains("rtgs")) return FinancialClassification.RTGS

        return if (isCredit) FinancialClassification.CREDIT else FinancialClassification.DEBIT
    }

    private fun extractAccountMask(body: String): String? {
        val match = accountMaskRegex.find(body) ?: return null
        val digits = match.groupValues.drop(1).firstOrNull { it.isNotBlank() } ?: return null
        return "XX$digits"
    }

    private fun extractMerchant(body: String, direction: TransactionType): String? {
        val nonMerchantWords = setOf(
            "your", "bank", "account", "my", "a/c", "ac", "avl", "bal", "available",
            "transfer", "inr", "rs", "re", "rupees", "cash", "atm", "card", "pos", "info"
        )

        val cleanCandidates = { regex: Regex ->
            regex.findAll(body).mapNotNull { match ->
                match.groupValues.getOrNull(1)?.trim()?.trimEnd('.', ',', ';')
            }.filter { candidate ->
                val lower = candidate.lowercase(Locale.ROOT)
                val firstWord = lower.split(" ").firstOrNull() ?: ""
                candidate.length >= 2 &&
                !candidate.first().isDigit() &&
                firstWord !in nonMerchantWords &&
                !lower.startsWith("your") &&
                !lower.startsWith("a/c") &&
                !lower.startsWith("acct") &&
                !lower.contains("avl bal")
            }.toList()
        }

        return if (direction == TransactionType.EXPENSE) {
            val destinationRegex = Regex(
                "\\b(?:to|at|towards|vpa)\\s+([A-Za-z][A-Za-z0-9 .&'_-]{1,40}?)(?=\\s+(?:on|using|via|ref|utr|upi|avl|bal|a/c|card|debited|credited)|[.,;]|$)",
                RegexOption.IGNORE_CASE
            )
            val destMatches = cleanCandidates(destinationRegex)
            if (destMatches.isNotEmpty()) {
                return destMatches.first()
            }

            val byRegex = Regex(
                "(?<!debited\\s)(?<!credited\\s)\\b(?:by|info\\s*:\\s*)\\s+([A-Za-z][A-Za-z0-9 .&'_-]{1,40}?)(?=\\s+(?:on|using|via|ref|utr|upi|avl|bal|a/c|card|debited|credited)|[.,;]|$)",
                RegexOption.IGNORE_CASE
            )
            val byMatches = cleanCandidates(byRegex)
            if (byMatches.isNotEmpty()) {
                return byMatches.first()
            }

            null
        } else {
            val fromRegex = Regex(
                "\\b(?:from|by)\\s+([A-Za-z][A-Za-z0-9 .&'_-]{1,40}?)(?=\\s+(?:on|using|via|ref|utr|upi|avl|bal|a/c|card|credited|debited|to|for)|[.,;]|$)",
                RegexOption.IGNORE_CASE
            )
            cleanCandidates(fromRegex).firstOrNull()
        }
    }

    private fun extractDate(body: String): Long? {
        val dateTokenRegex = Regex("\\b(?:[0-9]{1,2}-[A-Za-z]{3}-[0-9]{2,4}|[0-9]{1,2}\\s+[A-Za-z]{3,9},?\\s+[0-9]{2,4}|[0-9]{1,2}[./-][0-9]{1,2}[./-][0-9]{2,4}|[0-9]{4}-[0-9]{1,2}-[0-9]{1,2})\\b")
        val token = dateTokenRegex.find(body)?.value ?: return null

        for (pattern in supportedDateFormats) {
            try {
                val sdf = SimpleDateFormat(pattern, Locale.ENGLISH).apply { isLenient = false }
                val parsed = sdf.parse(token)
                if (parsed != null) {
                    return parsed.time
                }
            } catch (_: Exception) {}
        }
        return null
    }
}
