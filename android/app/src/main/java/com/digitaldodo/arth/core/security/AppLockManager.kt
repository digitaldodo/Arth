package com.digitaldodo.arth.core.security

import android.content.Context
import android.os.SystemClock
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

object AppLockManager {

    private val _isLocked = MutableStateFlow(false)
    val isLocked: StateFlow<Boolean> = _isLocked.asStateFlow()

    @Volatile
    var isPromptShowing: Boolean = false

    private var lastBackgroundTimeMillis: Long = 0L

    fun initialize(context: Context) {
        val secureStorage = SecureStorage(context)
        val preferencesRepo = BiometricPreferencesRepository.getInstance(context)

        if (secureStorage.isLoggedIn() && preferencesRepo.isBiometricLockEnabledSync()) {
            _isLocked.value = true
        } else {
            _isLocked.value = false
        }
    }

    fun onAppBackgrounded() {
        if (isPromptShowing) return
        lastBackgroundTimeMillis = SystemClock.elapsedRealtime()
    }

    fun onAppForegrounded(context: Context) {
        if (isPromptShowing) return

        val secureStorage = SecureStorage(context)
        val preferencesRepo = BiometricPreferencesRepository.getInstance(context)

        if (secureStorage.isLoggedIn() && preferencesRepo.isBiometricLockEnabledSync()) {
            val timeoutSeconds = preferencesRepo.getLockTimeoutSecondsSync()
            val elapsedMillis = SystemClock.elapsedRealtime() - lastBackgroundTimeMillis

            if (timeoutSeconds <= 0 || elapsedMillis >= timeoutSeconds * 1000L) {
                _isLocked.value = true
            }
        }
    }

    fun unlock() {
        _isLocked.value = false
    }

    fun lock() {
        _isLocked.value = true
    }
}
