package com.digitaldodo.arth.feature.sms

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.BatteryAlert
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Sms
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.digitaldodo.arth.BuildConfig
import com.digitaldodo.arth.core.designsystem.*
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
    val smsSupported = BuildConfig.SMS_DETECTION_SUPPORTED

    var showSmsDisclosure by remember { mutableStateOf(false) }
    var showNotificationDisclosure by remember { mutableStateOf(false) }
    var showSourcesExpanded by remember { mutableStateOf(false) }
    var enableAfterAccessGrant by remember { mutableStateOf(false) }

    var hasSmsPermission by remember {
        mutableStateOf(viewModel.hasSmsPermissions())
    }

    val smsPermissionLauncher = rememberLauncherForActivityResult(
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
        hasSmsPermission = viewModel.hasSmsPermissions()
        viewModel.refreshNotificationAccessState()
    }

    val notificationPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { /* Review queue stays accessible inside app even if posting reminders is declined. */ }

    val notificationAccessLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) {
        val granted = SmsNotificationListenerService.hasNotificationAccess(context)
        viewModel.refreshNotificationAccessState()
        if (granted && enableAfterAccessGrant) {
            viewModel.setNotificationMonitoringEnabled(true)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
            ) {
                notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
        enableAfterAccessGrant = false
    }

    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                hasSmsPermission = viewModel.hasSmsPermissions()
                viewModel.refreshNotificationAccessState()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    val captureStatus = state.resolveCaptureStatus(hasSmsPermission)

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
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                    Spacer(Modifier.width(4.dp))
                    Column {
                        Text(
                            text = "Automatic Transaction Capture",
                            style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.SemiBold),
                            color = MaterialTheme.colorScheme.onBackground
                        )
                        Text(
                            text = "Capture eligible bank and payment notifications to help keep your ledger up to date.",
                            style = MaterialTheme.typography.bodySmall,
                            color = ArthTheme.colors.textMuted
                        )
                    }
                }
                Spacer(Modifier.height(6.dp))
                HorizontalDivider(color = ArthTheme.colors.border)
            }
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
            contentPadding = PaddingValues(top = 10.dp, bottom = 32.dp)
        ) {
            // 1. Live Capture Status Overview
            item {
                val (statusBg, statusFg, statusBorder) = when (captureStatus) {
                    CaptureStatusKind.ENABLED -> Triple(ArthTheme.colors.emeraldContainer, ArthTheme.colors.emerald, ArthTheme.colors.incomeBorder)
                    CaptureStatusKind.PERMISSION_REQUIRED, CaptureStatusKind.NO_SOURCES_SELECTED ->
                        Triple(ArthTheme.colors.amberContainer, ArthTheme.colors.amber, ArthTheme.colors.amberBorder)
                    CaptureStatusKind.CAPTURE_ERROR ->
                        Triple(ArthTheme.colors.crimsonContainer, ArthTheme.colors.crimson, ArthTheme.colors.expenseBorder)
                    CaptureStatusKind.ACCESS_DISABLED, CaptureStatusKind.UNSUPPORTED ->
                        Triple(ArthTheme.colors.surfaceSubtle, ArthTheme.colors.textSecondary, ArthTheme.colors.border)
                }

                ArthCard {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "CAPTURE STATUS",
                            style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
                            color = ArthTheme.colors.textMuted
                        )
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(3.dp))
                                .background(statusBg)
                                .border(1.dp, statusBorder, RoundedCornerShape(3.dp))
                                .padding(horizontal = 8.dp, vertical = 3.dp)
                        ) {
                            Text(
                                text = captureStatus.label,
                                style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
                                color = statusFg
                            )
                        }
                    }

                    Spacer(Modifier.height(12.dp))

                    StatusLine("Notification Access", if (state.hasNotificationAccess) "Granted" else "Not granted")
                    StatusLine(
                        "Listener Service",
                        when {
                            !state.hasNotificationAccess -> "Waiting for permission"
                            state.isNotificationListenerConnected -> "Connected"
                            else -> "Reconnecting / Idle"
                        }
                    )
                    if (smsSupported) {
                        StatusLine("Direct Inbox SMS", if (hasSmsPermission) "Granted (Direct variant)" else "Not granted")
                    } else {
                        StatusLine("SMS Inbox Access", "Unavailable in standard/Play build")
                    }
                    StatusLine("Enabled Financial Sources", "${state.enabledSourcesCount} active")
                    val lastCaptureLabel = if (state.lastCaptureTimestamp > 0L) {
                        val sdf = SimpleDateFormat("dd MMM, hh:mm a", Locale.getDefault())
                        "${sdf.format(Date(state.lastCaptureTimestamp))}${state.lastCaptureSource?.let { " · $it" } ?: ""}"
                    } else {
                        "No alerts captured yet"
                    }
                    StatusLine("Last Capture", lastCaptureLabel)

                    if (!state.lastCaptureError.isNullOrBlank()) {
                        Spacer(Modifier.height(6.dp))
                        Text(
                            text = state.lastCaptureError!!,
                            style = MaterialTheme.typography.bodySmall,
                            color = ArthTheme.colors.crimson
                        )
                    }

                    Spacer(Modifier.height(12.dp))
                    HorizontalDivider(color = ArthTheme.colors.border)
                    Spacer(Modifier.height(10.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        MetricColumn("Detected", "${state.totalProcessedCount}")
                        MetricColumn("Confirmed", "${state.confirmedCount}")
                        MetricColumn("Pending Review", "${state.pendingCount}")
                    }
                }
            }

            // 2. Notification Capture Section (Play-compliant & Standard APK primary capture)
            item {
                ArthCard {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.weight(1f)
                        ) {
                            Icon(
                                imageVector = Icons.Default.NotificationsActive,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(20.dp)
                            )
                            Spacer(Modifier.width(10.dp))
                            Column {
                                Text(
                                    text = "Notification-Based Capture",
                                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold)
                                )
                                Text(
                                    text = if (!state.hasNotificationAccess) {
                                        "Requires Notification Access in Android Settings"
                                    } else if (state.isNotificationMonitoringEnabled) {
                                        "Listening locally to selected financial & SMS alerts"
                                    } else {
                                        "Paused on this device"
                                    },
                                    style = MaterialTheme.typography.bodySmall,
                                    color = ArthTheme.colors.textSecondary
                                )
                            }
                        }

                        Switch(
                            checked = state.hasNotificationAccess && state.isNotificationMonitoringEnabled,
                            onCheckedChange = { enabled ->
                                if (enabled) {
                                    if (!state.hasNotificationAccess) {
                                        showNotificationDisclosure = true
                                    } else {
                                        viewModel.setNotificationMonitoringEnabled(true)
                                    }
                                } else {
                                    viewModel.setNotificationMonitoringEnabled(false)
                                }
                            }
                        )
                    }

                    Spacer(Modifier.height(10.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        if (!state.hasNotificationAccess) {
                            ArthButton(
                                text = "Set Up Notification Access",
                                onClick = { showNotificationDisclosure = true },
                                modifier = Modifier.weight(1f)
                            )
                        } else if (state.isNotificationMonitoringEnabled) {
                            ArthOutlinedButton(
                                text = "Disable Capture",
                                onClick = { viewModel.disableCapture() },
                                modifier = Modifier.weight(1f)
                            )
                        } else {
                            ArthButton(
                                text = "Resume Capture",
                                onClick = { viewModel.setNotificationMonitoringEnabled(true) },
                                modifier = Modifier.weight(1f)
                            )
                        }

                        ArthOutlinedButton(
                            text = "App Info",
                            icon = Icons.Default.Settings,
                            onClick = {
                                appSettingsLauncher.launch(
                                    Intent(
                                        Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                                        Uri.fromParts("package", context.packageName, null)
                                    )
                                )
                            }
                        )
                    }

                    Spacer(Modifier.height(12.dp))
                    HorizontalDivider(color = ArthTheme.colors.border)
                    Spacer(Modifier.height(10.dp))

                    // Monitored financial apps expandable allowlist
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { showSourcesExpanded = !showSourcesExpanded }
                            .padding(vertical = 4.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "Monitored Financial Apps (${state.enabledSourcesCount})",
                                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold)
                            )
                            Text(
                                text = "Only selected packages are inspected; unrelated apps are dropped before parsing.",
                                style = MaterialTheme.typography.bodySmall,
                                color = ArthTheme.colors.textMuted
                            )
                        }
                        Icon(
                            imageVector = if (showSourcesExpanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                            contentDescription = "Toggle source list",
                            tint = ArthTheme.colors.textMuted
                        )
                    }

                    if (showSourcesExpanded) {
                        Spacer(Modifier.height(8.dp))
                        // Default Messages App row
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 4.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = state.defaultSmsAppLabel ?: "Default Messages App",
                                    style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium)
                                )
                                Text(
                                    text = "Bank SMS notifications without inbox access",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = ArthTheme.colors.textMuted
                                )
                            }
                            Switch(
                                checked = state.isNotificationDefaultSmsEnabled,
                                onCheckedChange = { viewModel.setNotificationDefaultSmsEnabled(it) }
                            )
                        }

                        HorizontalDivider(color = ArthTheme.colors.border, modifier = Modifier.padding(vertical = 4.dp))

                        state.discoveredSources.forEach { item ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 4.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                                    ) {
                                        Text(
                                            text = item.source.displayName,
                                            style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium)
                                        )
                                        if (item.isInstalled) {
                                            Box(
                                                modifier = Modifier
                                                    .clip(RoundedCornerShape(2.dp))
                                                    .background(ArthTheme.colors.emeraldContainer)
                                                    .padding(horizontal = 5.dp, vertical = 1.dp)
                                            ) {
                                                Text(
                                                    text = "Installed",
                                                    style = MaterialTheme.typography.labelSmall,
                                                    color = ArthTheme.colors.emerald
                                                )
                                            }
                                        }
                                    }
                                    Text(
                                        text = item.source.category.label,
                                        style = MaterialTheme.typography.labelSmall,
                                        color = ArthTheme.colors.textMuted
                                    )
                                }
                                Switch(
                                    checked = item.isEnabled,
                                    onCheckedChange = { viewModel.toggleNotificationSource(item.source.packageName, it) }
                                )
                            }
                        }
                    }
                }
            }

            // 3. Direct SMS Capture (Shown honestly by flavor capability)
            item {
                ArthCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Default.Sms,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(18.dp)
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(
                            text = "Direct Inbox SMS Capture",
                            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold)
                        )
                    }
                    Spacer(Modifier.height(6.dp))

                    if (smsSupported) {
                        Text(
                            text = "Available in this direct-distribution variant after installer allowlisting and your runtime SMS consent.",
                            style = MaterialTheme.typography.bodySmall,
                            color = ArthTheme.colors.textSecondary
                        )
                        Spacer(Modifier.height(10.dp))

                        if (!hasSmsPermission) {
                            ArthButton(
                                text = "Review & Enable SMS Access",
                                onClick = { showSmsDisclosure = true },
                                modifier = Modifier.fillMaxWidth()
                            )
                        } else {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text("Live SMS Broadcast Listener", style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium))
                                    Text(
                                        text = if (state.isTrackingEnabled && !state.isTrackingPaused) "Active on incoming bank SMS" else "Paused",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = ArthTheme.colors.textMuted
                                    )
                                }
                                Switch(
                                    checked = state.isTrackingEnabled && !state.isTrackingPaused,
                                    onCheckedChange = { enabled ->
                                        viewModel.setTrackingEnabled(true)
                                        viewModel.setTrackingPaused(!enabled)
                                    }
                                )
                            }
                            Spacer(Modifier.height(8.dp))
                            ArthButton(
                                text = if (state.isScanning) "Scanning Recent SMS…" else "Scan Recent Inbox (${state.historicalDays}d)",
                                enabled = !state.isScanning,
                                isLoading = state.isScanning,
                                onClick = { viewModel.scanHistoricalInbox() },
                                modifier = Modifier.fillMaxWidth()
                            )
                        }
                    } else {
                        Text(
                            text = "Standard & Google Play builds omit READ_SMS and RECEIVE_SMS to comply with Android and Google Play SMS privacy policies. Use Notification Capture above, Share → SpendSense, or CSV statement import instead.",
                            style = MaterialTheme.typography.bodySmall,
                            color = ArthTheme.colors.textSecondary
                        )
                    }
                }
            }

            // 4. Review Queue
            item {
                ArthCard {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Review Queue", style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold))
                            Text(
                                text = "${state.pendingCount} transaction candidate${if (state.pendingCount == 1) "" else "s"} awaiting review",
                                style = MaterialTheme.typography.bodySmall,
                                color = ArthTheme.colors.textSecondary
                            )
                        }
                        if (state.pendingCount > 0) {
                            Icon(
                                imageVector = Icons.Default.CheckCircle,
                                contentDescription = null,
                                tint = ArthTheme.colors.emerald
                            )
                        }
                    }

                    if (!state.scanSummary.isNullOrBlank()) {
                        Spacer(Modifier.height(8.dp))
                        Text(
                            text = state.scanSummary!!,
                            style = MaterialTheme.typography.bodySmall,
                            color = ArthTheme.colors.textSecondary
                        )
                    }

                    Spacer(Modifier.height(12.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        ArthButton(
                            text = "Review Pending (${state.pendingCount})",
                            enabled = state.pendingCount > 0,
                            onClick = onNavigateToReview,
                            modifier = Modifier.weight(1f)
                        )
                        if (state.pendingCount > 0) {
                            ArthOutlinedButton(
                                text = "Clear",
                                onClick = { viewModel.clearPendingSuggestions() }
                            )
                        }
                    }
                }
            }

            // 5. Fallback Share Import & Troubleshooting Guidance
            item {
                ArthCard(backgroundColor = ArthTheme.colors.surfaceSubtle) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Share, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("User-Selected Share Import (Fallback)", style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold))
                    }
                    Spacer(Modifier.height(6.dp))
                    Text(
                        text = "If a bank hides notification previews or does not emit push alerts, long-press any bank SMS or receipt and choose Share → SpendSense to stage a candidate for review.",
                        style = MaterialTheme.typography.bodySmall,
                        color = ArthTheme.colors.textSecondary
                    )
                    Spacer(Modifier.height(10.dp))
                    HorizontalDivider(color = ArthTheme.colors.border)
                    Spacer(Modifier.height(10.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.BatteryAlert, contentDescription = null, tint = ArthTheme.colors.amber, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("Android Troubleshooting", style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold))
                    }
                    Spacer(Modifier.height(6.dp))
                    Text(
                        text = "• Android 13+: If Notification Access toggle is disabled in System Settings, open App Info → (⋮) → Allow restricted settings.\n" +
                            "• Background reliability: Set SpendSense Battery usage to Unrestricted (especially on MIUI, ColorOS, OxygenOS, OneUI).\n" +
                            "• Lock screen redaction: Ensure notification previews are shown if relying on Messages notifications.",
                        style = MaterialTheme.typography.bodySmall,
                        color = ArthTheme.colors.textSecondary
                    )
                }
            }
        }
    }

    if (showNotificationDisclosure) {
        NotificationCaptureDisclosureDialog(
            onDismiss = { showNotificationDisclosure = false },
            onContinueToSettings = {
                showNotificationDisclosure = false
                enableAfterAccessGrant = true
                notificationAccessLauncher.launch(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
            }
        )
    }

    if (showSmsDisclosure) {
        SmsDisclosureDialog(
            onDismiss = { showSmsDisclosure = false },
            onAccept = {
                showSmsDisclosure = false
                val requestedPermissions = mutableListOf(
                    Manifest.permission.READ_SMS,
                    Manifest.permission.RECEIVE_SMS
                )
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    requestedPermissions.add(Manifest.permission.POST_NOTIFICATIONS)
                }
                smsPermissionLauncher.launch(requestedPermissions.toTypedArray())
            }
        )
    }
}

@Composable
private fun StatusLine(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 3.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = ArthTheme.colors.textSecondary
        )
        Text(
            text = value,
            style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold),
            color = MaterialTheme.colorScheme.onSurface
        )
    }
}

@Composable
private fun MetricColumn(label: String, value: String) {
    Column {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = ArthTheme.colors.textMuted
        )
        Spacer(Modifier.height(2.dp))
        Text(
            text = value,
            style = ArthFigureMediumStyle,
            color = MaterialTheme.colorScheme.onSurface
        )
    }
}
