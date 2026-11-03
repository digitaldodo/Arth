package com.digitaldodo.arth.core.security

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.*
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.io.IOException

val Context.biometricDataStore: DataStore<Preferences> by preferencesDataStore(name = "arth_biometric_prefs")

enum class LockTimeout(val seconds: Int, val label: String) {
    IMMEDIATELY(0, "Immediately"),
    THIRTY_SECONDS(30, "After 30 seconds"),
    ONE_MINUTE(60, "After 1 minute"),
    FIVE_MINUTES(300, "After 5 minutes");

    companion object {
        fun fromSeconds(seconds: Int): LockTimeout {
            return entries.find { it.seconds == seconds } ?: IMMEDIATELY
        }
    }
}

class BiometricPreferencesRepository(private val context: Context) {

    private val dataStore = context.biometricDataStore

    // In-memory cache for synchronous checks during startup and cold launch
    @Volatile
    private var cachedLockEnabled: Boolean = false
    @Volatile
    private var cachedTimeoutSeconds: Int = 0

    init {
        // Seed initial cache from SecureStorage if present (backward compatibility)
        val legacyStorage = SecureStorage(context)
        cachedLockEnabled = legacyStorage.isBiometricLockEnabled()

        // Eagerly observe DataStore changes to keep in-memory cache synchronized
        CoroutineScope(Dispatchers.IO).launch {
            dataStore.data
                .catch { exception ->
                    if (exception is IOException) {
                        emit(emptyPreferences())
                    } else {
                        throw exception
                    }
                }
                .collect { prefs ->
                    val storedEnabled = prefs[KEY_BIOMETRIC_LOCK_ENABLED]
                    if (storedEnabled != null) {
                        cachedLockEnabled = storedEnabled
                    } else if (legacyStorage.isBiometricLockEnabled()) {
                        // Migrate legacy preference to DataStore
                        setBiometricLockEnabled(true)
                    }
                    cachedTimeoutSeconds = prefs[KEY_LOCK_TIMEOUT_SECONDS] ?: 0
                }
        }
    }

    val isBiometricLockEnabled: Flow<Boolean> = dataStore.data
        .catch { exception ->
            if (exception is IOException) {
                emit(emptyPreferences())
            } else {
                throw exception
            }
        }
        .map { prefs ->
            prefs[KEY_BIOMETRIC_LOCK_ENABLED] ?: cachedLockEnabled
        }

    val lockTimeout: Flow<LockTimeout> = dataStore.data
        .catch { exception ->
            if (exception is IOException) {
                emit(emptyPreferences())
            } else {
                throw exception
            }
        }
        .map { prefs ->
            val seconds = prefs[KEY_LOCK_TIMEOUT_SECONDS] ?: 0
            LockTimeout.fromSeconds(seconds)
        }

    suspend fun setBiometricLockEnabled(enabled: Boolean) {
        cachedLockEnabled = enabled
        // Also keep legacy SecureStorage in sync
        SecureStorage(context).setBiometricLockEnabled(enabled)
        dataStore.edit { prefs ->
            prefs[KEY_BIOMETRIC_LOCK_ENABLED] = enabled
        }
    }

    suspend fun setLockTimeout(timeout: LockTimeout) {
        cachedTimeoutSeconds = timeout.seconds
        dataStore.edit { prefs ->
            prefs[KEY_LOCK_TIMEOUT_SECONDS] = timeout.seconds
        }
    }

    fun isBiometricLockEnabledSync(): Boolean = cachedLockEnabled

    fun getLockTimeoutSecondsSync(): Int = cachedTimeoutSeconds

    companion object {
        val KEY_BIOMETRIC_LOCK_ENABLED = booleanPreferencesKey("biometric_lock_enabled")
        val KEY_LOCK_TIMEOUT_SECONDS = intPreferencesKey("biometric_lock_timeout_seconds")

        @Volatile
        private var instance: BiometricPreferencesRepository? = null

        fun getInstance(context: Context): BiometricPreferencesRepository {
            return instance ?: synchronized(this) {
                instance ?: BiometricPreferencesRepository(context.applicationContext).also { instance = it }
            }
        }
    }
}
