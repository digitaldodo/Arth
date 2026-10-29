package com.digitaldodo.arth

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class TransactionMessageParserTest {
    @Test fun parsesIndianRupeeDebitAndReference() {
        val result = TransactionMessageParser.parse("Bank alert", "INR 1,245.50 debited at Zomato via UPI. UTR: ABCD12345678", 1793251200000)
        assertEquals(TransactionMessageParser.Event.COMPLETED_DEBIT, result.event)
        assertEquals("1245.50", result.amount)
        assertEquals("expense", result.direction)
        assertEquals("Zomato", result.merchant)
        assertEquals("ABCD12345678", result.reference)
        assertEquals("UPI", result.method)
    }

    @Test fun parsesCreditAndRefundAsIncomeCandidates() {
        val credit = TransactionMessageParser.parse(null, "₹250.00 credited to your account from Acme", 1793251200000)
        val refund = TransactionMessageParser.parse(null, "Rs. 25.75 refunded by Shop", 1793251200000)
        assertEquals(TransactionMessageParser.Event.COMPLETED_CREDIT, credit.event)
        assertEquals("income", credit.direction)
        assertEquals("Acme", credit.merchant)
        assertEquals(TransactionMessageParser.Event.REFUND, refund.event)
        assertEquals("income", refund.direction)
    }

    @Test fun classifiesPendingFailedRequestsAndPromotionsWithoutSavingDirection() {
        assertEquals(TransactionMessageParser.Event.PENDING, TransactionMessageParser.parse(null, "₹100 payment pending to Shop", 1).event)
        assertEquals(TransactionMessageParser.Event.FAILED, TransactionMessageParser.parse(null, "₹100 payment failed to Shop", 1).event)
        assertEquals(TransactionMessageParser.Event.PAYMENT_REQUEST, TransactionMessageParser.parse(null, "Collect request ₹100 from Shop", 1).event)
        assertNull(TransactionMessageParser.parse(null, "₹100 payment pending to Shop", 1).direction)
        assertEquals(TransactionMessageParser.Event.NON_FINANCIAL, TransactionMessageParser.parse(null, "OTP 123456 for your account", 1).event)
    }

    @Test fun handlesRedactedAndAmbiguousContentWithoutInventingAmount() {
        assertEquals(TransactionMessageParser.Event.UNKNOWN, TransactionMessageParser.parse("Hidden content", null, 0).event)
        val result = TransactionMessageParser.parse(null, "Your account was debited at a merchant", 1793251200000)
        assertEquals(TransactionMessageParser.Event.COMPLETED_DEBIT, result.event)
        assertNull(result.amount)
        assertEquals(true, result.needsReview)
        val ambiguous = TransactionMessageParser.parse(null, "Transaction update for ₹400 at a shop", 1793251200000)
        assertEquals(TransactionMessageParser.Event.UNKNOWN, ambiguous.event)
        assertEquals(true, ambiguous.potentialCandidate)
        assertNull(ambiguous.direction)
    }

    @Test fun extractsDateAndUsesNotificationDateWhenMessageHasNoDate() {
        val textDate = TransactionMessageParser.parse(null, "₹10 paid at Cafe on 29/10/2026 at 10:30 PM", 0)
        val notificationDate = TransactionMessageParser.parse(null, "₹10 paid at Cafe", 1793251200000)
        assertEquals("2026-10-29", textDate.date)
        assertEquals("22:30", textDate.time)
        assertEquals(true, notificationDate.origins["date"] == "notification_time")
    }
}
