package com.digitaldodo.arth.core.sms

import com.digitaldodo.arth.core.database.SmsSuggestionEntity
import com.digitaldodo.arth.core.model.FinancialClassification

/**
 * Pure notification-to-candidate mapping. Supports the user's current default SMS app
 * as well as user-allowlisted banking and UPI payment applications.
 */
object SmsNotificationParser {
    private const val MAX_CONTENT_LENGTH = 10_000

    /**
     * Strict default-SMS parser retained for backwards compatibility and unit tests.
     */
    fun parse(
        notificationPackage: String?,
        defaultSmsPackage: String?,
        title: String?,
        visibleText: String?,
        postedAt: Long,
        monitoringEnabled: Boolean
    ): ParsedFinancialMessage? {
        return parseAllowlisted(
            notificationPackage = notificationPackage,
            defaultSmsPackage = defaultSmsPackage,
            allowedPackages = emptySet(),
            allowDefaultSmsApp = true,
            title = title,
            visibleText = visibleText,
            postedAt = postedAt,
            monitoringEnabled = monitoringEnabled
        )
    }

    fun parseAllowlisted(
        notificationPackage: String?,
        defaultSmsPackage: String?,
        allowedPackages: Set<String>,
        allowDefaultSmsApp: Boolean = true,
        title: String?,
        visibleText: String?,
        postedAt: Long,
        monitoringEnabled: Boolean
    ): ParsedFinancialMessage? {
        if (!monitoringEnabled || notificationPackage.isNullOrBlank()) return null

        val isDefaultSms = allowDefaultSmsApp && !defaultSmsPackage.isNullOrBlank() && notificationPackage == defaultSmsPackage
        val isAllowedApp = notificationPackage in allowedPackages
        if (!isDefaultSms && !isAllowedApp) return null

        val content = visibleText?.take(MAX_CONTENT_LENGTH)?.trim().orEmpty()
        if (content.isBlank()) return null

        val providerHint = SupportedNotificationSources.findByPackage(notificationPackage)?.bankOrProviderHint
        val effectiveSender = title?.take(100)?.takeIf { it.isNotBlank() } ?: providerHint.orEmpty()
        val combinedBody = if (isAllowedApp && !title.isNullOrBlank() && !content.contains(title, ignoreCase = true)) {
            "${title.trim().trimEnd('.', ',', ';')}. $content"
        } else {
            content
        }

        val parsed = FinancialMessageClassifier.classifyAndParse(
            sender = effectiveSender,
            body = combinedBody,
            timestamp = postedAt
        ) ?: return null

        val normalized = if (!providerHint.isNullOrBlank() &&
            (parsed.bank.isNullOrBlank() || parsed.bank == "UPI / Payment Provider")
        ) {
            parsed.copy(bank = providerHint)
        } else {
            parsed
        }

        return normalized.takeUnless {
            it.classification in setOf(
                FinancialClassification.NON_FINANCIAL,
                FinancialClassification.BALANCE_ALERT,
                FinancialClassification.FAILED_TRANSACTION
            )
        }
    }

    fun toSuggestion(
        parsed: ParsedFinancialMessage,
        sourceLabel: String = "SMS notification"
    ): SmsSuggestionEntity = SmsSuggestionEntity(
        id = parsed.id,
        sender = sourceLabel,
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
