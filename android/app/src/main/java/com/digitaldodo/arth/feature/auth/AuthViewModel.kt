package com.digitaldodo.arth.feature.auth

import android.app.Activity
import android.app.Application
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.digitaldodo.arth.BuildConfig
import com.digitaldodo.arth.core.network.AuthErrorDiagnostics
import com.digitaldodo.arth.core.network.GoogleIdTokenRequest
import com.digitaldodo.arth.core.network.LoginRequest
import com.digitaldodo.arth.core.network.NetworkClient
import com.digitaldodo.arth.core.network.RefreshRequest
import com.digitaldodo.arth.core.security.GoogleAuthManager
import com.digitaldodo.arth.core.security.GoogleAuthResult
import com.digitaldodo.arth.core.security.SecureStorage
import com.digitaldodo.arth.core.sync.AccountSyncService
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class AuthUiState(
    val email: String = "",
    val password: String = "",
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val isAuthenticated: Boolean = false,
    val userEmail: String? = null
)

class AuthViewModel(application: Application) : AndroidViewModel(application) {
    private val secureStorage = SecureStorage(application)
    private val nativeAuthApi = NetworkClient.createNativeAuthApi()
    private val supabaseAuthApi = NetworkClient.createSupabaseAuthApi()

    private val _uiState = MutableStateFlow(
        AuthUiState(
            isAuthenticated = secureStorage.isLoggedIn(),
            userEmail = secureStorage.getUserEmail()
        )
    )
    val uiState = _uiState.asStateFlow()

    fun onEmailChanged(email: String) {
        _uiState.value = _uiState.value.copy(email = email, errorMessage = null)
    }

    fun onPasswordChanged(password: String) {
        _uiState.value = _uiState.value.copy(password = password, errorMessage = null)
    }

    fun login(onSuccess: () -> Unit) {
        val email = _uiState.value.email.trim()
        val password = _uiState.value.password
        if (email.isBlank() || password.isBlank()) {
            _uiState.value = _uiState.value.copy(errorMessage = "Please enter both email and password")
            return
        }

        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
            try {
                // Dual attempt: First try native auth endpoint on web host, then Supabase direct
                val response = try {
                    nativeAuthApi.login(LoginRequest(email, password))
                } catch (firstErr: Exception) {
                    try {
                        supabaseAuthApi.login(LoginRequest(email, password))
                    } catch (_: Exception) {
                        throw firstErr
                    }
                }

                val resolvedEmail = response.user.email ?: email
                secureStorage.saveSession(
                    accessToken = response.accessToken,
                    refreshToken = response.refreshToken,
                    userId = response.user.id,
                    email = resolvedEmail
                )
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    isAuthenticated = true,
                    userEmail = resolvedEmail
                )

                // Trigger immediate initial synchronization
                launch {
                    AccountSyncService.getInstance(getApplication()).syncAll()
                }

                onSuccess()
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    errorMessage = AuthErrorDiagnostics.diagnose(e)
                )
            }
        }
    }

    /**
     * Native Google Sign-In using AndroidX Credential Manager.
     * The user remains within the application while choosing their registered Google account.
     */
    fun signInWithNativeGoogle(activity: Activity, onSuccess: () -> Unit) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
            val googleAuthManager = GoogleAuthManager(activity)
            when (val result = googleAuthManager.signIn(activity)) {
                is GoogleAuthResult.Cancelled -> {
                    _uiState.value = _uiState.value.copy(isLoading = false)
                }
                is GoogleAuthResult.Failure -> {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        errorMessage = result.message
                    )
                }
                is GoogleAuthResult.Success -> {
                    try {
                        val req = GoogleIdTokenRequest(idToken = result.idToken)
                        val response = try {
                            nativeAuthApi.loginWithGoogleIdToken(req)
                        } catch (firstErr: Exception) {
                            try {
                                supabaseAuthApi.loginWithGoogleIdToken(req)
                            } catch (_: Exception) {
                                throw firstErr
                            }
                        }

                        val resolvedEmail = response.user.email ?: result.email ?: ""
                        secureStorage.saveSession(
                            accessToken = response.accessToken,
                            refreshToken = response.refreshToken,
                            userId = response.user.id,
                            email = resolvedEmail
                        )
                        _uiState.value = _uiState.value.copy(
                            isLoading = false,
                            isAuthenticated = true,
                            userEmail = resolvedEmail,
                            errorMessage = null
                        )

                        // Trigger immediate initial synchronization into Room DB
                        launch {
                            AccountSyncService.getInstance(getApplication()).syncAll()
                        }

                        onSuccess()
                    } catch (e: Exception) {
                        _uiState.value = _uiState.value.copy(
                            isLoading = false,
                            errorMessage = AuthErrorDiagnostics.diagnose(e)
                        )
                    }
                }
            }
        }
    }

    /**
     * Fallback browser-based Google Sign-In for environments without Credential Manager.
     */
    fun startBrowserGoogleSignIn(context: Context) {
        val webBaseUrl = BuildConfig.WEB_URL.trimEnd('/')
        val googleAuthUrl = "$webBaseUrl/api/native/auth/google"

        try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(googleAuthUrl)).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            _uiState.value = _uiState.value.copy(
                errorMessage = "Failed to launch browser for Google Sign-In: ${e.message}"
            )
        }
    }

    fun onSessionReceived(
        accessToken: String,
        refreshToken: String?,
        userId: String,
        email: String?,
        onSuccess: () -> Unit = {}
    ) {
        secureStorage.saveSession(
            accessToken = accessToken,
            refreshToken = refreshToken ?: "",
            userId = userId,
            email = email ?: ""
        )
        _uiState.value = _uiState.value.copy(
            isLoading = false,
            isAuthenticated = true,
            userEmail = email,
            errorMessage = null
        )

        viewModelScope.launch {
            AccountSyncService.getInstance(getApplication()).syncAll()
        }

        onSuccess()
    }

    fun onAuthError(errorDescription: String) {
        _uiState.value = _uiState.value.copy(
            isLoading = false,
            errorMessage = errorDescription
        )
    }

    fun refreshSession(onComplete: (Boolean) -> Unit = {}) {
        val refreshToken = secureStorage.getRefreshToken()
        if (refreshToken.isNullOrBlank()) {
            onComplete(false)
            return
        }

        viewModelScope.launch {
            try {
                val response = try {
                    nativeAuthApi.refreshToken(RefreshRequest(refreshToken))
                } catch (_: Exception) {
                    supabaseAuthApi.refreshToken(RefreshRequest(refreshToken))
                }

                secureStorage.saveSession(
                    accessToken = response.accessToken,
                    refreshToken = response.refreshToken,
                    userId = response.user.id,
                    email = response.user.email ?: secureStorage.getUserEmail().orEmpty()
                )
                _uiState.value = _uiState.value.copy(isAuthenticated = true)
                onComplete(true)
            } catch (_: Exception) {
                onComplete(false)
            }
        }
    }

    fun logout(onSuccess: () -> Unit) {
        secureStorage.clearSession()
        _uiState.value = AuthUiState(
            isAuthenticated = false,
            email = "",
            password = "",
            userEmail = null
        )
        onSuccess()
    }

    fun continueOffline(onSuccess: () -> Unit) {
        secureStorage.saveSession("offline-token", "offline-refresh", "offline-user", "offline@arth.local")
        _uiState.value = _uiState.value.copy(isAuthenticated = true, userEmail = "offline@arth.local")
        onSuccess()
    }
}
