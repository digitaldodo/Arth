package com.digitaldodo.arth

import com.digitaldodo.arth.core.model.PaymentMode
import com.digitaldodo.arth.core.model.TransactionType
import com.digitaldodo.arth.core.sms.SmsParser
import org.junit.Assert.*
import org.junit.Test

class SmsParserTest {

    @Test
    fun parsesSbiUpiDebitCorrectly() {
        val body = "Dear UPI user A/C X1234 debited by 450.00 on 03Nov26 by Swiggy Ref 630812984512"
        val parsed = SmsParser.parse("VK-SBIINB", body, 1793251200000)

        assertNotNull(parsed)
        assertEquals(45000L, parsed!!.amountPaise)
        assertEquals(TransactionType.EXPENSE, parsed.type)
        assertEquals(PaymentMode.ONLINE, parsed.paymentMode)
        assertEquals("630812984512", parsed.refNumber)
    }

    @Test
    fun parsesHdfcSalaryCreditCorrectly() {
        val body = "Salary of Rs. 85,000.00 credited to HDFC Bank A/c xx4567 on 01-Nov-26"
        val parsed = SmsParser.parse("AD-HDFCBK", body, 1793251200000)

        assertNotNull(parsed)
        assertEquals(8500000L, parsed!!.amountPaise)
        assertEquals(TransactionType.INCOME, parsed.type)
        assertEquals(PaymentMode.ONLINE, parsed.paymentMode)
    }

    @Test
    fun parsesAtmCashWithdrawalAsCashMode() {
        val body = "INR 2,000.00 withdrawn from ATM using card xx8901 on 02-Nov-26"
        val parsed = SmsParser.parse("ICICIB", body, 1793251200000)

        assertNotNull(parsed)
        assertEquals(200000L, parsed!!.amountPaise)
        assertEquals(TransactionType.EXPENSE, parsed.type)
        assertEquals(PaymentMode.CASH, parsed.paymentMode)
    }

    @Test
    fun parsesAxisUpiDebitWithMerchant() {
        val body = "Rs 150.00 debited from Axis Bank A/c 5678 to ChaiPoint via UPI Ref 998877665544"
        val parsed = SmsParser.parse("AXISBK", body, 1793251200000)

        assertNotNull(parsed)
        assertEquals(15000L, parsed!!.amountPaise)
        assertEquals(TransactionType.EXPENSE, parsed.type)
        assertEquals("ChaiPoint", parsed.merchant)
        assertEquals("998877665544", parsed.refNumber)
    }

    @Test
    fun discardsOtpAndTwoFactorMessages() {
        val otpBody = "OTP 849201 is your secret verification code for netbanking. Do not share."
        val parsed = SmsParser.parse("VK-SBIINB", otpBody, 1793251200000)
        assertNull(parsed)
    }

    @Test
    fun discardsMarketingAndLoanOffers() {
        val loanBody = "Congratulations! You are pre-approved for personal loan of 5 Lakhs. Apply now at bank.com/loan"
        val parsed = SmsParser.parse("HDFCBK", loanBody, 1793251200000)
        assertNull(parsed)
    }

    @Test
    fun discardsBalanceEnquiryWithoutTransaction() {
        val balBody = "Your available balance in A/c xx1234 is INR 45,210.00."
        val parsed = SmsParser.parse("ICICIB", balBody, 1793251200000)
        assertNull(parsed)
    }
}
