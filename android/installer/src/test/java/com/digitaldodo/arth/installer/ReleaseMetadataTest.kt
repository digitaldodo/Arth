package com.digitaldodo.arth.installer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import org.json.JSONObject

class ReleaseMetadataTest {
    private fun release(downloadUrl: String = "/api/android/sms-download", applicationId: String = ReleaseMetadata.EXPECTED_APPLICATION_ID): String = JSONObject()
        .put("published", true)
        .put("applicationId", applicationId)
        .put("version", "1.4.0+build.13")
        .put("versionCode", 1019)
        .put("smsDownloadUrl", downloadUrl)
        .put("smsApkSha256", "a".repeat(64))
        .put("signingCertificateSha256", ReleaseMetadata.EXPECTED_SIGNING_CERTIFICATE_SHA256)
        .toString()

    @Test fun acceptsOnlyTheSignedSmsReleaseMetadataContract() {
        val parsed = ReleaseMetadata.parse(release())
        assertEquals(ReleaseMetadata.EXPECTED_APPLICATION_ID, parsed.applicationId)
        assertEquals("1.4.0+build.13", parsed.version)
        assertEquals("a".repeat(64), parsed.sha256)
    }

    @Test fun rejectsUnpublishedOrUnexpectedPackageAndDownloadTargets() {
        assertThrows(IllegalArgumentException::class.java) { ReleaseMetadata.parse(release(applicationId = "com.attacker.app")) }
        assertThrows(IllegalArgumentException::class.java) { ReleaseMetadata.parse(release(downloadUrl = "https://example.invalid/app.apk")) }
        assertThrows(IllegalArgumentException::class.java) { ReleaseMetadata.parse(JSONObject(release()).put("published", false).toString()) }
        assertThrows(IllegalArgumentException::class.java) {
            ReleaseMetadata.parse(JSONObject(release()).put("signingCertificateSha256", "b".repeat(64)).toString())
        }
    }
}
