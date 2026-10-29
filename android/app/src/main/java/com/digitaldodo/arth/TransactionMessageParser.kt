package com.digitaldodo.arth

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Local, conservative parser. Source content is consumed in memory and never retained. */
object TransactionMessageParser {
    enum class Event { COMPLETED_DEBIT, COMPLETED_CREDIT, REFUND, PENDING, FAILED, PAYMENT_REQUEST, NON_FINANCIAL, UNKNOWN }
    data class Parsed(
        val event: Event,
        val amount: String? = null,
        val direction: String? = null,
        val merchant: String? = null,
        val date: String? = null,
        val time: String? = null,
        val method: String? = null,
        val reference: String? = null,
        val confidence: Int = 0,
        val origins: Map<String, String> = emptyMap(),
        val needsReview: Boolean = true,
        val potentialCandidate: Boolean = false
    )

    private val amountPattern = Regex("(?:₹|\\bINR\\b|\\bRs\\.?\\s*)\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)", RegexOption.IGNORE_CASE)
    private val refPattern = Regex("\\b(?:UTR|RRN|reference|ref(?:erence)?\\s*(?:no|id)?|txn(?:\\s*id)?|transaction\\s*id)\\s*[:#-]?\\s*([A-Z0-9-]{6,})", RegexOption.IGNORE_CASE)
    private val merchantPattern = Regex("\\b(?:to|at|from|by|towards)\\s+([A-Z0-9][A-Z0-9 .&'_-]{1,48}?)(?=\\s+(?:on|at|from|via|using|ref|utr|upi|imps|neft|for|avl|available|bal|txn)\\b|[.,;|]|$)", RegexOption.IGNORE_CASE)
    private val dateFormats = listOf("dd-MM-yyyy", "dd/MM/yyyy", "dd.MM.yyyy", "dd MMM yyyy", "dd MMM, yyyy", "yyyy-MM-dd", "dd-MM-yy", "dd/MM/yy", "dd.MM.yy")

