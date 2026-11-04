package com.digitaldodo.arth.feature.auth

import android.app.Activity
import android.app.Application
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.digitaldodo.arth.BuildConfig
import com.digitaldodo.arth.core.network.*
import com.digitaldodo.arth.core.security.GoogleAuthManager
import com.digitaldodo.arth.core.security.GoogleAuthResult
import com.digitaldodo.arth.core.security.SecureStorage
import com.digitaldodo.arth.core.sync.AccountSyncService
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class AuthMode {
    SIGN_IN,
    SIGN_UP,
    FORGOT_PASSWORD
}

data class AuthUiState(
    val identifier: String = "",
    val email: String = "",
    val username: String = "",
    val password: String = "",
    val confirmPassword: String = "",
    val isPasswordVisible: Boolean = false,
    val authMode: AuthMode = AuthMode.SIGN_IN,
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val successMessage: String? = null,
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

    fun onIdentifierChanged(identifier: String) {
        _uiState.update { it.copy(identifier = identifier, email = identifier, errorMessage = null, successMessage = null) }
    }

    fun onEmailChanged(email: String) {
        _uiState.update { it.copy(email = email, identifier = email, errorMessage = null, successMessage = null) }
    }

    fun onUsernameChanged(username: String) {
        _uiState.update { it.copy(username = username, errorMessage = null, successMessage = null) }
    }

    fun onPasswordChanged(password: String) {
        _uiState.update { it.copy(password = password, errorMessage = null, successMessage = null) }
    }

    fun onConfirmPasswordChanged(password: String) {
        _uiState.update { it.copy(confirmPassword = password, errorMessage = null, successMessage = null) }
    }

    fun togglePasswordVisibility() {
        _uiState.update { it.copy(isPasswordVisible = !it.isPasswordVisible) }
    }

    fun setAuthMode(mode: AuthMode) {
        _uiState.update { it.copy(authMode = mode, errorMessage = null, successMessage = null) }
    }

    fun login(onSuccess: () -> Unit) {
        val id = _uiState.value.identifier.trim().ifEmpty { _uiState.value.email.trim() }
        val password = _uiState.value.password
        if (id.isBlank() || password.isBlank()) {
            _uiState.update { it.copy(errorMessage = "Please enter your username/email and password") }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null, successMessage = null) }
            try {
                val req = LoginRequest(identifier = id, email = id, password = password)
                val response = try {
                    nativeAuthApi.login(req)
                } catch (firstErr: Exception) {
                    try {
                        supabaseAuthApi.login(req)
                    } catch (_: Exception) {
                        throw firstErr
                    }
                }

                val resolvedEmail = response.user.email ?: id
                secureStorage.saveSession(
                    accessToken = response.accessToken,
                    refreshToken = response.refreshToken,
                    userId = response.user.id,
                    email = resolvedEmail
                )
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        isAuthenticated = true,
                        userEmail = resolvedEmail,
                        errorMessage = null
                    )
                }

                // Trigger immediate initial synchronization
                launch {
                    AccountSyncService.getInstance(getApplication()).syncAll()
                }

                onSuccess()
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = AuthErrorDiagnostics.diagnose(e)
                    )
                }
            }
        }
    }

    fun signUp(onSuccess: () -> Unit) {
        val email = _uiState.value.email.trim()
        val username = _uiState.value.username.trim().takeIf { it.isNotBlank() }
        val password = _uiState.value.password
        val confirm = _uiState.value.confirmPassword

        if (email.isBlank() || !email.contains("@")) {
            _uiState.update { it.copy(errorMessage = "Please enter a valid email address") }
            return
        }
        if (password.length < 8) {
            _uiState.update { it.copy(errorMessage = "Password must be at least 8 characters") }
            return
        }
        if (password != confirm) {
            _uiState.update { it.copy(errorMessage = "Passwords do not match") }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null, successMessage = null) }
            try {
                val response = nativeAuthApi.signUp(
                    SignUpRequest(
                        email = email,
                        password = password,
                        username = username
                    )
                )

                if (response.accessToken != null && response.user != null) {
                    val resolvedEmail = response.user.email ?: email
                    secureStorage.saveSession(
                        accessToken = response.accessToken,
                        refreshToken = response.refreshToken ?: "",
                        userId = response.user.id,
                        email = resolvedEmail
                    )
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            isAuthenticated = true,
                            userEmail = resolvedEmail,
                            errorMessage = null
                        )
                    }
                    launch {
                        AccountSyncService.getInstance(getApplication()).syncAll()
                    }
                    onSuccess()
                } else {
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            authMode = AuthMode.SIGN_IN,
                            successMessage = response.message ?: "Account created! Please check your email to activate."
                        )
                    }
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = AuthErrorDiagnostics.diagnose(e)
                    )
                }
            }
        }
    }

    fun forgotPassword() {
        val id = _uiState.value.identifier.trim().ifEmpty { _uiState.value.email.trim() }
        if (id.isBlank()) {
            _uiState.update { it.copy(errorMessage = "Please enter your email address or username") }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null, successMessage = null) }
            try {
                val res = nativeAuthApi.forgotPassword(ForgotPasswordRequest(identifier = id))
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        authMode = AuthMode.SIGN_IN,
                        successMessage = res.message ?: "If an account exists, a password reset link has been dispatched."
                    )
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = AuthErrorDiagnostics.diagnose(e)
                    )
                }
            }
        }
    }

    /**
     * Native Google Sign-In using AndroidX Credential Manager.
     * The user remains within the application while choosing their registered Google account.
     */
    fun signInWithNativeGoogle(activity: Activity, onSuccess: () -> Unit) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null, successMessage = null) }
            val googleAuthManager = GoogleAuthManager(activity)
            when (val result = googleAuthManager.signIn(activity)) {
                is GoogleAuthResult.Cancelled -> {
                    _uiState.update { it.copy(isLoading = false) }
                }
                is GoogleAuthResult.Failure -> {
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            errorMessage = result.message
                        )
                    }
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
                        _uiState.update {
                            it.copy(
                                isLoading = false,
                                isAuthenticated = true,
                                userEmail = resolvedEmail,
                                errorMessage = null
                            )
                        }

                        // Trigger immediate initial synchronization into Room DB
                        launch {
                            AccountSyncService.getInstance(getApplication()).syncAll()
                        }

                        onSuccess()
                    } catch (e: Exception) {
                        _uiState.update {
                            it.copy(
                                isLoading = false,
                                errorMessage = AuthErrorDiagnostics.diagnose(e)
                            )
                        }
                    }
                }
            }
        }
    }

    /**
     * Browser-based OAuth fallback if native Credential Manager is unavailable.
     */
    fun startBrowserGoogleSignIn(context: Context) {
        val webBase = NetworkClient.getWebBaseUrl(BuildConfig.WEB_URL)
        val authUrl = "${webBase}api/native/auth/google"
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(authUrl)).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
        context.startActivity(intent)
    }

    fun onSessionReceived(accessToken: String, refreshToken: String?, userId: String, email: String?) {
        val resolvedEmail = email ?: ""
        secureStorage.saveSession(
            accessToken = accessToken,
            refreshToken = refreshToken ?: "",
            userId = userId,
            email = resolvedEmail
        )
        _uiState.update {
            it.copy(
                isAuthenticated = true,
                userEmail = resolvedEmail,
                isLoading = false,
                errorMessage = null
            )
        }

        viewModelScope.launch {
            AccountSyncService.getInstance(getApplication()).syncAll()
        }
    }

    fun onAuthError(errorDescription: String) {
        _uiState.update { it.copy(isLoading = false, errorMessage = errorDescription) }
    }

    fun logout(onSuccess: () -> Unit) {
        secureStorage.clearSession()
        _uiState.update {
            AuthUiState(
                isAuthenticated = false,
                userEmail = null
            )
        }
        onSuccess()
    }

    fun continueOffline(onSuccess: () -> Unit) {
        onSuccess()
    }
}
