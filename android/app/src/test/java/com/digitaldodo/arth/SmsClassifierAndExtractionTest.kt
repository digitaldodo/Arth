package com.digitaldodo.arth

import com.digitaldodo.arth.core.model.FinancialClassification
import com.digitaldodo.arth.core.model.PaymentMode
import com.digitaldodo.arth.core.model.TransactionType
import com.digitaldodo.arth.core.sms.FinancialMessageClassifier
import org.junit.Assert.*
import org.junit.Test

class SmsClassifierAndExtractionTest {

    private val baseTimestamp = 1793251200000L // 03 Nov 2026

    // =========================================================================
    // 1. Bank Debit Alerts
    // =========================================================================

    @Test
    fun parsesSbiDebitAlert() {
        val body = "Dear UPI user A/C X1234 debited by 450.00 on 03Nov26 by Swiggy Ref 630812984512"
        val parsed = FinancialMessageClassifier.classifyAndParse("VK-SBIINB", body, baseTimestamp)

        assertNotNull(parsed)
        assertEquals(45000L, parsed!!.amountPaise)
        assertEquals(TransactionType.EXPENSE, parsed.type)
        assertEquals(PaymentMode.ONLINE, parsed.paymentMode)
        assertEquals("State Bank of India", parsed.bank)
        assertEquals("XX1234", parsed.accountMask)
        assertEquals("630812984512", parsed.refNumber)
        assertEquals("Swiggy", parsed.merchant)
        assertEquals(FinancialClassification.UPI_PAYMENT, parsed.classification)
    }

    @Test
    fun parsesHdfcDebitAlertWithAvailableBalance() {
        val body = "Rs 1,450.00 debited from HDFC Bank A/c **4567 on 03-Nov-26 towards Zomato. Avl Bal Rs 24,550.00. Ref 429104829104"
        val parsed = FinancialMessageClassifier.classifyAndParse("AD-HDFCBK", body, baseTimestamp)

        assertNotNull(parsed)
        assertEquals(145000L, parsed!!.amountPaise)
        assertEquals(2455000L, parsed.balancePaise)
        assertEquals(TransactionType.EXPENSE, parsed.type)
        assertEquals("HDFC Bank", parsed.bank)
        assertEquals("XX4567", parsed.accountMask)
        assertEquals("Zomato", parsed.merchant)
        assertEquals("429104829104", parsed.refNumber)
    }

    @Test
    fun parsesIciciDebitAlert() {
        val body = "Dear Customer, ICICI Bank Acct XX7890 debited for INR 750.50 on 03-Nov-26. Info: Uber India. Avl Bal: INR 12,340.25. UTR: 887766554433"
        val parsed = FinancialMessageClassifier.classifyAndParse("BP-ICICIB", body, baseTimestamp)

        assertNotNull(parsed)
        assertEquals(75050L, parsed!!.amountPaise)
        assertEquals(1234025L, parsed.balancePaise)
        assertEquals("ICICI Bank", parsed.bank)
        assertEquals("XX7890", parsed.accountMask)
        assertEquals("Uber India", parsed.merchant)
        assertEquals("887766554433", parsed.refNumber)
    }

    @Test
    fun parsesAxisDebitAlert() {
        val body = "Axis Bank A/c 5678 debited by INR 320.00 on 03-Nov-26 to Blinkit via UPI. Available Balance INR 8,900.00. Ref: 112233445566"
        val parsed = FinancialMessageClassifier.classifyAndParse("VM-AXISBK", body, baseTimestamp)

        assertNotNull(parsed)
        assertEquals(32000L, parsed!!.amountPaise)
        assertEquals(890000L, parsed.balancePaise)
        assertEquals("Axis Bank", parsed.bank)
        assertEquals("XX5678", parsed.accountMask)
        assertEquals("Blinkit", parsed.merchant)
        assertEquals("112233445566", parsed.refNumber)
    }

