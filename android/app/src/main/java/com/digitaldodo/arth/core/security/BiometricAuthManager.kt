package com.digitaldodo.arth.core.security

import android.app.Activity
import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity

enum class BiometricStatus(val label: String) {
    READY("Biometric Ready"),
    NOT_ENROLLED("No Fingerprint Enrolled"),
    NO_HARDWARE("No Biometric Hardware"),
    HARDWARE_UNAVAILABLE("Hardware Unavailable"),
    SECURITY_UPDATE_REQUIRED("Security Update Required"),
    UNSUPPORTED("Biometrics Unsupported")
}

object BiometricAuthManager {

    /**
     * Inspects the current device's biometric hardware and enrollment status.
     */
    fun checkBiometricStatus(context: Context): BiometricStatus {
        val biometricManager = BiometricManager.from(context)
        return when (biometricManager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG)) {
            BiometricManager.BIOMETRIC_SUCCESS -> BiometricStatus.READY
            BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED -> BiometricStatus.NOT_ENROLLED
            BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE -> BiometricStatus.NO_HARDWARE
            BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE -> BiometricStatus.HARDWARE_UNAVAILABLE
            BiometricManager.BIOMETRIC_ERROR_SECURITY_UPDATE_REQUIRED -> BiometricStatus.SECURITY_UPDATE_REQUIRED
            else -> BiometricStatus.UNSUPPORTED
        }
    }

    /**
     * Checks if the device has a secure screen lock (PIN, pattern, or password).
     */
    fun hasDeviceCredential(context: Context): Boolean {
        val keyguardManager = context.getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
        return keyguardManager?.isDeviceSecure == true
    }

    /**
     * Determines whether the user can enable biometric app lock on this device.
     * True if biometric is ready or device credential fallback is available.
     */
    fun canAuthenticate(context: Context): Boolean {
        val status = checkBiometricStatus(context)
        return status == BiometricStatus.READY || (status == BiometricStatus.NOT_ENROLLED && hasDeviceCredential(context))
    }

    /**
     * Directs the user to the device's system settings to enroll a fingerprint or biometric.
     */
    fun openEnrollmentSettings(activity: Activity) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val enrollIntent = Intent(Settings.ACTION_BIOMETRIC_ENROLL).apply {
                putExtra(
                    Settings.EXTRA_BIOMETRIC_AUTHENTICATORS_ALLOWED,
                    BiometricManager.Authenticators.BIOMETRIC_STRONG or BiometricManager.Authenticators.DEVICE_CREDENTIAL
                )
            }
            if (enrollIntent.resolveActivity(activity.packageManager) != null) {
                activity.startActivity(enrollIntent)
                return
            }
        }

        // Fallback to general security settings
        val securityIntent = Intent(Settings.ACTION_SECURITY_SETTINGS)
        if (securityIntent.resolveActivity(activity.packageManager) != null) {
            activity.startActivity(securityIntent)
        } else {
            activity.startActivity(Intent(Settings.ACTION_SETTINGS))
        }
    }

    /**
     * Launches AndroidX BiometricPrompt for authentication.
     */
    fun authenticate(
        activity: FragmentActivity,
        title: String = "Unlock SpendSense",
        subtitle: String = "Authenticate to access your financial information",
        allowDeviceCredential: Boolean = true,
        onSuccess: () -> Unit,
        onError: (errorCode: Int, errorMessage: String) -> Unit = { _, _ -> },
        onFailed: () -> Unit = {}
    ): BiometricPrompt {
        val executor = ContextCompat.getMainExecutor(activity)
        val keyguardSecure = hasDeviceCredential(activity)
        val useDeviceCredential = allowDeviceCredential && keyguardSecure

        val callback = object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                super.onAuthenticationSucceeded(result)
                AppLockManager.isPromptShowing = false
                onSuccess()
            }

            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                super.onAuthenticationError(errorCode, errString)
                AppLockManager.isPromptShowing = false
                onError(errorCode, errString.toString())
            }

            override fun onAuthenticationFailed() {
                super.onAuthenticationFailed()
                onFailed()
            }
        }

        val biometricPrompt = BiometricPrompt(activity, executor, callback)

        val promptInfoBuilder = BiometricPrompt.PromptInfo.Builder()
            .setTitle(title)
            .setSubtitle(subtitle)

        if (useDeviceCredential) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                promptInfoBuilder.setAllowedAuthenticators(
                    BiometricManager.Authenticators.BIOMETRIC_STRONG or BiometricManager.Authenticators.DEVICE_CREDENTIAL
                )
            } else {
                @Suppress("DEPRECATION")
                promptInfoBuilder.setDeviceCredentialAllowed(true)
            }
        } else {
            promptInfoBuilder.setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
            promptInfoBuilder.setNegativeButtonText("Cancel")
        }

        AppLockManager.isPromptShowing = true
        biometricPrompt.authenticate(promptInfoBuilder.build())
        return biometricPrompt
    }
}
