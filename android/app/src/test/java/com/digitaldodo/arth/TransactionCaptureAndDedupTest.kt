package com.digitaldodo.arth

import com.digitaldodo.arth.core.database.SmsSuggestionEntity
import com.digitaldodo.arth.core.database.TransactionEntity
import com.digitaldodo.arth.core.model.DuplicateStatus
import com.digitaldodo.arth.core.model.FinancialClassification
import com.digitaldodo.arth.core.model.TransactionType
import com.digitaldodo.arth.core.sms.FinancialMessageClassifier
import com.digitaldodo.arth.core.sms.SmsNotificationParser
import com.digitaldodo.arth.core.sms.SupportedNotificationSources
import com.digitaldodo.arth.core.sms.TransactionDeduplicator
import org.junit.Assert.*
import org.junit.Test

/**
 * Synthetic verification tests for notification-based capture, Hindi/Indian formats,
 * mandate/redaction exclusions, and cross-channel duplicate prevention.
 * Contains synthetic fixtures only — no personal financial messages.
 */
class TransactionCaptureAndDedupTest {
    private val postedAt = 1_793_251_200_000L

    @Test
    fun capturesAllowlistedGooglePayAndPhonePeNotifications() {
        val gpay = SmsNotificationParser.parseAllowlisted(
            notificationPackage = "com.google.android.apps.nbu.paisa.user",
            defaultSmsPackage = "com.google.android.apps.messaging",
            allowedPackages = SupportedNotificationSources.defaultAllowedPackages,
            title = "Paid ₹340.00 to Demo Cafe",
            visibleText = "Paid using HDFC Bank XX1234. UPI Ref 554433221100",
            postedAt = postedAt,
            monitoringEnabled = true
        )
        assertNotNull(gpay)
        assertEquals(34_000L, gpay!!.amountPaise)
        assertEquals(TransactionType.EXPENSE, gpay.type)
        assertEquals("554433221100", gpay.refNumber)
        assertEquals("Demo Cafe", gpay.merchant)

        val phonePe = SmsNotificationParser.parseAllowlisted(
            notificationPackage = "com.phonepe.app",
            defaultSmsPackage = "com.google.android.apps.messaging",
            allowedPackages = SupportedNotificationSources.defaultAllowedPackages,
            title = "Payment Received",
            visibleText = "Received ₹750.00 from Sample Contact via PhonePe UPI",
            postedAt = postedAt,
            monitoringEnabled = true
        )
        assertNotNull(phonePe)
        assertEquals(75_000L, phonePe!!.amountPaise)
        assertEquals(TransactionType.INCOME, phonePe.type)
        assertEquals("PhonePe", phonePe.bank)
    }

    @Test
    fun rejectsUnrelatedPackagesEvenWhenContentLooksFinancial() {
        val blocked = SmsNotificationParser.parseAllowlisted(
            notificationPackage = "com.whatsapp",
            defaultSmsPackage = "com.google.android.apps.messaging",
            allowedPackages = SupportedNotificationSources.defaultAllowedPackages,
            title = "Group Chat",
            visibleText = "Rs 500.00 paid to Demo Shop via UPI Ref 112233445566",
            postedAt = postedAt,
            monitoringEnabled = true
        )
        assertNull(blocked)
    }

    @Test
    fun discardsRedactedOtpAndPaymentReminders() {
        assertNull(
            FinancialMessageClassifier.classifyAndParse(
                "Messages",
                "Sensitive notification content hidden",
                postedAt
            )
        )
        assertNull(
            FinancialMessageClassifier.classifyAndParse(
                "AD-HDFCBK",
                "Upcoming autopay of INR 999.00 on 05-Nov-26 due on your card XX1111.",
                postedAt
            )
        )
        assertNull(
            FinancialMessageClassifier.classifyAndParse(
                "VK-SBIINB",
                "Collect request of Rs 500.00 from Sample User. Payment reminder.",
                postedAt
            )
        )
    }