    @Test
    fun parsesKotakDebitAlert() {
        val body = "Sent Rs. 1,200.00 from Kotak Bank A/c *8901 to Reliance Fresh on 03-Nov-26. Bal: Rs. 45,000.00. UPI Ref: 998811223344"
        val parsed = FinancialMessageClassifier.classifyAndParse("JM-KOTAKB", body, baseTimestamp)

        assertNotNull(parsed)
        assertEquals(120000L, parsed!!.amountPaise)
        assertEquals(4500000L, parsed.balancePaise)
        assertEquals("Kotak Mahindra Bank", parsed.bank)
        assertEquals("XX8901", parsed.accountMask)
        assertEquals("Reliance Fresh", parsed.merchant)
        assertEquals("998811223344", parsed.refNumber)
    }

    @Test
    fun parsesPnbDebitAlert() {
        val body = "A/c *3412 debited with Rs. 500.00 on 03-Nov-2026 by transfer to Mother Dairy. PNB"
        val parsed = FinancialMessageClassifier.classifyAndParse("BW-PNBSMS", body, baseTimestamp)

        assertNotNull(parsed)
        assertEquals(50000L, parsed!!.amountPaise)
        assertEquals("Punjab National Bank", parsed.bank)
        assertEquals("XX3412", parsed.accountMask)
        assertEquals("Mother Dairy", parsed.merchant)
    }

    @Test
    fun parsesBobDebitAlert() {
        val body = "Bank of Baroda: INR 650.00 debited from A/c XX2345 on 03-Nov-26 at Apollo Pharmacy. Avl Bal: INR 15,200.00. Txn ID: BOB98765432"
        val parsed = FinancialMessageClassifier.classifyAndParse("BZ-BOBTXN", body, baseTimestamp)

        assertNotNull(parsed)
        assertEquals(65000L, parsed!!.amountPaise)
        assertEquals(1520000L, parsed.balancePaise)
        assertEquals("Bank of Baroda", parsed.bank)
        assertEquals("XX2345", parsed.accountMask)
        assertEquals("Apollo Pharmacy", parsed.merchant)
        assertEquals("BOB98765432", parsed.refNumber)
    }

    @Test
    fun parsesCanaraBankDebitAlert() {
        val body = "Canara Bank: Your A/c ending 6789 is debited by Rs. 2,100.00 on 03-11-2026. Ref: CNR77665544."
        val parsed = FinancialMessageClassifier.classifyAndParse("CB-CANBNK", body, baseTimestamp)

        assertNotNull(parsed)
        assertEquals(210000L, parsed!!.amountPaise)
        assertEquals("Canara Bank", parsed.bank)
        assertEquals("XX6789", parsed.accountMask)
        assertEquals("CNR77665544", parsed.refNumber)
    }

    @Test
    fun parsesIdfcFirstDebitAlert() {
        val body = "INR 890.00 spent on IDFC FIRST Bank Card ending 1234 on 03-Nov-26 at DMART. Avl limit: INR 45,000.00. Txn: IDF998877"
        val parsed = FinancialMessageClassifier.classifyAndParse("AD-IDFCFB", body, baseTimestamp)

        assertNotNull(parsed)
        assertEquals(89000L, parsed!!.amountPaise)
        assertEquals("IDFC FIRST Bank", parsed.bank)
        assertEquals("XX1234", parsed.accountMask)
        assertEquals("DMART", parsed.merchant)
        assertEquals(FinancialClassification.CARD_TRANSACTION, parsed.classification)
    }

    // =========================================================================
    // 2. Bank Credit Alerts, Salary & Interest
    // =========================================================================

    @Test
    fun parsesSalaryCreditAlert() {
        val body = "Salary of Rs. 85,000.00 credited to HDFC Bank A/c xx4567 on 01-Nov-26. Total Bal: Rs 1,45,000.00"
        val parsed = FinancialMessageClassifier.classifyAndParse("AD-HDFCBK", body, baseTimestamp)

        assertNotNull(parsed)
        assertEquals(8500000L, parsed!!.amountPaise)
        assertEquals(14500000L, parsed.balancePaise)
        assertEquals(TransactionType.INCOME, parsed.type)
        assertEquals(FinancialClassification.SALARY, parsed.classification)
    }

