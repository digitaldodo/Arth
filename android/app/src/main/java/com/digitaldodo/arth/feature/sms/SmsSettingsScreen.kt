package com.digitaldodo.arth.feature.sms

import android.Manifest
import android.content.pm.PackageManager
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Button
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.digitaldodo.arth.BuildConfig
import com.digitaldodo.arth.core.sms.SmsNotificationListenerService
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SmsSettingsScreen(
    viewModel: SmsViewModel,
    onNavigateToReview: () -> Unit,
    onBack: () -> Unit
) {
    val state by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    val automaticDetectionSupported = BuildConfig.SMS_DETECTION_SUPPORTED
    var showDisclosure by remember { mutableStateOf(false) }
    var showNotificationDisclosure by remember { mutableStateOf(false) }
    var enableAfterAccessGrant by remember { mutableStateOf(false) }
    var hasSmsPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.READ_SMS) == PackageManager.PERMISSION_GRANTED &&
                ContextCompat.checkSelfPermission(context, Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED
        )
    }
    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        hasSmsPermission = permissions[Manifest.permission.READ_SMS] == true &&
            permissions[Manifest.permission.RECEIVE_SMS] == true
        if (hasSmsPermission) {
            viewModel.setTrackingEnabled(true)
            viewModel.setTrackingPaused(false)
        }
    }

    val appSettingsLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) {
        hasSmsPermission = ContextCompat.checkSelfPermission(context, Manifest.permission.READ_SMS) == PackageManager.PERMISSION_GRANTED &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED
    }

    val lifecycleOwner = androidx.lifecycle.compose.LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = androidx.lifecycle.LifecycleEventObserver { _, event ->
            if (event == androidx.lifecycle.Lifecycle.Event.ON_RESUME) {
                hasSmsPermission = ContextCompat.checkSelfPermission(context, Manifest.permission.READ_SMS) == PackageManager.PERMISSION_GRANTED &&
                    ContextCompat.checkSelfPermission(context, Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED
                viewModel.refreshNotificationAccessState()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }
    val notificationPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { /* In-app review remains available if system notifications are declined. */ }
    val notificationAccessLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) {
        val granted = SmsNotificationListenerService.hasNotificationAccess(context)
        viewModel.refreshNotificationAccessState()
        if (granted && enableAfterAccessGrant) {
            viewModel.setNotificationMonitoringEnabled(true)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
        enableAfterAccessGrant = false
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Automatic Transaction Detection") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding).padding(horizontal = 20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            item {
                Card {
                    Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Column(Modifier.weight(1f)) {
                                Text("Automatic SMS Detection", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                                Text(
                                    if (hasSmsPermission && state.isTrackingEnabled && !state.isTrackingPaused)
                                        "Active • Detecting incoming bank transaction SMS"
                                    else if (!hasSmsPermission)
                                        "Disabled • SMS permission required"
                                    else
                                        "Paused • Incoming SMS processing suspended",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = if (hasSmsPermission && state.isTrackingEnabled && !state.isTrackingPaused)
                                        MaterialTheme.colorScheme.primary
                                    else
                                        MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            Switch(
                                checked = hasSmsPermission && state.isTrackingEnabled && !state.isTrackingPaused,
                                onCheckedChange = { enabled ->
                                    if (enabled) {
                                        if (!hasSmsPermission) {
                                            showDisclosure = true
                                        } else {
                                            viewModel.setTrackingEnabled(true)
                                            viewModel.setTrackingPaused(false)
                                        }
                                    } else {
                                        viewModel.setTrackingPaused(true)
                                    }
                                }
                            )
                        }

                        // Status badges / details
                        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text(
                                text = "Permission Status: ${if (hasSmsPermission) "Granted (READ_SMS, RECEIVE_SMS)" else "Not granted / Revoked"}",
                                style = MaterialTheme.typography.bodySmall,
                                fontWeight = FontWeight.Medium,
                                color = if (hasSmsPermission) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error
                            )
                            Text(
                                text = "Installation Compatibility: ${if (automaticDetectionSupported) "Direct Release (Restricted SMS allowlisted)" else "Standard Installation (SMS Restricted)"}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            val lastScanText = if (state.lastScanTimestamp > 0L) {
                                SimpleDateFormat("dd MMM yyyy, hh:mm a", Locale.getDefault()).format(Date(state.lastScanTimestamp))
                            } else {
                                "Never scanned"
                            }
                            Text(
                                text = "Last Successful Scan: $lastScanText",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }

                        // Statistics overview
                        Row(
                            Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Column {
                                Text("Detected", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text("${state.totalProcessedCount}", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                            }
                            Column {
                                Text("Confirmed", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text("${state.confirmedCount}", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                            }
                            Column {
                                Text("Awaiting Review", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text("${state.pendingCount}", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                            }
                        }

                        // Actions
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            if (!hasSmsPermission) {
                                Button(
                                    onClick = { showDisclosure = true },
                                    modifier = Modifier.weight(1f)
                                ) {
                                    Text("Enable SMS Access")
                                }
                            } else {
                                Button(
                                    onClick = { viewModel.scanHistoricalInbox(onFinished = {}) },
                                    enabled = !state.isScanning && state.isTrackingEnabled,
                                    modifier = Modifier.weight(1f)
                                ) {
                                    Text(if (state.isScanning) "Scanning…" else "Scan Recent Messages")
                                }
                            }

                            OutlinedButton(
                                onClick = {
                                    val intent = Intent(
                                        Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                                        Uri.fromParts("package", context.packageName, null)
                                    )
                                    appSettingsLauncher.launch(intent)
                                }
                            ) {
                                Icon(Icons.Default.Settings, contentDescription = null, modifier = Modifier.height(16.dp))
                                Spacer(Modifier.width(4.dp))
                                Text("Permissions")
                            }
                        }

                        if (!state.scanSummary.isNullOrBlank()) {
                            Text(state.scanSummary!!, style = MaterialTheme.typography.bodySmall)
                        }

                        // Privacy explanation
                        Text(
                            text = "Financial Information Protection: All SMS message processing and categorization executes 100% locally on your device. Raw SMS text is never transmitted to SpendSense servers or stored remotely. Every candidate requires your review before it enters your ledger. Disabling detection on this device does not affect other devices.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
            if (automaticDetectionSupported) {
                item {
                    Card {
                        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            Text("On-device inbox detection", fontWeight = FontWeight.SemiBold)
                            Text(
                                "When this distribution is installed through a channel that grants the restricted SMS permissions, supported transaction alerts can be classified on this device. Candidates stay private and require your review.",
                                style = MaterialTheme.typography.bodyMedium
                            )
                            if (!hasSmsPermission) {
                                Button(onClick = { showDisclosure = true }) { Text("Review and enable SMS access") }
                            } else {
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Column(Modifier.weight(1f)) {
                                        Text("Automatic detection")
                                        Text("Pause or resume incoming message processing", style = MaterialTheme.typography.bodySmall)
                                    }
                                    Switch(
                                        checked = state.isTrackingEnabled && !state.isTrackingPaused,
                                        onCheckedChange = { enabled ->
                                            viewModel.setTrackingEnabled(true)
                                            viewModel.setTrackingPaused(!enabled)
                                        }
                                    )
                                }
                                Button(
                                    onClick = { viewModel.scanHistoricalInbox(onFinished = {}) },
                                    enabled = !state.isScanning && state.isTrackingEnabled
                                ) {
                                    Text(if (state.isScanning) "Scanning messages…" else "Scan recent messages")
                                }
                                if (!state.scanSummary.isNullOrBlank()) {
                                    Text(state.scanSummary!!, style = MaterialTheme.typography.bodySmall)
                                }
                                Text(
                                    "${state.pendingCount} pending · ${state.confirmedCount} confirmed · ${state.dismissedCount} dismissed",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }
                }
            }
            item {
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                    Column(Modifier.padding(18.dp)) {
                        Row {
                            Icon(Icons.Default.Share, contentDescription = null)
                            Spacer(Modifier.width(10.dp))
                            Text("Private, user-selected import", fontWeight = FontWeight.SemiBold)
                        }
                        Spacer(Modifier.height(10.dp))
                        Text(
                            "Use this if message previews are hidden, notification access is unavailable, or you want to import an older message. Open Messages, select a bank or UPI transaction message, choose Share, then select SpendSense. Only a recognized transaction candidate is kept, and you review it before it enters your ledger.",
                            style = MaterialTheme.typography.bodyMedium
                        )
                        Spacer(Modifier.height(10.dp))
                        Text(
                            "This share flow does not request SMS permissions or read inbox history. Notification detection is separate and requires your explicit approval in Android Settings.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
            item {
                Card {
                    Column(Modifier.padding(18.dp)) {
                        Text("Review queue", fontWeight = FontWeight.SemiBold)
                        Spacer(Modifier.height(5.dp))
                        Text("${state.pendingCount} message candidate${if (state.pendingCount == 1) "" else "s"} awaiting your review")
                        if (!state.scanSummary.isNullOrBlank()) {
                            Spacer(Modifier.height(8.dp))
                            Text(state.scanSummary!!, style = MaterialTheme.typography.bodySmall)
                        }
                        Spacer(Modifier.height(12.dp))
                        Button(onClick = onNavigateToReview, enabled = state.pendingCount > 0) {
                            Text("Review imported messages")
                        }
                    }
                }
            }
        }
    }

    if (showNotificationDisclosure) {
        AlertDialog(
            onDismissRequest = { showNotificationDisclosure = false },
            title = { Text("Allow notification access?") },
            text = {
                Text(
                    "Android's notification access can expose notifications from apps on your device. SpendSense will process only alerts posted by your current default Messages app while transaction detection is enabled. It parses eligible text on-device, discards the original text, and keeps each candidate for your review. You can revoke access at any time in Android Settings."
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    showNotificationDisclosure = false
                    enableAfterAccessGrant = true
                    notificationAccessLauncher.launch(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
                }) { Text("Open Android Settings") }
            },
            dismissButton = {
                TextButton(onClick = { showNotificationDisclosure = false }) { Text("Cancel") }
            }
        )
    }

    if (showDisclosure) {
        SmsDisclosureDialog(
            onDismiss = { showDisclosure = false },
            onAccept = {
                showDisclosure = false
                val requestedPermissions = mutableListOf(
                    Manifest.permission.READ_SMS,
                    Manifest.permission.RECEIVE_SMS
                )
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    requestedPermissions.add(Manifest.permission.POST_NOTIFICATIONS)
                }
                permissionLauncher.launch(requestedPermissions.toTypedArray())
            }
        )
    }
}
