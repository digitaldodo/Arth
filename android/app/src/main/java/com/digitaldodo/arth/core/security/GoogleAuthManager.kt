package com.digitaldodo.arth.core.security

import android.app.Activity
import android.content.Context
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.digitaldodo.arth.BuildConfig
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential

sealed class GoogleAuthResult {
    data class Success(val idToken: String, val email: String?) : GoogleAuthResult()
    object Cancelled : GoogleAuthResult()
    data class Failure(val message: String, val cause: Throwable? = null) : GoogleAuthResult()
}

class GoogleAuthManager(private val context: Context) {
    private val credentialManager = CredentialManager.create(context)

    suspend fun signIn(activity: Activity): GoogleAuthResult {
        val serverClientId = BuildConfig.GOOGLE_WEB_CLIENT_ID
        if (serverClientId.isBlank()) {
            return GoogleAuthResult.Failure("Google Web Client ID is not configured in this build.")
        }

        val googleIdOption = GetGoogleIdOption.Builder()
            .setFilterByAuthorizedAccounts(false)
            .setServerClientId(serverClientId)
            .setAutoSelectEnabled(false)
            .build()

        val request = GetCredentialRequest.Builder()
            .addCredentialOption(googleIdOption)
            .build()

        return try {
            val response = credentialManager.getCredential(
                request = request,
                context = activity
            )

            val credential = response.credential
            if (credential is CustomCredential && credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
                val googleIdTokenCredential = GoogleIdTokenCredential.createFrom(credential.data)
                GoogleAuthResult.Success(
                    idToken = googleIdTokenCredential.idToken,
                    email = googleIdTokenCredential.id
                )
            } else {
                GoogleAuthResult.Failure("Unexpected credential type: ${credential::class.java.name}")
            }
        } catch (e: GetCredentialCancellationException) {
            GoogleAuthResult.Cancelled
        } catch (e: NoCredentialException) {
            GoogleAuthResult.Failure("No Google accounts found on this device. Add a Google account in Android Settings.")
        } catch (e: GetCredentialException) {
            GoogleAuthResult.Failure(e.message ?: "Google sign-in error (${e.type})", e)
        } catch (e: Exception) {
            GoogleAuthResult.Failure(e.message ?: "Failed to authenticate with Google", e)
        }
    }
}
