package com.digitaldodo.arth.core.sms

import com.digitaldodo.arth.core.model.FinancialClassification
import com.digitaldodo.arth.core.model.PaymentMode
import com.digitaldodo.arth.core.model.TransactionType
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
    val confidence: Int,
    val bank: String? = null,
    val accountMask: String? = null,
    val classification: FinancialClassification = FinancialClassification.DEBIT,
    val balancePaise: Long? = null
)

object SmsParser {

    /**
     * Parses an incoming SMS message. Returns null if the message is non-financial,
     * promotional, an OTP, or cannot be parsed with sufficient confidence.
     */
    fun parse(sender: String, body: String, timestamp: Long): ParsedSms? {
        val parsed = FinancialMessageClassifier.classifyAndParse(sender, body, timestamp) ?: return null
        return ParsedSms(
            id = parsed.id,
            sender = parsed.sender,
            amountPaise = parsed.amountPaise,
            type = parsed.type,
            paymentMode = parsed.paymentMode,
            merchant = parsed.merchant,
            refNumber = parsed.refNumber,
            timestamp = parsed.timestamp,
            confidence = parsed.confidence,
            bank = parsed.bank,
            accountMask = parsed.accountMask,
            classification = parsed.classification,
            balancePaise = parsed.balancePaise
        )
    }
}