    @Test
    fun parsesSyntheticHindiTransactionPatternsDeterministically() {
        val hindiDebit = FinancialMessageClassifier.classifyAndParse(
            sender = "VM-BANKIN",
            body = "आपके खाते XX1234 से रु 250.00 डेबिट हुए Demo Mart पर Ref 998877665544",
            timestamp = postedAt
        )
        assertNotNull(hindiDebit)
        assertEquals(25_000L, hindiDebit!!.amountPaise)
        assertEquals(TransactionType.EXPENSE, hindiDebit.type)
        assertEquals("998877665544", hindiDebit.refNumber)

        val hindiCredit = FinancialMessageClassifier.classifyAndParse(
            sender = "VK-BANKIN",
            body = "आपके खाते XX1234 में रुपये 1,500.00 जमा हुए Ref 445566778899",
            timestamp = postedAt
        )
        assertNotNull(hindiCredit)
        assertEquals(150_000L, hindiCredit!!.amountPaise)
        assertEquals(TransactionType.INCOME, hindiCredit.type)
    }

    @Test
    fun deduplicatesAndEnrichesCrossChannelNotificationAndSmsWithoutMergingDifferentMerchants() {
        val gpayCandidate = SmsSuggestionEntity(
            id = "cand-gpay",
            sender = "App · Google Pay",
            amountPaise = 45_000L,
            type = TransactionType.EXPENSE.name,
            paymentMode = "ONLINE",
            merchant = "Demo Grocer",
            refNumber = null,
            smsTimestamp = postedAt,
            confidence = 85
        )
        val bankSmsCandidate = SmsSuggestionEntity(
            id = "cand-sms",
            sender = "HDFCBK",
            amountPaise = 45_000L,
            type = TransactionType.EXPENSE.name,
            paymentMode = "ONLINE",
            merchant = "Demo Grocer",
            refNumber = "665544332211",
            smsTimestamp = postedAt + 25_000L,
            confidence = 95,
            bank = "HDFC Bank",
            accountMask = "XX4321"
        )

        val enrichedDecision = TransactionDeduplicator.evaluatePendingSuggestion(
            incoming = bankSmsCandidate,
            exactRefMatch = null,
            nearbyAmountMatches = listOf(gpayCandidate)
        )
        assertTrue(enrichedDecision is TransactionDeduplicator.CandidateDecision.MergeIntoExisting)
        val merged = (enrichedDecision as TransactionDeduplicator.CandidateDecision.MergeIntoExisting).mergedEntity
        assertEquals("665544332211", merged.refNumber)
        assertEquals("HDFC Bank", merged.bank)
        assertEquals("XX4321", merged.accountMask)

        // Same amount within window, distinct merchant names -> must NOT merge!
        val differentMerchantCandidate = gpayCandidate.copy(
            id = "cand-other",
            merchant = "City Metro",
            smsTimestamp = postedAt + 15_000L
        )
        val distinctDecision = TransactionDeduplicator.evaluatePendingSuggestion(
            incoming = differentMerchantCandidate,
            exactRefMatch = null,
            nearbyAmountMatches = listOf(gpayCandidate)
        )
        assertTrue(distinctDecision is TransactionDeduplicator.CandidateDecision.InsertNew)
    }

    @Test
    fun flagsConfirmedLedgerMatchesAsPotentialDuplicate() {
        val existingTx = TransactionEntity(
            id = "tx-1",
            userId = "user-1",
            amountPaise = 45_000L,
            type = TransactionType.EXPENSE.name,
            paymentMode = "ONLINE",
            necessity = "essential",
            categoryId = "cat-food-dining",
            categoryName = "Food & Dining",
            categoryIcon = "🍽️",
            categoryColor = "#3B82F6",
            transactionDate = postedAt,
            notes = "Ref: 665544332211",
            counterparty = "Demo Grocer",
            createdAt = postedAt,
            updatedAt = postedAt
        )
        val (status, matchedId) = TransactionDeduplicator.evaluateLedgerDuplicate(
            amountPaise = 45_000L,
            type = TransactionType.EXPENSE,
            merchant = "Demo Grocer",
            refNumber = "665544332211",
            timestamp = postedAt + 10_000L,
            refMatchedTx = existingTx,
            amountMatchedTxs = listOf(existingTx)
        )
        assertEquals(DuplicateStatus.POTENTIAL_DUPLICATE.name, status)
        assertEquals("tx-1", matchedId)
    }
}
