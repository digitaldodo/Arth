package com.digitaldodo.arth.core.network

import com.digitaldodo.arth.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

data class AndroidReleaseUpdate(
    val versionName: String,
    val versionCode: Int,
    val releaseNotes: List<String>,
    val downloadUrl: String
)

object AndroidReleaseUpdateChecker {
    suspend fun checkForUpdate(): AndroidReleaseUpdate? = withContext(Dispatchers.IO) {
        val connection = (URL("${BuildConfig.WEB_URL.trimEnd('/')}/api/android/release").openConnection() as HttpURLConnection)
        try {
            connection.requestMethod = "GET"
            connection.connectTimeout = 5_000
            connection.readTimeout = 5_000
            connection.setRequestProperty("Accept", "application/json")
            if (connection.responseCode != HttpURLConnection.HTTP_OK) return@withContext null

            val release = JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
            if (!release.optBoolean("published") || release.optInt("versionCode") <= BuildConfig.VERSION_CODE) {
                return@withContext null
            }

            val notesJson = release.optJSONArray("highlights")
            val notes = buildList {
                if (notesJson != null) {
                    for (index in 0 until notesJson.length()) {
                        notesJson.optString(index).takeIf { it.isNotBlank() }?.let(::add)
                    }
                }
            }

            AndroidReleaseUpdate(
                versionName = release.optString("version"),
                versionCode = release.optInt("versionCode"),
                releaseNotes = notes,
                downloadUrl = BuildConfig.WEB_URL.trimEnd('/') + if (BuildConfig.SMS_INSTALLER_UPDATE_SUPPORTED) {
                    "/api/android/installer-download"
                } else {
                    "/api/android/download"
                }
            )
        } catch (_: Exception) {
            null
        } finally {
            connection.disconnect()
        }
    }
}
