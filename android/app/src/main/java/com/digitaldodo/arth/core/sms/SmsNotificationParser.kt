package com.digitaldodo.arth.core.sms

import com.digitaldodo.arth.core.database.SmsSuggestionEntity
import com.digitaldodo.arth.core.model.FinancialClassification

/** Pure notification-to-candidate mapping. Only visible text from the default SMS app is accepted. */
object SmsNotificationParser {
    private const val MAX_CONTENT_LENGTH = 10_000

    fun parse(
        notificationPackage: String?,
        defaultSmsPackage: String?,
        title: String?,
        visibleText: String?,
        postedAt: Long,
        monitoringEnabled: Boolean
    ): ParsedFinancialMessage? {
        if (!monitoringEnabled || notificationPackage.isNullOrBlank() || defaultSmsPackage.isNullOrBlank()) return null
        if (!notificationPackage.equals(defaultSmsPackage, ignoreCase = false)) return null
        val content = visibleText?.take(MAX_CONTENT_LENGTH)?.trim().orEmpty()
        if (content.isBlank()) return null
        val parsed = FinancialMessageClassifier.classifyAndParse(
            sender = title?.take(100).orEmpty(),
            body = content,
            timestamp = postedAt
        ) ?: return null
        return parsed.takeUnless {
            it.classification in setOf(
                FinancialClassification.NON_FINANCIAL,
                FinancialClassification.BALANCE_ALERT,
                FinancialClassification.FAILED_TRANSACTION
            )
        }
    }

    fun toSuggestion(parsed: ParsedFinancialMessage): SmsSuggestionEntity = SmsSuggestionEntity(
        id = parsed.id,
        sender = "SMS notification",
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
        rawSnippet = null
    )
}