    @Test
    fun parsesInterestCreditAlert() {
        val body = "Interest of INR 1,245.00 credited to your A/c XX1234 on 31-Oct-26. State Bank of India"
        val parsed = FinancialMessageClassifier.classifyAndParse("VK-SBIINB", body, baseTimestamp)

        assertNotNull(parsed)
        assertEquals(124500L, parsed!!.amountPaise)
        assertEquals(TransactionType.INCOME, parsed.type)
        assertEquals(FinancialClassification.INTEREST, parsed.classification)
    }

    @Test
    fun parsesUpiReceiptCreditAlert() {
        val body = "Rs 500.00 credited to your Axis Bank A/c 5678 from Rahul Sharma via UPI. UPI Ref: 432198765432"
        val parsed = FinancialMessageClassifier.classifyAndParse("VM-AXISBK", body, baseTimestamp)

        assertNotNull(parsed)
        assertEquals(50000L, parsed!!.amountPaise)
        assertEquals(TransactionType.INCOME, parsed.type)
        assertEquals("Rahul Sharma", parsed.merchant)
        assertEquals("432198765432", parsed.refNumber)
        assertEquals(FinancialClassification.UPI_RECEIPT, parsed.classification)
    }

    // =========================================================================
    // 3. Card Transactions & ATM Cash Withdrawals
    // =========================================================================

    @Test
    fun parsesCreditCardTransaction() {
        val body = "INR 3,499.00 spent on ICICI Bank Credit Card ending 9876 on 03-Nov-26 at Amazon. Avl Limit: INR 85,000.00. Ref: CC123456"
        val parsed = FinancialMessageClassifier.classifyAndParse("BP-ICICIB", body, baseTimestamp)

        assertNotNull(parsed)
        assertEquals(349900L, parsed!!.amountPaise)
        assertEquals(TransactionType.EXPENSE, parsed.type)
        assertEquals(PaymentMode.ONLINE, parsed.paymentMode)
        assertEquals("Amazon", parsed.merchant)
        assertEquals("XX9876", parsed.accountMask)
        assertEquals(FinancialClassification.CARD_TRANSACTION, parsed.classification)
    }

    @Test
    fun parsesAtmCashWithdrawalAsCashMode() {
        val body = "INR 2,000.00 withdrawn from ATM using card xx8901 on 02-Nov-26. Avl Bal: INR 15,000.00"
        val parsed = FinancialMessageClassifier.classifyAndParse("ICICIB", body, baseTimestamp)

        assertNotNull(parsed)
        assertEquals(200000L, parsed!!.amountPaise)
        assertEquals(TransactionType.EXPENSE, parsed.type)
        assertEquals(PaymentMode.CASH, parsed.paymentMode)
        assertEquals(FinancialClassification.ATM_WITHDRAWAL, parsed.classification)
    }

    // =========================================================================
    // 4. Refunds & Reversals
    // =========================================================================

    @Test
    fun parsesRefundCorrectlyAsIncome() {
        val body = "Refund of Rs. 450.00 from Swiggy credited to HDFC Bank A/c 4567 on 03-Nov-26. Ref: REF998877"
        val parsed = FinancialMessageClassifier.classifyAndParse("AD-HDFCBK", body, baseTimestamp)

        assertNotNull(parsed)
        assertEquals(45000L, parsed!!.amountPaise)
        assertEquals(TransactionType.INCOME, parsed.type)
        assertEquals("Swiggy", parsed.merchant)
        assertEquals("REF998877", parsed.refNumber)
        assertEquals(FinancialClassification.REFUND, parsed.classification)
    }

