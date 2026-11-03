package com.digitaldodo.arth.core.network

import android.util.Log
import com.digitaldodo.arth.BuildConfig

object EnvironmentValidator {
    private const val TAG = "EnvironmentValidator"

    data class ValidationResult(
        val isValid: Boolean,
        val errorMessage: String? = null
    )

    fun validate(): ValidationResult {
        val apiUrl = BuildConfig.API_URL.trim()
        val supabaseUrl = BuildConfig.SUPABASE_URL.trim()
        val webUrl = BuildConfig.WEB_URL.trim()

        // 1. Verify API_URL is configured and uses HTTPS
        if (apiUrl.isBlank()) {
            val err = "API_URL is missing. Please configure ARTH_API_URL."
            Log.e(TAG, err)
            return ValidationResult(false, err)
        }

        if (!apiUrl.startsWith("https://", ignoreCase = true)) {
            val err = "API_URL must use HTTPS: $apiUrl"
            Log.e(TAG, err)
            return ValidationResult(false, err)
        }

        // 2. In release builds, ensure no localhost or loopback development URLs
        if (!BuildConfig.DEBUG) {
            if (apiUrl.contains("localhost") || apiUrl.contains("127.0.0.1") || apiUrl.contains("10.0.2.2")) {
                val err = "Release builds must not use local development addresses in API_URL: $apiUrl"
                Log.e(TAG, err)
                return ValidationResult(false, err)
            }
            if (supabaseUrl.contains("localhost") || supabaseUrl.contains("127.0.0.1")) {
                val err = "Release builds must not use local development addresses in SUPABASE_URL: $supabaseUrl"
                Log.e(TAG, err)
                return ValidationResult(false, err)
            }
        }

        // 3. Verify Supabase URL is separate from Render backend
        if (supabaseUrl.isNotBlank() && apiUrl.isNotBlank()) {
            if (supabaseUrl.trimEnd('/') == apiUrl.trimEnd('/')) {
                val err = "SUPABASE_URL and API_URL must be configured separately. Both currently point to $apiUrl"
                Log.w(TAG, err)
            }
        }

        Log.i(TAG, "Environment configuration verified successfully: Backend=$apiUrl, Supabase=$supabaseUrl, Web=$webUrl")
        return ValidationResult(true)
    }
}
