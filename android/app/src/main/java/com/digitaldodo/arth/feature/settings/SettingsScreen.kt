package com.digitaldodo.arth.feature.settings

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
import androidx.compose.ui.unit.sp
import com.digitaldodo.arth.core.database.ArthDatabase
import com.digitaldodo.arth.core.designsystem.ArthButton
import com.digitaldodo.arth.core.designsystem.ArthCard
import com.digitaldodo.arth.core.designsystem.ArthOutlinedButton
import com.digitaldodo.arth.core.designsystem.ArthTheme
import com.digitaldodo.arth.core.security.SecureStorage
import com.digitaldodo.arth.core.sync.AccountSyncService
import com.digitaldodo.arth.core.sync.SyncState
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*

@Composable
fun SettingsScreen(
    onNavigateToBalances: () -> Unit,
    onNavigateToPeople: () -> Unit,
    onNavigateToReports: () -> Unit,
    onNavigateToSmsSettings: () -> Unit,
    onNavigateToSecurity: () -> Unit,
    onSignOut: () -> Unit
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    val secureStorage = remember { SecureStorage(context) }
    val db = remember { ArthDatabase.getInstance(context) }
    val pendingOutboxCount by db.syncOutboxDao().observePendingCount().collectAsState(initial = 0)
    val syncService = remember { AccountSyncService.getInstance(context) }
    val syncState by syncService.syncState.collectAsState()

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
                Text(
                    text = "Preferences, Security & Data Sync",
                    style = MaterialTheme.typography.bodySmall,
                    color = ArthTheme.colors.textMuted
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
                            tint = MaterialTheme.colorScheme.primary
                        )
                        Spacer(Modifier.width(12.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = secureStorage.getUserEmail() ?: "SpendSense Account",
                                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            Spacer(Modifier.height(2.dp))
                            val lastSync = secureStorage.getLastSyncTimestamp()
                            val syncText = if (lastSync > 0L) {
                                val sdf = SimpleDateFormat("dd MMM, hh:mm a", Locale.getDefault())
                                "Synced ${sdf.format(Date(lastSync))}"
                            } else {
                                "Connected to SpendSense Cloud"
                            }
                            Text(
                                text = syncText,
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
                    text = "FINANCIAL TOOLS",
                    style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 1.sp, fontWeight = FontWeight.SemiBold),
                    color = ArthTheme.colors.textSecondary
                )
            }

            item {
                SettingsNavigationItem(
                    icon = Icons.Default.AccountBalance,
                    title = "Starting Balances & Transfers",
                    subtitle = "Configure Cash & Online baselines and movements",
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
                    text = "AUTOMATION & PRIVACY",
                    style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 1.sp, fontWeight = FontWeight.SemiBold),
                    color = ArthTheme.colors.textSecondary
                )
            }

            item {
                ArthCard(onClick = onNavigateToSmsSettings) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
                            Icon(Icons.Default.Mail, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                            Spacer(Modifier.width(12.dp))
                            Column {
                                Text(
                                    text = "Import a bank message",
                                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold)
                                )
                                Spacer(Modifier.height(2.dp))
                                Text(
                                    text = when {
                                        else -> "Share a selected message from Messages for on-device review"
                                    },
                                    style = MaterialTheme.typography.bodySmall,
                                    color = when {
                                        else -> ArthTheme.colors.textSecondary
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
                    text = "SECURITY & SYNCHRONIZATION",
                    style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 1.sp, fontWeight = FontWeight.SemiBold),
                    color = ArthTheme.colors.textSecondary
                )
            }

            item {
                SettingsNavigationItem(
                    icon = Icons.Default.Security,
                    title = "Biometric App Lock",
                    subtitle = "Fingerprint unlock, timeout, and hardware status",
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
                                text = "Account Synchronization",
                                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold)
                            )
                            Spacer(Modifier.height(2.dp))
                            val isSyncing = syncState is SyncState.Syncing
                            val subtitleText = when {
                                isSyncing -> "Syncing transactions, balances & categories…"
                                pendingOutboxCount > 0 -> "$pendingOutboxCount local mutations pending upload"
                                else -> "All local transactions synchronized"
                            }
                            Text(
                                text = subtitleText,
                                style = MaterialTheme.typography.bodySmall,
                                color = if (isSyncing) MaterialTheme.colorScheme.primary else ArthTheme.colors.textSecondary
                            )
                        }

                        val isSyncing = syncState is SyncState.Syncing
                        ArthButton(
                            text = if (isSyncing) "Syncing…" else "Sync Now",
                            enabled = !isSyncing,
                            onClick = {
                                coroutineScope.launch {
                                    syncService.syncAll()
                                }
                            }
                        )
                    }
                }
            }

            // Sign out button matching PWA style
            item {
                Spacer(Modifier.height(12.dp))
                ArthOutlinedButton(
                    text = "Sign Out of SpendSense",
                    borderColor = ArthTheme.colors.border,
                    onClick = {
                        secureStorage.clearSession()
                        onSignOut()
                    },
                    modifier = Modifier.fillMaxWidth()
                )
            }
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