    @Test
    fun parsesReversalCorrectlyAsIncome() {
        val body = "Reversed: Rs 250.00 credited back to your SBI A/c 1234 on 03-Nov-26 for failed merchant transaction."
        val parsed = FinancialMessageClassifier.classifyAndParse("VK-SBIINB", body, baseTimestamp)

        assertNotNull(parsed)
        assertEquals(25000L, parsed!!.amountPaise)
        assertEquals(TransactionType.INCOME, parsed.type)
        assertEquals(FinancialClassification.REVERSAL, parsed.classification)
    }

    // =========================================================================
    // 5. Failed Transactions (Must not enter ledger)
    // =========================================================================

    @Test
    fun marksFailedTransactionWithoutEnteringLedger() {
        val body = "Transaction of INR 1,500.00 at Flipkart failed due to technical error. Your A/c was not debited."
        val parsed = FinancialMessageClassifier.classifyAndParse("HDFCBK", body, baseTimestamp)

        assertNotNull(parsed)
        assertEquals(FinancialClassification.FAILED_TRANSACTION, parsed!!.classification)
    }

    // =========================================================================
    // 6. Multiple Numbers in One Message (Balance vs Amount vs Reference)
    // =========================================================================

    @Test
    fun correctlySeparatesAvailableBalanceFromTransactionAmount() {
        val body = "Dear Customer, INR 550.00 debited from A/c XX4321 on 03-Nov-26. Info: Cafe Coffee Day. Avl Bal: INR 1,50,000.00. UTR: 778899001122"
        val parsed = FinancialMessageClassifier.classifyAndParse("BP-ICICIB", body, baseTimestamp)

        assertNotNull(parsed)
        // Transaction amount must be ₹550.00 (55000 paise), NOT the available balance of ₹1,50,000.00!
        assertEquals(55000L, parsed!!.amountPaise)
        // Available balance must be ₹1,50,000.00 (15000000 paise)
        assertEquals(15000000L, parsed.balancePaise)
        assertEquals("778899001122", parsed.refNumber)
        assertEquals("XX4321", parsed.accountMask)
        assertEquals("Cafe Coffee Day", parsed.merchant)
    }

    // =========================================================================
    // 7. Indian Lakhs & Number Formats
    // =========================================================================

    @Test
    fun parsesIndianLakhsNumberFormat() {
        val body = "Rs. 2,75,000.00 debited from SBI A/c 9988 on 03-Nov-26 for Car Downpayment. Bal Rs. 5,25,000.00"
        val parsed = FinancialMessageClassifier.classifyAndParse("VK-SBIINB", body, baseTimestamp)

        assertNotNull(parsed)
        assertEquals(27500000L, parsed!!.amountPaise)
        assertEquals(52500000L, parsed.balancePaise)
    }

    // =========================================================================
    // 8. Discards: OTP, Login Alerts, Balance Alerts, and Spam
    // =========================================================================

    @Test
    fun discardsOtpMessageImmediately() {
        val otpBody = "OTP 948201 is your secret verification code for HDFC NetBanking. Do not share with anyone."
        val parsed = FinancialMessageClassifier.classifyAndParse("AD-HDFCBK", otpBody, baseTimestamp)
        assertNull(parsed)
    }

    @Test
    fun discardsLoginAlertWithoutTransaction() {
        val loginBody = "Security Alert: You have successfully logged in to ICICI NetBanking on 03-Nov-2026 14:30 IST."
        val parsed = FinancialMessageClassifier.classifyAndParse("BP-ICICIB", loginBody, baseTimestamp)
        assertNull(parsed)
    }

    @Test
    fun discardsPureBalanceAlert() {
        val balBody = "Your available balance in A/c xx1234 is INR 45,210.00."
        val parsed = FinancialMessageClassifier.classifyAndParse("ICICIB", balBody, baseTimestamp)
        assertNull(parsed)
    }

    @Test
    fun discardsPreApprovedLoanPromo() {
        val promoBody = "Congratulations! You are pre-approved for personal loan of 5 Lakhs at zero processing fee. Apply now at bank.com/loan"
        val parsed = FinancialMessageClassifier.classifyAndParse("AD-HDFCBK", promoBody, baseTimestamp)
        assertNull(parsed)
    }
}
