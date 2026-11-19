package com.digitaldodo.arth

import com.digitaldodo.arth.core.sms.SmsNotificationParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertNotNull
import org.junit.Test

class SmsNotificationParserTest {
    private val postedAt = 1_793_251_200_000L
    private val transactionText = "Rs 250.00 debited from HDFC Bank A/c XX4567 to Swiggy UPI Ref 123456789012"

    @Test
    fun acceptsVisibleTransactionFromTheCurrentDefaultSmsApp() {
        val parsed = SmsNotificationParser.parse(
            notificationPackage = "com.google.android.apps.messaging",
            defaultSmsPackage = "com.google.android.apps.messaging",
            title = "HDFCBK",
            visibleText = transactionText,
            postedAt = postedAt,
            monitoringEnabled = true
        )

        assertNotNull(parsed)
        assertEquals(25_000L, parsed!!.amountPaise)
        assertEquals("123456789012", parsed.refNumber)
    }

    @Test
    fun rejectsNotificationsFromOtherAppsAndWhenMonitoringIsOff() {
        assertNull(
            SmsNotificationParser.parse(
                notificationPackage = "com.whatsapp",
                defaultSmsPackage = "com.google.android.apps.messaging",
                title = "HDFCBK",
                visibleText = transactionText,
                postedAt = postedAt,
                monitoringEnabled = true
            )
        )
        assertNull(
            SmsNotificationParser.parse(
                notificationPackage = "com.google.android.apps.messaging",
                defaultSmsPackage = "com.google.android.apps.messaging",
                title = "HDFCBK",
                visibleText = transactionText,
                postedAt = postedAt,
                monitoringEnabled = false
            )
        )
    }

    @Test
    fun rejectsHiddenPreviewsAndOtpContent() {
        assertNull(SmsNotificationParser.parse("messages", "messages", null, null, postedAt, true))
        assertNull(
            SmsNotificationParser.parse(
                "messages", "messages", "HDFC",
                "OTP 123456 is your secret verification code. Do not share.",
                postedAt,
                true
            )
        )
    }

    @Test
    fun suggestionContainsExtractedFieldsButNeverRetainsRawNotificationText() {
        val parsed = SmsNotificationParser.parse(
            "messages", "messages", "HDFCBK", transactionText, postedAt, true
        )!!

        val suggestion = SmsNotificationParser.toSuggestion(parsed)
        assertEquals(25_000L, suggestion.amountPaise)
        assertEquals("SMS notification", suggestion.sender)
        assertNull(suggestion.rawSnippet)
        assertEquals("Swiggy", suggestion.merchant)
    }
}
