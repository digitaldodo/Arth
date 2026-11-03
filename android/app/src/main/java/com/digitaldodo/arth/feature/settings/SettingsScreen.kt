package com.digitaldodo.arth.feature.settings

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.digitaldodo.arth.BuildConfig
import com.digitaldodo.arth.core.database.ArthDatabase
import com.digitaldodo.arth.core.designsystem.ArthButton
import com.digitaldodo.arth.core.designsystem.ArthCard
import com.digitaldodo.arth.core.designsystem.ArthTheme
import com.digitaldodo.arth.core.security.SecureStorage
import com.digitaldodo.arth.data.repository.TransactionRepository
import com.digitaldodo.arth.feature.sms.SmsDisclosureDialog

@Composable
fun SettingsScreen(
    onNavigateToBalances: () -> Unit,
    onNavigateToPeople: () -> Unit,
    onNavigateToReports: () -> Unit,
    onNavigateToSmsReview: () -> Unit,
    onNavigateToSecurity: () -> Unit,
    onSignOut: () -> Unit
) {
    val context = LocalContext.current
    val secureStorage = remember { SecureStorage(context) }
    val isSmsSupported = BuildConfig.SMS_DETECTION_SUPPORTED
    var showSmsDisclosure by remember { mutableStateOf(false) }
    var showLocalBuildNotice by remember { mutableStateOf(false) }

    var hasSmsPermission by remember {
        mutableStateOf(
            if (isSmsSupported) {
                ContextCompat.checkSelfPermission(context, Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED
            } else {
                false
            }
        )
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        if (isSmsSupported) {
            hasSmsPermission = permissions[Manifest.permission.RECEIVE_SMS] == true ||
                permissions[Manifest.permission.READ_SMS] == true
        }
    }

    val db = remember { ArthDatabase.getInstance(context) }
    val pendingOutboxCount by db.syncOutboxDao().observePendingCount().collectAsState(initial = 0)

    Scaffold(
        topBar = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(MaterialTheme.colorScheme.background)
                    .padding(horizontal = 20.dp, vertical = 12.dp)
            ) {
                Text(
                    text = "More & Settings",
                    style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.Bold),
                    color = MaterialTheme.colorScheme.onBackground
                )
            }
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
            contentPadding = PaddingValues(top = 8.dp, bottom = 32.dp)
        ) {
            // User Session Card
            item {
                ArthCard {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            Icons.Default.AccountCircle,
                            contentDescription = null,
                            modifier = Modifier.size(40.dp),
                            tint = ArthTheme.colors.blue
                        )
                        Spacer(Modifier.width(12.dp))
                        Column {
                            Text(
                                text = secureStorage.getUserEmail() ?: "Arth User",
                                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            Spacer(Modifier.height(2.dp))
                            Text(
                                text = "Local & Cloud Synchronized",
                                style = MaterialTheme.typography.labelSmall,
                                color = ArthTheme.colors.textMuted
                            )
                        }
                    }
                }
            }

            // Financial Modules
            item {
                Text(
                    text = "Financial Tools",
                    style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold),
                    color = ArthTheme.colors.textSecondary
                )
            }

            item {
                SettingsNavigationItem(
                    icon = Icons.Default.AccountBalance,
                    title = "Starting Balances & Transfers",
                    subtitle = "Configure cash & online baselines and transfers",
                    onClick = onNavigateToBalances
                )
            }

            item {
                SettingsNavigationItem(
                    icon = Icons.Default.People,
                    title = "People & Debt Tracker",
                    subtitle = "Track loans, borrowings, and one-tap settlements",
                    onClick = onNavigateToPeople
                )
            }

            item {
                SettingsNavigationItem(
                    icon = Icons.Default.Assessment,
                    title = "Reports & PDF Statements",
                    subtitle = "Generate official printable financial statements",
                    onClick = onNavigateToReports
                )
            }

            // Automation & Intelligence
            item {
                Text(
                    text = "Automation & Privacy",
                    style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold),
                    color = ArthTheme.colors.textSecondary
                )
            }

            item {
                ArthCard(onClick = {
                    if (!isSmsSupported) {
                        showLocalBuildNotice = true
                    } else if (!hasSmsPermission) {
                        showSmsDisclosure = true
                    } else {
                        onNavigateToSmsReview()
                    }
                }) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
                            Icon(Icons.Default.Mail, contentDescription = null, tint = ArthTheme.colors.blue)
                            Spacer(Modifier.width(12.dp))
                            Column {
                                Text(
                                    text = "SMS Transaction Detection",
                                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold)
                                )
                                Spacer(Modifier.height(2.dp))
                                Text(
                                    text = when {
                                        !isSmsSupported -> "Disabled in local build • Available in Play release"
                                        hasSmsPermission -> "Active • Tap to view pending queue"
                                        else -> "Tap to enable on-device detection"
                                    },
                                    style = MaterialTheme.typography.bodySmall,
                                    color = when {
                                        !isSmsSupported -> ArthTheme.colors.textMuted
                                        hasSmsPermission -> ArthTheme.colors.emerald
                                        else -> ArthTheme.colors.amber
                                    }
                                )
                            }
                        }
                        Icon(Icons.Default.ChevronRight, contentDescription = null, tint = ArthTheme.colors.textMuted)
                    }
                }
            }

            // Security & Sync
            item {
                Text(
                    text = "Security & Synchronization",
                    style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold),
                    color = ArthTheme.colors.textSecondary
                )
            }

            item {
                SettingsNavigationItem(
                    icon = Icons.Default.Security,
                    title = "Security & Biometric Lock",
                    subtitle = "Fingerprint app lock, timeout, and hardware status",
                    onClick = onNavigateToSecurity
                )
            }

            item {
                ArthCard {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "Sync Outbox",
                                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold)
                            )
                            Spacer(Modifier.height(2.dp))
                            Text(
                                text = "$pendingOutboxCount items pending upload",
                                style = MaterialTheme.typography.bodySmall,
                                color = ArthTheme.colors.textSecondary
                            )
                        }
                        ArthButton(
                            text = "Sync Now",
                            onClick = { TransactionRepository.triggerSync(context) }
                        )
                    }
                }
            }

            // Sign out
            item {
                Spacer(Modifier.height(8.dp))
                ArthButton(
                    text = "Sign Out",
                    backgroundColor = ArthTheme.colors.crimson,
                    contentColor = MaterialTheme.colorScheme.onError,
                    onClick = {
                        secureStorage.clearSession()
                        onSignOut()
                    },
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }

        if (showSmsDisclosure) {
            SmsDisclosureDialog(
                onDismiss = { showSmsDisclosure = false },
                onAccept = {
                    showSmsDisclosure = false
                    val permissions = mutableListOf(Manifest.permission.RECEIVE_SMS, Manifest.permission.READ_SMS)
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        permissions.add(Manifest.permission.POST_NOTIFICATIONS)
                    }
                    permissionLauncher.launch(permissions.toTypedArray())
                }
            )
        }

        if (showLocalBuildNotice) {
            AlertDialog(
                onDismissRequest = { showLocalBuildNotice = false },
                title = {
                    Text(
                        text = "Local Build Configuration",
                        style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold)
                    )
                },
                text = {
                    Text(
                        text = "Automatic SMS transaction detection is disabled in this local build to prevent Google Play Protect from blocking direct APK sideloading.\n\n" +
                               "The official Google Play distribution build includes complete on-device SMS parsing with explicit privacy disclosures.",
                        style = MaterialTheme.typography.bodyMedium
                    )
                },
                confirmButton = {
                    TextButton(onClick = { showLocalBuildNotice = false }) {
                        Text("Understood")
                    }
                }
            )
        }
    }
}

@Composable
fun SettingsNavigationItem(
    icon: ImageVector,
    title: String,
    subtitle: String,
    onClick: () -> Unit
) {
    ArthCard(onClick = onClick) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
                Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.width(12.dp))
                Column {
                    Text(
                        text = title,
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold)
                    )
                    Spacer(Modifier.height(2.dp))
                    Text(
                        text = subtitle,
                        style = MaterialTheme.typography.bodySmall,
                        color = ArthTheme.colors.textSecondary
                    )
                }
            }
            Icon(Icons.Default.ChevronRight, contentDescription = null, tint = ArthTheme.colors.textMuted)
        }
    }
}
