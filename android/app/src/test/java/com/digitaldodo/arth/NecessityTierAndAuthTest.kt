package com.digitaldodo.arth

import com.digitaldodo.arth.core.model.NecessityTier
import com.digitaldodo.arth.core.model.PaymentMode
import com.digitaldodo.arth.core.model.Transaction
import com.digitaldodo.arth.core.model.TransactionType
import com.digitaldodo.arth.core.network.AuthErrorDiagnostics
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.*
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response
import java.net.SocketTimeoutException
import java.net.UnknownHostException

class NecessityTierAndAuthTest {

    @Test
    fun necessityTierFromStringMapsCanonicalValues() {
        assertEquals(NecessityTier.ESSENTIAL, NecessityTier.fromString("essential"))
        assertEquals(NecessityTier.OPTIONAL, NecessityTier.fromString("optional"))
        assertEquals(NecessityTier.LUXURY, NecessityTier.fromString("luxury"))
    }

    @Test
    fun necessityTierFromStringSupportsBackwardCompatibilityAliases() {
        assertEquals(NecessityTier.ESSENTIAL, NecessityTier.fromString("needs"))
        assertEquals(NecessityTier.ESSENTIAL, NecessityTier.fromString("must-have"))
        assertEquals(NecessityTier.OPTIONAL, NecessityTier.fromString("wants"))
        assertNull(NecessityTier.fromString("unknown_value"))
        assertNull(NecessityTier.fromString(null))
    }

    @Test
    fun paymentModeFromStringParsesCorrectly() {
        assertEquals(PaymentMode.CASH, PaymentMode.fromString("cash"))
        assertEquals(PaymentMode.ONLINE, PaymentMode.fromString("online"))
        assertEquals(PaymentMode.ONLINE, PaymentMode.fromString("unknown"))
        assertEquals(PaymentMode.ONLINE, PaymentMode.fromString(null))
    }

    @Test
    fun incomeTransactionHasNullNecessity() {
        val income = Transaction(
            amountPaise = 100000L,
            type = TransactionType.INCOME,
            necessity = null
        )
        assertNull(income.necessity)

        val expense = Transaction(
            amountPaise = 50000L,
            type = TransactionType.EXPENSE,
            necessity = NecessityTier.ESSENTIAL
        )
        assertEquals(NecessityTier.ESSENTIAL, expense.necessity)
    }

    @Test
    fun authErrorDiagnosticsHandlesHttp404Gracefully() {
        val response = Response.error<String>(
            404,
            "Not Found".toResponseBody("application/json".toMediaType())
        )
        val ex = HttpException(response)
        val message = AuthErrorDiagnostics.diagnose(ex)

        assertTrue(message.contains("Endpoint not found (HTTP 404)"))
    }

    @Test
    fun authErrorDiagnosticsHandlesHttp401Gracefully() {
        val response = Response.error<String>(
            401,
            """{"error_description":"Invalid login credentials"}""".toResponseBody("application/json".toMediaType())
        )
        val ex = HttpException(response)
        val message = AuthErrorDiagnostics.diagnose(ex)

        assertTrue(message.contains("Invalid email or password"))
    }

    @Test
    fun authErrorDiagnosticsHandlesNetworkTimeoutGracefully() {
        val ex = SocketTimeoutException("connect timed out")
        val message = AuthErrorDiagnostics.diagnose(ex)

        assertTrue(message.contains("timed out"))
    }

    @Test
    fun authErrorDiagnosticsHandlesUnknownHostGracefully() {
        val ex = UnknownHostException("Unable to resolve host")
        val message = AuthErrorDiagnostics.diagnose(ex)

        assertTrue(message.contains("Unable to resolve server address"))
    }
}
