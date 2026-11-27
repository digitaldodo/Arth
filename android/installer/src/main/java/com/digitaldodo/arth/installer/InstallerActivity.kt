package com.digitaldodo.arth.installer

import android.app.Activity
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import java.io.File
import java.io.FileOutputStream
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.net.URI
import java.security.MessageDigest
import java.util.concurrent.Executors

class InstallerActivity : Activity() {
    private val executor = Executors.newSingleThreadExecutor()
    private lateinit var status: TextView
    private lateinit var action: Button
    private var installationStarted = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        buildInterface()
        intent.getStringExtra(EXTRA_RESULT_MESSAGE)?.let { showResult(it) }
    }

    override fun onDestroy() {
        executor.shutdownNow()
        super.onDestroy()
    }

    private fun buildInterface() {
        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(24), dp(28), dp(24), dp(24))
            setBackgroundColor(0xFFF8F8F6.toInt())
        }
        val title = TextView(this).apply {
            text = "SpendSense"
            textSize = 24f
            setTextColor(0xFF181615.toInt())
            setTypeface(typeface, android.graphics.Typeface.BOLD)
        }
        val eyebrow = TextView(this).apply {
            text = "OFFICIAL SMS HELPER"
            textSize = 11f
            letterSpacing = 0.12f
            setTextColor(0xFF736E66.toInt())
            setPadding(0, dp(6), 0, dp(22))
        }
        val explanation = TextView(this).apply {
            text = "This signed helper downloads the current SMS-enabled SpendSense app from the official HTTPS release service, verifies its checksum and signing certificate, then opens Android's installation confirmation."
            textSize = 15f
            setTextColor(0xFF494541.toInt())
            setLineSpacing(dp(4).toFloat(), 1f)
        }
        val permissions = TextView(this).apply {
            text = "Android requires a separate permission review after installation. SMS inbox access stays off until you enable it in SpendSense. You can use the standard notification-only APK instead if you do not want inbox access."
            textSize = 13f
            setTextColor(0xFF736E66.toInt())
            setLineSpacing(dp(3).toFloat(), 1f)
            setPadding(0, dp(18), 0, dp(28))
        }
        status = TextView(this).apply {
            text = "No app has been installed or updated yet."
            textSize = 13f
            setTextColor(0xFF494541.toInt())
            setPadding(0, dp(4), 0, dp(18))
        }
        action = Button(this).apply {
            text = "Install SMS-enabled SpendSense"
            setBackgroundColor(0xFF181615.toInt())
            setTextColor(0xFFFFFFFF.toInt())
            setOnClickListener { beginInstall() }
        }
        val footer = TextView(this).apply {
            text = "App package: com.digitaldodo.arth\nThe Android system will ask you to confirm installation. Updates use the existing app ID and signing key to preserve local data."
            textSize = 11f
            setTextColor(0xFF736E66.toInt())
            setPadding(0, dp(22), 0, 0)
            setLineSpacing(dp(3).toFloat(), 1f)
        }
        content.addView(title)
        content.addView(eyebrow)
        content.addView(explanation)
        content.addView(permissions)
        content.addView(status)
        content.addView(action, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(52)))
        content.addView(footer)
        setContentView(ScrollView(this).apply { addView(content) })
    }

    private fun beginInstall() {
        if (installationStarted) return
        if (!packageManager.canRequestPackageInstalls()) {
            status.text = "Allow this official installer to request the SpendSense update in Android Settings. Return here and tap Install to continue."
            startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName")))
            return
        }
        installationStarted = true
        action.isEnabled = false
        status.text = "Checking the signed release and preparing Android's install confirmation…"
        executor.execute {
            try {
                val metadata = fetchMetadata()
                val apk = downloadAndVerify(metadata)
                val sessionId = createUserConfirmedInstallSession(apk)
                apk.delete()
                runOnUiThread {
                    status.text = "The verified SpendSense update is ready. Confirm the install in Android's system dialog."
                    action.text = "Waiting for Android confirmation"
                    commitSession(sessionId)
                }
            } catch (error: Exception) {
                runOnUiThread {
                    installationStarted = false
                    action.isEnabled = true
                    status.text = safeMessage(error)
                }
            }
        }
    }

    private fun fetchMetadata(): ReleaseMetadata {
        val body = request("$SITE_ROOT/api/android/release", MAX_METADATA_BYTES).toString(Charsets.UTF_8)
        return ReleaseMetadata.parse(body)
    }

    private fun downloadAndVerify(metadata: ReleaseMetadata): File {
        val targetUrl = URL(SITE_ROOT + metadata.downloadUrl)
        val file = File(cacheDir, "spendsense-sms-release.apk")
        val connection = openTrustedDownloadConnection(targetUrl)
        try {
            connection.connect()
            require(connection.responseCode in 200..299) { "The signed app download is temporarily unavailable." }
            val expectedLength = connection.contentLengthLong
            require(expectedLength in 1..metadata.maxDownloadBytes) { "The app download size is invalid." }
            val digest = MessageDigest.getInstance("SHA-256")
            var total = 0L
            connection.inputStream.use { input -> FileOutputStream(file).use { output ->
                val buffer = ByteArray(32 * 1024)
                while (true) {
                    val count = input.read(buffer)
                    if (count < 0) break
                    total += count
                    require(total <= metadata.maxDownloadBytes) { "The app package exceeds the approved download size." }
                    digest.update(buffer, 0, count)
                    output.write(buffer, 0, count)
                }
            } }
            require(total == expectedLength) { "The app download was incomplete." }
            require(hex(digest.digest()) == metadata.sha256) { "The app checksum does not match the published release." }
            verifyPackageAndSigner(file, metadata)
            return file
        } catch (error: Exception) {
            file.delete()
            throw error
        } finally {
            connection.disconnect()
        }
    }

    private fun verifyPackageAndSigner(apk: File, metadata: ReleaseMetadata) {
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES
        val info = packageManager.getPackageArchiveInfo(apk.absolutePath, flags)
            ?: throw IllegalArgumentException("The downloaded file is not a valid Android app.")
        require(info.packageName == ReleaseMetadata.EXPECTED_APPLICATION_ID) { "The app package name did not match SpendSense." }
        val versionCode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) info.longVersionCode else @Suppress("DEPRECATION") info.versionCode.toLong()
        require(versionCode == metadata.versionCode) { "The app version does not match the verified release." }
        val requestedPermissions = info.requestedPermissions.orEmpty().toSet()
        require(android.Manifest.permission.READ_SMS in requestedPermissions) { "This release does not include the requested SMS capability." }
        require(android.Manifest.permission.RECEIVE_SMS in requestedPermissions) { "This release does not include incoming message detection." }
        require(android.Manifest.permission.SEND_SMS !in requestedPermissions) { "The release requests an unexpected SMS permission." }

        val signatures = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            info.signingInfo?.apkContentsSigners.orEmpty()
        } else {
            @Suppress("DEPRECATION") info.signatures.orEmpty()
        }
        require(signatures.size == 1) { "The app signing certificate could not be verified." }
        val actualCertificate = hex(MessageDigest.getInstance("SHA-256").digest(signatures.single().toByteArray()))
        require(actualCertificate == metadata.signingCertificateSha256) { "The app signing certificate did not match the published SpendSense key." }
    }

    private fun createUserConfirmedInstallSession(apk: File): Int {
        val installer = packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_REQUIRED)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                setWhitelistedRestrictedPermissions(setOf(android.Manifest.permission.READ_SMS, android.Manifest.permission.RECEIVE_SMS))
            }
        }
        val sessionId = installer.createSession(params)
        try {
            installer.openSession(sessionId).use { session ->
                apk.inputStream().use { input -> session.openWrite("base.apk", 0, apk.length()).use { output ->
                    input.copyTo(output)
                    session.fsync(output)
                } }
                val flags = PendingIntent.FLAG_UPDATE_CURRENT or if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
                val callback = PendingIntent.getBroadcast(this, sessionId, Intent(this, InstallResultReceiver::class.java), flags)
                session.commit(callback.intentSender)
            }
            return sessionId
        } catch (error: Exception) {
            installer.abandonSession(sessionId)
            throw error
        }
    }

    private fun commitSession(sessionId: Int) {
        status.text = "Android install session $sessionId started. Complete the system confirmation to finish."
    }

    private fun openTrustedDownloadConnection(start: URL): HttpURLConnection {
        var target = start
        repeat(MAX_REDIRECTS + 1) { attempt ->
            require(target.protocol.equals("https", ignoreCase = true) && target.host.lowercase() in TRUSTED_DOWNLOAD_HOSTS) {
                "The signed app download redirected to an untrusted address."
            }
            val connection = (target.openConnection() as HttpURLConnection).apply {
                connectTimeout = NETWORK_TIMEOUT_MS
                readTimeout = NETWORK_TIMEOUT_MS
                instanceFollowRedirects = false
                requestMethod = "GET"
                setRequestProperty("Accept", "application/vnd.android.package-archive")
            }
            connection.connect()
            if (connection.responseCode in 200..299) return connection
            val location = connection.getHeaderField("Location")
            val status = connection.responseCode
            connection.disconnect()
            require(status in 300..399 && !location.isNullOrBlank() && attempt < MAX_REDIRECTS) {
                "The signed app download is temporarily unavailable."
            }
            target = target.toURI().resolve(location).toURL()
        }
        throw IllegalStateException("The signed app download redirect limit was reached.")
    }

    private fun request(url: String, maxBytes: Int): ByteArray {
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = NETWORK_TIMEOUT_MS
            readTimeout = NETWORK_TIMEOUT_MS
            instanceFollowRedirects = false
            requestMethod = "GET"
            setRequestProperty("Accept", "application/json")
        }
        try {
            connection.connect()
            require(connection.responseCode in 200..299) { "The SpendSense release service is temporarily unavailable." }
            require(connection.contentLength <= maxBytes) { "The release metadata response is too large." }
            return connection.inputStream.use { input ->
                val buffer = ByteArray(4096)
                val output = ByteArrayOutputStream()
                while (true) {
                    val count = input.read(buffer)
                    if (count < 0) break
                    require(output.size() + count <= maxBytes) { "The release metadata response is too large." }
                    output.write(buffer, 0, count)
                }
                val bytes = output.toByteArray()
                require(bytes.size <= maxBytes) { "The release metadata response is too large." }
                bytes
            }
        } finally {
            connection.disconnect()
        }
    }

    private fun showResult(message: String) {
        status.text = message
        installationStarted = false
        action.isEnabled = true
        action.text = "Install or update SpendSense"
    }

    private fun safeMessage(error: Exception): String = when (error) {
        is java.net.SocketTimeoutException -> "The release service took too long to respond. Check your connection and try again."
        is java.io.IOException -> "The signed app could not be downloaded. Check your connection and try again."
        else -> error.message?.takeIf { it.length <= 180 } ?: "The SpendSense release could not be verified. No app was installed."
    }

    private fun hex(bytes: ByteArray): String = bytes.joinToString("") { "%02x".format(it) }
    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()

    companion object {
        private const val SITE_ROOT = "https://arth-9h3f.vercel.app"
        private const val NETWORK_TIMEOUT_MS = 30_000
        private const val MAX_METADATA_BYTES = 32 * 1024
        private const val MAX_REDIRECTS = 3
        private val TRUSTED_DOWNLOAD_HOSTS = setOf(
            "arth-9h3f.vercel.app", "release-assets.githubusercontent.com", "objects.githubusercontent.com"
        )
        const val EXTRA_RESULT_MESSAGE = "installer_result_message"
    }
}
