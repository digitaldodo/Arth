package com.digitaldodo.arth.feature.auth

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.digitaldodo.arth.BuildConfig
import com.digitaldodo.arth.core.network.LoginRequest
import com.digitaldodo.arth.core.network.NetworkClient
import com.digitaldodo.arth.core.security.SecureStorage
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class AuthUiState(
    val email: String = "",
    val password: String = "",
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val isAuthenticated: Boolean = false
)

class AuthViewModel(application: Application) : AndroidViewModel(application) {
    private val secureStorage = SecureStorage(application)
    private val authApi = NetworkClient.createSupabaseAuthApi()

    private val _uiState = MutableStateFlow(
        AuthUiState(isAuthenticated = secureStorage.isLoggedIn())
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
                if (BuildConfig.SUPABASE_URL.isBlank()) {
                    // Offline development mode
                    secureStorage.saveSession("dev-token", "dev-refresh", "dev-user", email)
                    _uiState.value = _uiState.value.copy(isLoading = false, isAuthenticated = true)
                    onSuccess()
                    return@launch
                }

                val response = authApi.login(LoginRequest(email, password))
                secureStorage.saveSession(
                    accessToken = response.accessToken,
                    refreshToken = response.refreshToken,
                    userId = response.user.id,
                    email = response.user.email ?: email
                )
                _uiState.value = _uiState.value.copy(isLoading = false, isAuthenticated = true)
                onSuccess()
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    errorMessage = e.message ?: "Authentication failed. Check your credentials."
                )
            }
        }
    }

    fun continueOffline(onSuccess: () -> Unit) {
        secureStorage.saveSession("offline-token", "offline-refresh", "offline-user", "offline@arth.local")
        _uiState.value = _uiState.value.copy(isAuthenticated = true)
        onSuccess()
    }
}
