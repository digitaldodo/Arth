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
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

enum class AuthMode {
    SIGN_IN,
    SIGN_UP,
    FORGOT_PASSWORD
}

enum class ConnectionState {
    CHECKING,
    READY,
    DEGRADED,
    UNAVAILABLE
}

data class AuthUiState(
    val identifier: String = "",
    val email: String = "",
    val username: String = "",
    val password: String = "",
    val confirmPassword: String = "",
    val isPasswordVisible: Boolean = false,
    val isConfirmPasswordVisible: Boolean = false,
    val authMode: AuthMode = AuthMode.SIGN_IN,
    val isLoading: Boolean = false,
    val isGoogleLoading: Boolean = false,
    val errorMessage: String? = null,
    val successMessage: String? = null,
    val showBrowserGoogleFallback: Boolean = false,
    val connectionState: ConnectionState = ConnectionState.CHECKING,
    val connectionNotice: String? = null,
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

    init {
        checkAuthConnectivity()
    }

    fun checkAuthConnectivity() {
        viewModelScope.launch {
            _uiState.update { it.copy(connectionState = ConnectionState.CHECKING, connectionNotice = null) }
            val result = withContext(Dispatchers.IO) {
                try {
                    val webBase = NetworkClient.getWebBaseUrl(BuildConfig.WEB_URL)
                    val conn = (URL("${webBase}api/auth/health").openConnection() as HttpURLConnection).apply {
                        requestMethod = "GET"
                        connectTimeout = 5000
                        readTimeout = 5000
                        setRequestProperty("Accept", "application/json")
                    }
                    try {
                        val bodyText = (if (conn.responseCode < 400) conn.inputStream else conn.errorStream)
                            ?.bufferedReader()?.use { it.readText() }.orEmpty()
                        val json = if (bodyText.startsWith("{")) JSONObject(bodyText) else JSONObject()
                        val ok = json.optBoolean("ok", conn.responseCode in 200..299)
                        val category = json.optString("category", "healthy")
                        val message = json.optString("message", "").takeIf { it.isNotBlank() }
                        when {
                            ok && category == "healthy" -> Pair(ConnectionState.READY, null)
                            ok -> Pair(ConnectionState.DEGRADED, message)
                            else -> Pair(ConnectionState.UNAVAILABLE, message ?: "Authentication service is temporarily unavailable.")
                        }
                    } finally {
                        conn.disconnect()
                    }
                } catch (_: Exception) {
                    Pair(ConnectionState.UNAVAILABLE, "Check your internet connection to sign in or sync records.")
                }
            }
            _uiState.update {
                it.copy(connectionState = result.first, connectionNotice = result.second)
            }
        }
    }

    fun onIdentifierChanged(identifier: String) {
        _uiState.update {
            it.copy(
                identifier = identifier,
                errorMessage = null,
                successMessage = null
            )
        }
    }

    fun onEmailChanged(email: String) {
        _uiState.update {
            it.copy(
                email = email,
                errorMessage = null,
                successMessage = null
            )
        }
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

    fun toggleConfirmPasswordVisibility() {
        _uiState.update { it.copy(isConfirmPasswordVisible = !it.isConfirmPasswordVisible) }
    }

    fun clearStatusMessages() {
        _uiState.update { it.copy(errorMessage = null, successMessage = null) }
    }

    fun setAuthMode(mode: AuthMode) {
        _uiState.update { current ->
            val nextEmail = if (mode == AuthMode.SIGN_UP || mode == AuthMode.FORGOT_PASSWORD) {
                current.email.ifBlank {
                    if (current.identifier.contains("@")) current.identifier else ""
                }
            } else {
                current.email
            }
            val nextIdentifier = if (mode == AuthMode.SIGN_IN) {
                current.identifier.ifBlank { current.email.ifBlank { current.username } }
            } else if (mode == AuthMode.FORGOT_PASSWORD) {
                current.identifier.ifBlank { current.email }
            } else {
                current.identifier
            }
            current.copy(
                authMode = mode,
                email = nextEmail,
                identifier = nextIdentifier,
                errorMessage = null,
                successMessage = null,
                showBrowserGoogleFallback = false
            )
        }
    }

    fun login(onSuccess: () -> Unit) {
        if (_uiState.value.isLoading || _uiState.value.isGoogleLoading) return
        val id = _uiState.value.identifier.trim().ifEmpty { _uiState.value.email.trim() }
        val password = _uiState.value.password
        if (id.isBlank() || password.isBlank()) {
            _uiState.update { it.copy(errorMessage = "Enter your email or username and password to continue.") }
            return
        }

        viewModelScope.launch {
            _uiState.update {
                it.copy(isLoading = true, errorMessage = null, successMessage = null, showBrowserGoogleFallback = false)
            }
            try {
                val req = LoginRequest(identifier = id, email = id, password = password)
                val response = try {
                    nativeAuthApi.login(req)
                } catch (firstErr: Exception) {
                    val canDirectSupabaseFallback =
                        AuthErrorDiagnostics.isConnectivityOrServerFailure(firstErr) &&
                        id.contains("@") &&
                        BuildConfig.SUPABASE_ANON_KEY.isNotBlank()
                    if (!canDirectSupabaseFallback) {
                        throw firstErr
                    }
                    try {
                        supabaseAuthApi.login(SupabasePasswordLoginRequest(email = id.lowercase(), password = password))
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
                        password = "",
                        confirmPassword = "",
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
        if (_uiState.value.isLoading || _uiState.value.isGoogleLoading) return
        val email = _uiState.value.email.trim().lowercase()
        val rawUsername = _uiState.value.username.trim().lowercase()
        val username = rawUsername.takeIf { it.isNotBlank() }
        val password = _uiState.value.password
        val confirm = _uiState.value.confirmPassword

        if (email.isBlank() || !email.contains("@") || !email.contains(".")) {
            _uiState.update { it.copy(errorMessage = "Please enter a valid email address.") }
            return
        }
        if (username != null && !Regex("^[a-z0-9_]{3,20}$").matches(username)) {
            _uiState.update {
                it.copy(errorMessage = "Username must be 3-20 characters using lowercase letters, numbers, or underscores.")
            }
            return
        }
        if (password.length < 8) {
            _uiState.update { it.copy(errorMessage = "Password must be at least 8 characters.") }
            return
        }
        if (password != confirm) {
            _uiState.update { it.copy(errorMessage = "Passwords do not match.") }
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
                            password = "",
                            confirmPassword = "",
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
                            identifier = email,
                            password = "",
                            confirmPassword = "",
                            successMessage = response.message ?: "Account created. Check your email to confirm and activate your account."
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
        if (_uiState.value.isLoading || _uiState.value.isGoogleLoading) return
        val id = _uiState.value.identifier.trim().ifEmpty { _uiState.value.email.trim() }
        if (id.isBlank()) {
            _uiState.update { it.copy(errorMessage = "Please enter your email address or username.") }
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
     * Native Google Sign-In via AndroidX Credential Manager, with automatic seamless browser
     * OAuth fallback whenever device-level Google accounts/credential providers are unavailable.
     */
    fun signInWithNativeGoogle(activity: Activity, onSuccess: () -> Unit) {
        if (_uiState.value.isLoading || _uiState.value.isGoogleLoading) return
        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    isGoogleLoading = true,
                    errorMessage = null,
                    successMessage = null,
                    showBrowserGoogleFallback = false
                )
            }
            val googleAuthManager = GoogleAuthManager(activity)
            when (val result = googleAuthManager.signIn(activity)) {
                is GoogleAuthResult.Cancelled -> {
                    _uiState.update {
                        it.copy(isGoogleLoading = false)
                    }
                }
                is GoogleAuthResult.DeviceCredentialUnavailable -> {
                    // Do not strand the user on a "No Google accounts found in Android Settings" error:
                    // automatically fall back to SpendSense browser OAuth just like web/PWA sign-in.
                    startBrowserGoogleSignIn(activity, triggeredByFallback = true)
                }
                is GoogleAuthResult.Failure -> {
                    _uiState.update {
                        it.copy(
                            isGoogleLoading = false,
                            showBrowserGoogleFallback = true,
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
                            val canFallback = AuthErrorDiagnostics.isConnectivityOrServerFailure(firstErr) &&
                                BuildConfig.SUPABASE_ANON_KEY.isNotBlank()
                            if (!canFallback) throw firstErr
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
                                isGoogleLoading = false,
                                isAuthenticated = true,
                                userEmail = resolvedEmail,
                                password = "",
                                errorMessage = null,
                                showBrowserGoogleFallback = false
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
                                isGoogleLoading = false,
                                showBrowserGoogleFallback = true,
                                errorMessage = AuthErrorDiagnostics.diagnose(e)
                            )
                        }
                    }
                }
            }
        }
    }

    /**
     * Browser-based OAuth fallback using SpendSense web PKCE endpoint -> arth://auth/callback.
     */
    fun startBrowserGoogleSignIn(context: Context, triggeredByFallback: Boolean = false) {
        val webBase = NetworkClient.getWebBaseUrl(BuildConfig.WEB_URL)
        val authUrl = "${webBase}api/native/auth/google"
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(authUrl)).apply {
            addCategory(Intent.CATEGORY_BROWSABLE)
            if (context !is Activity) {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
        }
        try {
            context.startActivity(intent)
            _uiState.update {
                it.copy(
                    isGoogleLoading = false,
                    errorMessage = null,
                    showBrowserGoogleFallback = true,
                    successMessage = if (triggeredByFallback) {
                        "Continue Google sign-in in your browser. SpendSense will open automatically once complete."
                    } else {
                        "Complete Google sign-in in the browser window that just opened."
                    }
                )
            }
        } catch (_: Exception) {
            _uiState.update {
                it.copy(
                    isGoogleLoading = false,
                    showBrowserGoogleFallback = true,
                    errorMessage = "No web browser found on this device to open Google sign-in."
                )
            }
        }
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
                isGoogleLoading = false,
                password = "",
                confirmPassword = "",
                errorMessage = null,
                successMessage = null,
                showBrowserGoogleFallback = false
            )
        }

        viewModelScope.launch {
            AccountSyncService.getInstance(getApplication()).syncAll()
        }
    }

    fun onAuthError(errorDescription: String) {
        _uiState.update {
            it.copy(
                isLoading = false,
                isGoogleLoading = false,
                showBrowserGoogleFallback = true,
                errorMessage = errorDescription
            )
        }
    }

    fun logout(onSuccess: () -> Unit) {
        secureStorage.clearSession()
        _uiState.update {
            AuthUiState(
                isAuthenticated = false,
                userEmail = null
            )
        }
        checkAuthConnectivity()
        onSuccess()
    }

    fun continueOffline(onSuccess: () -> Unit) {
        onSuccess()
    }
}
