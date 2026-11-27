package com.digitaldodo.arth.core.network

import org.json.JSONObject
import retrofit2.HttpException
import java.io.IOException
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException

object AuthErrorDiagnostics {

    private data class ParsedServerError(
        val message: String? = null,
        val code: String? = null
    )

    private fun parseErrorBody(throwable: HttpException): ParsedServerError {
        val raw = runCatching { throwable.response()?.errorBody()?.string() }.getOrNull()?.trim().orEmpty()
        if (raw.isBlank() || raw.startsWith("<")) return ParsedServerError()
        return try {
            val json = JSONObject(raw)
            val msg = listOf("error", "message", "error_description", "msg")
                .firstNotNullOfOrNull { key -> json.optString(key).takeIf { it.isNotBlank() } }
            val code = listOf("code", "error_code")
                .firstNotNullOfOrNull { key -> json.optString(key).takeIf { it.isNotBlank() } }
            ParsedServerError(message = msg, code = code)
        } catch (_: Exception) {
            ParsedServerError()
        }
    }

    fun diagnose(throwable: Throwable?): String {
        if (throwable == null) return "An unexpected authentication error occurred."

        return when (throwable) {
            is HttpException -> {
                val httpCode = throwable.code()
                val parsed = parseErrorBody(throwable)
                val serverCode = parsed.code?.uppercase().orEmpty()
                val serverMsg = parsed.message.orEmpty()
                val lower = serverMsg.lowercase()

                when {
                    serverCode == "CONFIGURATION_ERROR" ||
                    serverCode == "SERVICE_UNAVAILABLE" ||
                    serverCode == "USERNAME_LOOKUP_UNAVAILABLE" -> {
                        serverMsg.ifBlank {
                            "SpendSense authentication service is temporarily unavailable. Please try again shortly."
                        }
                    }
                    serverCode == "EMAIL_NOT_CONFIRMED" ||
                    lower.contains("not been confirmed") ||
                    lower.contains("email not confirmed") -> {
                        "Your email address has not been confirmed yet. Check your inbox for the confirmation link."
                    }
                    serverCode == "RATE_LIMITED" ||
                    httpCode == 429 ||
                    lower.contains("rate limit") ||
                    lower.contains("too many") -> {
                        "Too many attempts. Please wait a minute before trying again."
                    }
                    serverCode == "INVALID_CREDENTIALS" ||
                    lower.contains("invalid login credentials") ||
                    lower.contains("invalid_grant") ||
                    lower.contains("invalid email") -> {
                        "Invalid email or password. Verify your username, email, or password and try again."
                    }
                    httpCode == 400 -> {
                        if (serverMsg.isNotBlank() && !lower.contains("sql") && !lower.contains("postgres")) {
                            serverMsg
                        } else {
                            "Please check your entered details and try again."
                        }
                    }
                    httpCode == 401 -> {
                        if (serverMsg.isNotBlank() && !lower.contains("invalid") && !lower.contains("sql")) {
                            serverMsg
                        } else {
                            "Invalid email or password. Please verify your credentials."
                        }
                    }
                    httpCode == 403 -> {
                        serverMsg.ifBlank {
                            "Access denied. Your account may require email verification."
                        }
                    }
                    httpCode == 404 -> {
                        "Endpoint not found (HTTP 404). Verify SpendSense server configuration."
                    }
                    httpCode in 500..599 -> {
                        if (serverMsg.isNotBlank() && serverMsg.length < 160 && !lower.contains("postgres") && !lower.contains("pgrst")) {
                            serverMsg
                        } else {
                            "SpendSense server is temporarily unavailable (HTTP $httpCode). Please try again shortly."
                        }
                    }
                    else -> {
                        serverMsg.ifBlank { "Authentication request failed with status HTTP $httpCode." }
                    }
                }
            }
            is SocketTimeoutException -> "Connection timed out. SpendSense servers may be waking up or your connection is slow."
            is UnknownHostException -> "Unable to resolve server address. Check your internet connection."
            is ConnectException -> "Unable to connect to SpendSense authentication servers. Check your internet connection."
            is IOException -> "Network error while contacting SpendSense. Check your internet connection and try again."
            is IllegalArgumentException -> throwable.message ?: "Configuration error."
            is IllegalStateException -> throwable.message ?: "Application state error."
            else -> throwable.message?.takeIf { it.isNotBlank() } ?: "Authentication failed. Please try again."
        }
    }

    fun isConnectivityOrServerFailure(throwable: Throwable?): Boolean {
        return when (throwable) {
            is SocketTimeoutException, is UnknownHostException, is ConnectException, is IOException -> true
            is HttpException -> throwable.code() >= 500 || throwable.code() == 404
            else -> false
        }
    }
}
