package com.digitaldodo.arth

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.digitaldodo.arth.core.network.NetworkClient
import com.digitaldodo.arth.core.security.SecureStorage
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

object NativeAuth {
    private fun prefs(context: Context) = EncryptedSharedPreferences.create(
        context, "arth_native_auth",
        MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )
    fun access(context: Context) = SecureStorage(context).getAccessToken() ?: prefs(context).getString("access", null)
    fun refresh(context: Context) = SecureStorage(context).getRefreshToken() ?: prefs(context).getString("refresh", null)
    fun userId(context: Context) = SecureStorage(context).getUserId() ?: prefs(context).getString("user_id", null)
    fun signedIn(context: Context) = access(context) != null
    fun clear(context: Context) = prefs(context).edit().clear().apply()
    fun save(context: Context, access: String, refresh: String, userId: String) {
        prefs(context).edit().putString("access", access).putString("refresh", refresh).putString("user_id", userId).apply()
        val storage = SecureStorage(context)
        storage.saveSession(access, refresh, userId, storage.getUserEmail().orEmpty())
    }

    fun login(context: Context, identifier: String, password: String) {
        val webBase = NetworkClient.getWebBaseUrl(BuildConfig.WEB_URL)
        val response = request(
            "${webBase}api/native/auth/login",
            "",
            null,
            JSONObject().put("identifier", identifier).put("password", password)
        )
        val user = response.getJSONObject("user")
        save(context, response.getString("access_token"), response.getString("refresh_token"), user.getString("id"))
    }

    fun freshAccess(context: Context): String {
        val token = access(context) ?: throw IllegalStateException("Sign in to SpendSense first.")
        val currentUserId = userId(context) ?: throw IllegalStateException("Sign in to SpendSense first.")
        if (BuildConfig.SUPABASE_URL.isNotBlank() && BuildConfig.SUPABASE_ANON_KEY.isNotBlank()) {
            try {
                val user = request("${BuildConfig.SUPABASE_URL.trimEnd('/')}/auth/v1/user", BuildConfig.SUPABASE_ANON_KEY, token, null)
                if (user.optString("id") != currentUserId) {
                    throw IllegalStateException("The active SpendSense account changed. Sign in again.")
                }
                return token
            } catch (err: IllegalStateException) {
                if (err.message?.contains("changed") == true) throw err
            } catch (_: Exception) {}
        }

        val currentRefresh = refresh(context) ?: return token
        val webBase = NetworkClient.getWebBaseUrl(BuildConfig.WEB_URL)
        return try {
            val refreshed = request(
                "${webBase}api/native/auth/refresh",
                "",
                null,
                JSONObject().put("refresh_token", currentRefresh)
            )
            val refreshedUserId = refreshed.optJSONObject("user")?.optString("id")?.takeIf { it.isNotBlank() } ?: currentUserId
            if (refreshedUserId != currentUserId) {
                throw IllegalStateException("The active SpendSense account changed. Sign in again.")
            }
            val newAccess = refreshed.getString("access_token")
            val newRefresh = refreshed.optString("refresh_token").ifBlank { currentRefresh }
            save(context, newAccess, newRefresh, refreshedUserId)
            newAccess
        } catch (_: Exception) {
            token
        }
    }

    fun request(url: String, anonKey: String, bearer: String?, body: JSONObject?): JSONObject {
        require(url.startsWith("https://", ignoreCase = true)) { "SpendSense companion requires HTTPS endpoints." }
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = if (body == null) "GET" else "POST"
            connectTimeout = 12000; readTimeout = 12000
            if (anonKey.isNotBlank()) setRequestProperty("apikey", anonKey)
            setRequestProperty("Accept", "application/json")
            if (bearer != null) setRequestProperty("Authorization", "Bearer $bearer")
            if (body != null) { doOutput = true; setRequestProperty("Content-Type", "application/json") }
        }
        try {
            if (body != null) conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            val stream = if (conn.responseCode in 200..299) conn.inputStream else conn.errorStream
            val text = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            if (conn.responseCode !in 200..299) {
                val parsed = runCatching { JSONObject(text) }.getOrNull()
                val msg = parsed?.optString("error")?.takeIf { it.isNotBlank() }
                    ?: parsed?.optString("message")?.takeIf { it.isNotBlank() }
                    ?: "SpendSense request failed (${conn.responseCode})."
                throw IllegalStateException(msg)
            }
            return if (text.isBlank()) JSONObject() else JSONObject(text)
        } finally { conn.disconnect() }
    }
}
