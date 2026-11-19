package com.digitaldodo.arth.installer

import org.json.JSONObject

data class ReleaseMetadata(
    val applicationId: String,
    val version: String,
    val versionCode: Long,
    val downloadUrl: String,
    val sha256: String,
    val signingCertificateSha256: String,
    val maxDownloadBytes: Long
) {
    companion object {
        const val EXPECTED_APPLICATION_ID = "com.digitaldodo.arth"
        const val EXPECTED_SIGNING_CERTIFICATE_SHA256 = "2385b27fe940bf5cae2ddfc16d615994bef8538ed8ffcb06f58404d90e386447"
        const val MAX_APK_BYTES = 100L * 1024L * 1024L

        fun parse(json: String): ReleaseMetadata {
            val root = JSONObject(json)
            require(root.optBoolean("published")) { "The current Android release is unavailable." }
            val applicationId = root.optString("applicationId")
            val version = root.optString("version")
            val versionCode = root.optLong("versionCode", 0L)
            val downloadUrl = root.optString("smsDownloadUrl")
            val sha256 = root.optString("smsApkSha256").lowercase()
            val certificate = root.optString("signingCertificateSha256").replace(":", "").lowercase()
            require(applicationId == EXPECTED_APPLICATION_ID) { "The release package name did not match SpendSense." }
            require(version.isNotBlank() && versionCode > 1005) { "The release version is invalid." }
            require(downloadUrl == "/api/android/sms-download") { "The release download address is invalid." }
            require(sha256.matches(Regex("^[a-f0-9]{64}$"))) { "The release checksum is invalid." }
            require(certificate.matches(Regex("^[a-f0-9]{64}$"))) { "The release signing identity is invalid." }
            require(certificate == EXPECTED_SIGNING_CERTIFICATE_SHA256) { "The SpendSense release signing identity did not match this installer." }
            return ReleaseMetadata(applicationId, version, versionCode, downloadUrl, sha256, certificate, MAX_APK_BYTES)
        }
    }
}
