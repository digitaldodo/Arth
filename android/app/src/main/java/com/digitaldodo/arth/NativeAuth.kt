package com.digitaldodo.arth

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
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
    fun access(context: Context) = prefs(context).getString("access", null)
    fun refresh(context: Context) = prefs(context).getString("refresh", null)
    fun userId(context: Context) = prefs(context).getString("user_id", null)
    fun signedIn(context: Context) = access(context) != null
    fun clear(context: Context) = prefs(context).edit().clear().apply()
    fun save(context: Context, access: String, refresh: String, userId: String) {
        prefs(context).edit().putString("access", access).putString("refresh", refresh).putString("user_id", userId).apply()
    }

    fun login(context: Context, email: String, password: String) {
        require(BuildConfig.SUPABASE_URL.isNotBlank() && BuildConfig.SUPABASE_ANON_KEY.isNotBlank()) { "Android Supabase URL and anon key are not configured in this build." }
        val response = request("${BuildConfig.SUPABASE_URL.trimEnd('/')}/auth/v1/token?grant_type=password", BuildConfig.SUPABASE_ANON_KEY, null,
            JSONObject().put("email", email).put("password", password))
        save(context, response.getString("access_token"), response.getString("refresh_token"), response.getJSONObject("user").getString("id"))
    }

    fun freshAccess(context: Context): String {
        val token = access(context) ?: throw IllegalStateException("Sign in to SpendSense first.")
        return try {
            val user = request("${BuildConfig.SUPABASE_URL.trimEnd('/')}/auth/v1/user", BuildConfig.SUPABASE_ANON_KEY, token, null)
            if (user.optString("id") != userId(context)) throw IllegalStateException("The active SpendSense account changed. Sign in again.")
            token
        } catch (_: Exception) {
            val refreshed = request("${BuildConfig.SUPABASE_URL.trimEnd('/')}/auth/v1/token?grant_type=refresh_token", BuildConfig.SUPABASE_ANON_KEY, null,
                JSONObject().put("refresh_token", refresh(context) ?: throw IllegalStateException("Session expired. Sign in again.")))
            val refreshedUserId = refreshed.optJSONObject("user")?.optString("id")?.takeIf { it.isNotBlank() } ?: userId(context)
                ?: throw IllegalStateException("Sign in again to SpendSense.")
            if (refreshedUserId != userId(context)) throw IllegalStateException("The active SpendSense account changed. Sign in again.")
            save(context, refreshed.getString("access_token"), refreshed.getString("refresh_token"), refreshedUserId)
            refreshed.getString("access_token")
        }
    }

    fun request(url: String, anonKey: String, bearer: String?, body: JSONObject?): JSONObject {
        require(url.startsWith("https://", ignoreCase = true)) { "SpendSense companion requires HTTPS endpoints." }
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = if (body == null) "GET" else "POST"
            connectTimeout = 12000; readTimeout = 12000
            setRequestProperty("apikey", anonKey); setRequestProperty("Accept", "application/json")
            if (bearer != null) setRequestProperty("Authorization", "Bearer $bearer")
            if (body != null) { doOutput = true; setRequestProperty("Content-Type", "application/json") }
        }
        try {
            if (body != null) conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            val stream = if (conn.responseCode in 200..299) conn.inputStream else conn.errorStream
            val text = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            if (conn.responseCode !in 200..299) throw IllegalStateException(JSONObject(text).optString("message", "SpendSense request failed (${conn.responseCode})."))
            return if (text.isBlank()) JSONObject() else JSONObject(text)
        } finally { conn.disconnect() }
    }
}
