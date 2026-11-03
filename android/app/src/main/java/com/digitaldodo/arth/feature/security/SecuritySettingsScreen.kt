package com.digitaldodo.arth.feature.security

import android.app.Activity
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.fragment.app.FragmentActivity
import com.digitaldodo.arth.core.designsystem.*
import com.digitaldodo.arth.core.security.*
import kotlinx.coroutines.launch

@Composable
fun SecuritySettingsScreen(
    onBack: () -> Unit
) {
    val context = LocalContext.current
    val activity = context as? FragmentActivity
    val preferencesRepo = remember { BiometricPreferencesRepository.getInstance(context) }
    val coroutineScope = rememberCoroutineScope()

    val isLockEnabled by preferencesRepo.isBiometricLockEnabled.collectAsState(initial = preferencesRepo.isBiometricLockEnabledSync())
    val lockTimeout by preferencesRepo.lockTimeout.collectAsState(initial = LockTimeout.fromSeconds(preferencesRepo.getLockTimeoutSecondsSync()))

    var biometricStatus by remember { mutableStateOf(BiometricAuthManager.checkBiometricStatus(context)) }
    var hasDeviceCredential by remember { mutableStateOf(BiometricAuthManager.hasDeviceCredential(context)) }
    var statusMessage by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        biometricStatus = BiometricAuthManager.checkBiometricStatus(context)
        hasDeviceCredential = BiometricAuthManager.hasDeviceCredential(context)
    }

    Scaffold(
        topBar = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(MaterialTheme.colorScheme.background)
                    .padding(horizontal = 8.dp, vertical = 8.dp)
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                    Spacer(Modifier.width(8.dp))
                    Column {
                        Text(
                            text = "More › Settings › Security",
                            style = MaterialTheme.typography.labelSmall,
                            color = ArthTheme.colors.textMuted
                        )
                        Text(
                            text = "Security",
                            style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                            color = MaterialTheme.colorScheme.onBackground
                        )
                    }
                }
            }
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
            contentPadding = PaddingValues(top = 8.dp, bottom = 32.dp)
        ) {
            // Main Biometric App Lock Toggle Card
            item {
                ArthCard {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
                            Icon(
                                imageVector = Icons.Default.Fingerprint,
                                contentDescription = null,
                                tint = if (isLockEnabled) ArthTheme.colors.emerald else ArthTheme.colors.blue,
                                modifier = Modifier.size(28.dp)
                            )
                            Spacer(Modifier.width(12.dp))
                            Column {
                                Text(
                                    text = "Biometric App Lock",
                                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                                Spacer(Modifier.height(2.dp))
                                Text(
                                    text = when {
                                        !isLockEnabled -> "Disabled"
                                        biometricStatus == BiometricStatus.READY -> "Active • Fingerprint protected"
                                        hasDeviceCredential -> "Active • Device credential protected"
                                        else -> "Enabled"
                                    },
                                    style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
                                    color = when {
                                        !isLockEnabled -> ArthTheme.colors.textMuted
                                        biometricStatus == BiometricStatus.READY -> ArthTheme.colors.emerald
                                        else -> ArthTheme.colors.amber
                                    }
                                )
                            }
                        }

                        Switch(
                            checked = isLockEnabled,
                            onCheckedChange = { targetState ->
                                if (activity == null) return@Switch

                                if (targetState) {
                                    // Verify hardware/credentials first
                                    if (!BiometricAuthManager.canAuthenticate(context)) {
                                        statusMessage = "Cannot enable: No enrolled fingerprint or secure screen lock on this device."
                                        return@Switch
                                    }

                                    // Require biometric/credential confirmation to enable
                                    BiometricAuthManager.authenticate(
                                        activity = activity,
                                        title = "Enable Biometric Lock",
                                        subtitle = "Authenticate with your fingerprint or device PIN to confirm",
                                        onSuccess = {
                                            coroutineScope.launch {
                                                preferencesRepo.setBiometricLockEnabled(true)
                                                statusMessage = "Biometric App Lock enabled successfully."
                                            }
                                        },
                                        onError = { _, err ->
                                            statusMessage = "Authentication cancelled: $err"
                                        }
                                    )
                                } else {
                                    // Require biometric/credential confirmation to disable
                                    BiometricAuthManager.authenticate(
                                        activity = activity,
                                        title = "Disable Biometric Lock",
                                        subtitle = "Authenticate to confirm turning off app lock",
                                        onSuccess = {
                                            coroutineScope.launch {
                                                preferencesRepo.setBiometricLockEnabled(false)
                                                statusMessage = "Biometric App Lock disabled."
                                            }
                                        },
                                        onError = { _, err ->
                                            statusMessage = "Authentication cancelled: $err"
                                        }
                                    )
                                }
                            }
                        )
                    }

                    Spacer(Modifier.height(12.dp))
                    HorizontalDivider(color = ArthTheme.colors.border)
                    Spacer(Modifier.height(10.dp))

                    // Explanatory guidance based on hardware & enrollment
                    Text(
                        text = when (biometricStatus) {
                            BiometricStatus.READY ->
                                "When enabled, Arth prompts for your fingerprint whenever you open the app or return after the configured timeout. Device PIN, pattern, or password will be used as a fallback."
                            BiometricStatus.NOT_ENROLLED ->
                                "No fingerprint is registered on this device. You can enroll a fingerprint in your device Settings, or use your device PIN/pattern as a fallback."
                            BiometricStatus.NO_HARDWARE ->
                                "This device does not have biometric hardware. You can still use your device PIN, pattern, or password."
                            BiometricStatus.HARDWARE_UNAVAILABLE ->
                                "Biometric hardware is temporarily unavailable on your device."
                            BiometricStatus.SECURITY_UPDATE_REQUIRED ->
                                "A security update is required on your device before biometric authentication can be used."
                            BiometricStatus.UNSUPPORTED ->
                                "Biometric authentication is not supported on this platform configuration."
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = ArthTheme.colors.textSecondary
                    )

                    // Button to open Android settings if no fingerprint enrolled
                    if (biometricStatus == BiometricStatus.NOT_ENROLLED && activity != null) {
                        Spacer(Modifier.height(12.dp))
                        ArthOutlinedButton(
                            text = "Enroll Fingerprint in Android Settings",
                            icon = Icons.Default.OpenInNew,
                            onClick = { BiometricAuthManager.openEnrollmentSettings(activity) },
                            modifier = Modifier.fillMaxWidth()
                        )
                    }

                    if (!statusMessage.isNullOrBlank()) {
                        Spacer(Modifier.height(10.dp))
                        Text(
                            text = statusMessage ?: "",
                            style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Medium),
                            color = ArthTheme.colors.blue
                        )
                    }
                }
            }

            // Lock Timeout Selection (Only when lock is enabled)
            if (isLockEnabled) {
                item {
                    ArthCard {
                        Text(
                            text = "Lock Timeout",
                            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        Spacer(Modifier.height(4.dp))
                        Text(
                            text = "Require authentication when returning to Arth after moving it to the background.",
                            style = MaterialTheme.typography.bodySmall,
                            color = ArthTheme.colors.textSecondary
                        )

                        Spacer(Modifier.height(14.dp))

                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            LockTimeout.entries.forEach { option ->
                                val isSelected = lockTimeout == option
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clip(RoundedCornerShape(8.dp))
                                        .border(
                                            1.dp,
                                            if (isSelected) MaterialTheme.colorScheme.primary else ArthTheme.colors.border,
                                            RoundedCornerShape(8.dp)
                                        )
                                        .background(
                                            if (isSelected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface
                                        )
                                        .clickable {
                                            coroutineScope.launch {
                                                preferencesRepo.setLockTimeout(option)
                                            }
                                        }
                                        .padding(horizontal = 14.dp, vertical = 12.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        text = option.label,
                                        style = MaterialTheme.typography.bodyMedium.copy(
                                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal
                                        ),
                                        color = if (isSelected) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurface
                                    )
                                    if (isSelected) {
                                        Icon(
                                            Icons.Default.Check,
                                            contentDescription = "Selected",
                                            tint = MaterialTheme.colorScheme.primary,
                                            modifier = Modifier.size(18.dp)
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Security Architecture & Privacy Guarantee Card
            item {
                ArthCard(backgroundColor = MaterialTheme.colorScheme.surfaceVariant) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            Icons.Default.Shield,
                            contentDescription = null,
                            tint = ArthTheme.colors.blue,
                            modifier = Modifier.size(20.dp)
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(
                            text = "Hardware Security Guarantee",
                            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    Spacer(Modifier.height(6.dp))
                    Text(
                        text = "Arth uses standard AndroidX BiometricPrompt. Biometric templates and cryptographic keys never leave your device's hardware security module (Secure Element / TEE). Arth never reads, collects, or transmits your raw fingerprint or biometric data.",
                        style = MaterialTheme.typography.bodySmall,
                        color = ArthTheme.colors.textSecondary
                    )
                }
            }
        }
    }
}
