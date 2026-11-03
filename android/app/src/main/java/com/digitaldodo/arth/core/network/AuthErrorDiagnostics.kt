package com.digitaldodo.arth.core.network

import retrofit2.HttpException
import java.io.IOException
import java.net.SocketTimeoutException
import java.net.UnknownHostException

object AuthErrorDiagnostics {

    fun diagnose(throwable: Throwable?): String {
        if (throwable == null) return "An unexpected error occurred."

        return when (throwable) {
            is HttpException -> {
                val code = throwable.code()
                when (code) {
                    401 -> "Invalid email or password. Please verify your credentials."
                    403 -> "Access denied. Your account does not have permission to access this resource."
                    404 -> "Endpoint not found (HTTP 404). Please verify that your API and Supabase configurations match the backend."
                    429 -> "Too many requests. Please wait a minute before trying again."
                    in 500..599 -> "The server encountered an error (HTTP $code). Please try again shortly."
                    else -> "Authentication request failed with status HTTP $code."
                }
            }
            is SocketTimeoutException -> "Connection timed out. Please check your network speed or server availability."
            is UnknownHostException -> "Unable to resolve server address. Please verify your internet connection."
            is IOException -> "Network communication error. Please check your connection and try again."
            is IllegalArgumentException -> throwable.message ?: "Configuration error."
            is IllegalStateException -> throwable.message ?: "Application state error."
            else -> throwable.message?.takeIf { it.isNotBlank() } ?: "Authentication failed. Please try again."
        }
    }
}
