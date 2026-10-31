package com.digitaldodo.arth

import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.app.AlertDialog
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.google.androidbrowserhelper.trusted.LauncherActivity

/** Native system biometric gate for a new TWA launch. It does not control Chrome task resumes. */
class BiometricGateActivity : FragmentActivity() {
    private var promptShown = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (savedInstanceState?.getBoolean(KEY_PROMPT_SHOWN) == true) return
        showBiometricPrompt()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        outState.putBoolean(KEY_PROMPT_SHOWN, promptShown)
        super.onSaveInstanceState(outState)
    }

    private fun showBiometricPrompt() {
        if (promptShown) return
        val manager = BiometricManager.from(this)
        val hasFingerprintFeature = packageManager.hasSystemFeature("android.hardware.fingerprint")
        val availability = manager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG)
        if (!hasFingerprintFeature || availability != BiometricManager.BIOMETRIC_SUCCESS) {
            showUnavailable(hasFingerprintFeature, availability)
            return
        }

        promptShown = true
        val prompt = BiometricPrompt(this, ContextCompat.getMainExecutor(this), object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                super.onAuthenticationSucceeded(result)
                startActivity(Intent(this@BiometricGateActivity, LauncherActivity::class.java).apply {
                    action = intent.action
                    data = intent.data
                    flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
                })
                finish()
            }

            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                super.onAuthenticationError(errorCode, errString)
                if (errorCode != BiometricPrompt.ERROR_NEGATIVE_BUTTON) {
                    promptShown = false
                    showUnavailable(hasFingerprintFeature, manager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG))
                } else {
                    finish()
                }
            }
        })
        val info = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Unlock Arth")
            .setSubtitle("Use an enrolled strong biometric")
            .setNegativeButtonText("Cancel")
            .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
            .build()
        prompt.authenticate(info)
    }

    private fun showUnavailable(hasFingerprint: Boolean, status: Int) {
        val detail = when {
            !hasFingerprint -> "This device does not report fingerprint hardware. Sign in to your Arth account to continue."
            status == BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED -> "No strong biometric is enrolled. Set one up in Android settings, or sign in to your Arth account."
            status == BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE -> "Biometric hardware is temporarily unavailable. Try again later or sign in to your Arth account."
            status == BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE -> "Strong biometric hardware is unavailable. Sign in to your Arth account to continue."
            else -> "Biometric authentication is unavailable. Sign in to your Arth account to continue."
        }
        AlertDialog.Builder(this)
            .setTitle("Unlock Arth")
            .setMessage("$detail\n\nAndroid chooses the biometric modality. Arth cannot guarantee fingerprint-only matching.")
            .setNegativeButton("Close") { _, _ -> finish() }
            .setPositiveButton(if (status == BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED) "Settings" else "Account recovery") { _, _ ->
                if (status == BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED) startActivity(Intent(Settings.ACTION_SECURITY_SETTINGS))
                else startActivity(Intent(Intent.ACTION_VIEW, android.net.Uri.parse("https://arth-9h3f.vercel.app/login")))
                finish()
            }
            .setOnCancelListener { finish() }
            .show()
    }

    companion object { private const val KEY_PROMPT_SHOWN = "biometric_prompt_shown" }
}