    fun parse(title: CharSequence?, text: CharSequence?, postedAt: Long): Parsed {
        val content = listOfNotNull(title?.toString(), text?.toString()).joinToString(" ").trim()
        if (content.isBlank() || content.contains("hidden content", true) || content.contains("content hidden", true) || content.contains("sensitive notification", true)) {
            return Parsed(Event.UNKNOWN)
        }
        // Exclude common one-time passwords and promotional-only messages before amount extraction.
        if (Regex("\\b(OTP|one[- ]time password|verification code|offer|cashback offer|promo code)\\b", RegexOption.IGNORE_CASE).containsMatchIn(content) &&
            !Regex("\\b(debited|credited|paid|payment successful|transaction successful)\\b", RegexOption.IGNORE_CASE).containsMatchIn(content)) {
            return Parsed(Event.NON_FINANCIAL)
        }

        val event = when {
            Regex("\\b(payment request|collect request|requested you to pay|pay request)\\b", RegexOption.IGNORE_CASE).containsMatchIn(content) -> Event.PAYMENT_REQUEST
            Regex("\\b(failed|declined|unsuccessful)\\b", RegexOption.IGNORE_CASE).containsMatchIn(content) -> Event.FAILED
            Regex("\\b(pending|processing|awaiting confirmation|reversal pending)\\b", RegexOption.IGNORE_CASE).containsMatchIn(content) -> Event.PENDING
            Regex("\\b(refund(?:ed)?|reversed|credited back)\\b", RegexOption.IGNORE_CASE).containsMatchIn(content) -> Event.REFUND
            Regex("\\b(credited|received|deposited|added to your account)\\b", RegexOption.IGNORE_CASE).containsMatchIn(content) &&
                Regex("\\b(success|successful|credited|received|deposited)\\b", RegexOption.IGNORE_CASE).containsMatchIn(content) -> Event.COMPLETED_CREDIT
            Regex("\\b(debited|spent|paid|sent|payment successful|transaction successful|purchase approved)\\b", RegexOption.IGNORE_CASE).containsMatchIn(content) -> Event.COMPLETED_DEBIT
            Regex("\\b(offer|promo|balance|statement|otp)\\b", RegexOption.IGNORE_CASE).containsMatchIn(content) &&
                !Regex("\\b(debited|credited|paid|sent|received)\\b", RegexOption.IGNORE_CASE).containsMatchIn(content) -> Event.NON_FINANCIAL
            else -> Event.UNKNOWN
        }
        val amount = amountPattern.find(content)?.groupValues?.getOrNull(1)?.replace(",", "")?.let {
            runCatching { java.math.BigDecimal(it).setScale(2, java.math.RoundingMode.UNNECESSARY).toPlainString() }.getOrNull()
        }
        val merchant = merchantPattern.findAll(content).mapNotNull { it.groupValues.getOrNull(1)?.trim()?.trimEnd('.', ',') }
            .firstOrNull { it.length >= 2 && !Regex("^(your\\s+)?(bank\\s+)?account$|^a/c$", RegexOption.IGNORE_CASE).matches(it) }
        val reference = refPattern.find(content)?.groupValues?.getOrNull(1)?.uppercase(Locale.ROOT)
        val parsedDate = dateFormats.firstNotNullOfOrNull { format ->
            Regex("\\b(?:[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}|[0-9]{1,2}[./-][0-9]{1,2}[./-][0-9]{2,4}|[0-9]{1,2}\\s+[A-Za-z]{3,9},?\\s+[0-9]{2,4})\\b").find(content)?.value?.let { token ->
                runCatching {
                    val parser = SimpleDateFormat(format, Locale.ENGLISH).apply { isLenient = false }
                    parser.parse(token)?.let { SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(it) }
                }.getOrNull()
            }
        } ?: if (postedAt > 0) SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(Date(postedAt)) else null
        val timeToken = Regex("\\b(?:[01]?\\d|2[0-3]):[0-5]\\d\\s*(?:AM|PM)?\\b", RegexOption.IGNORE_CASE).find(content)?.value
        val parsedTime = timeToken?.let { token ->
            runCatching {
                val hasMeridiem = Regex("\\b(?:AM|PM)\\b", RegexOption.IGNORE_CASE).containsMatchIn(token)
                val parser = SimpleDateFormat(if (hasMeridiem) "h:mm a" else "H:mm", Locale.ENGLISH).apply { isLenient = false }
                parser.parse(token.uppercase(Locale.ROOT))?.let { SimpleDateFormat("HH:mm", Locale.ROOT).format(it) }
            }.getOrNull()
        } ?: if (postedAt > 0) SimpleDateFormat("HH:mm", Locale.ROOT).format(Date(postedAt)) else null
        val method = when {
            Regex("\\bUPI\\b", RegexOption.IGNORE_CASE).containsMatchIn(content) -> "UPI"
            Regex("\\b(IMPS|NEFT|RTGS|ACH|NACH)\\b", RegexOption.IGNORE_CASE).containsMatchIn(content) -> Regex("\\b(IMPS|NEFT|RTGS|ACH|NACH)\\b", RegexOption.IGNORE_CASE).find(content)?.value?.uppercase(Locale.ROOT)
            Regex("\\b(card|POS|VISA|MASTERCARD|RUPAY)\\b", RegexOption.IGNORE_CASE).containsMatchIn(content) -> "Card"
            Regex("\\b(wallet|paytm|phonepe|gpay|google pay)\\b", RegexOption.IGNORE_CASE).containsMatchIn(content) -> "Online"
            else -> null
        }
        val direction = when (event) {
            Event.COMPLETED_CREDIT, Event.REFUND -> "income"
            Event.COMPLETED_DEBIT -> "expense"
            else -> null
        }
        val possibleUnknownTransaction = event == Event.UNKNOWN && amount != null &&
            Regex("\\b(account|payment|transaction|transfer|purchase|debit|credit|paid|received|bank|UPI)\\b", RegexOption.IGNORE_CASE).containsMatchIn(content)
        val origins = mutableMapOf<String, String>()
        if (amount != null) origins["amount"] = "message"
        if (direction != null) origins["direction"] = "rule"
        if (merchant != null) origins["merchant"] = "rule"
        if (reference != null) origins["reference"] = "message"
        if (parsedDate != null) origins["date"] = if (Regex("\\b(?:[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}|[0-9]{1,2}[./-][0-9]{1,2}[./-][0-9]{2,4}|[0-9]{1,2}\\s+[A-Za-z]{3,9})\\b").containsMatchIn(content)) "message" else "notification_time"
        if (parsedTime != null) origins["time"] = if (timeToken != null) "message" else "notification_time"
        if (method != null) origins["payment_method"] = "rule"
        val confidence = listOf(amount, direction, parsedDate).count { it != null } * 25 + (if (reference != null) 10 else 0) + (if (merchant != null) 10 else 0)
        return Parsed(event, amount, direction, merchant, parsedDate, parsedTime, method, reference, confidence.coerceAtMost(100), origins,
            needsReview = event !in setOf(Event.COMPLETED_DEBIT, Event.COMPLETED_CREDIT, Event.REFUND) || amount == null || merchant == null,
            potentialCandidate = possibleUnknownTransaction)
    }
}
