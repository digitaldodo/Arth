package com.digitaldodo.arth.feature.sms

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Security
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.digitaldodo.arth.core.designsystem.ArthButton
import com.digitaldodo.arth.core.designsystem.ArthTheme

@Composable
fun SmsDisclosureDialog(
    onDismiss: () -> Unit,
    onAccept: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        icon = {
            Icon(
                Icons.Default.Security,
                contentDescription = null,
                tint = ArthTheme.colors.blue,
                modifier = Modifier.size(32.dp)
            )
        },
        title = {
            Text(
                text = "Automatically detect your bank transactions",
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold)
            )
        },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Text(
                    text = "SpendSense can identify eligible financial transaction messages from your banks and payment providers and prepare them for your personal ledger.",
                    style = MaterialTheme.typography.bodyMedium
                )
                Text(
                    text = "• Messages processed: Only eligible transaction alerts from supported Indian banks, credit cards, and UPI providers. Personal conversations, OTPs, 2FA security codes, and promotional messages are discarded immediately in memory.",
                    style = MaterialTheme.typography.bodySmall,
                    color = ArthTheme.colors.textSecondary
                )
                Text(
                    text = "• Why permissions are needed: Android requires SMS permissions (READ_SMS and RECEIVE_SMS) to inspect incoming bank alerts and provide on-demand historical scans.",
                    style = MaterialTheme.typography.bodySmall,
                    color = ArthTheme.colors.textSecondary
                )
                Text(
                    text = "• How transactions are categorized: Transactions are automatically matched to categories (e.g. Groceries, Utilities, Dining) using on-device pattern recognition.",
                    style = MaterialTheme.typography.bodySmall,
                    color = ArthTheme.colors.textSecondary
                )
                Text(
                    text = "• How duplicate detection works: UTR references, masked account identifiers, timestamps, and exact paise amounts prevent duplicate entries in your ledger.",
                    style = MaterialTheme.typography.bodySmall,
                    color = ArthTheme.colors.textSecondary
                )
                Text(
                    text = "• Complete user control: You can pause, disable, or re-enable detection at any time in Settings → Automatic Transaction Detection without affecting your saved ledger.",
                    style = MaterialTheme.typography.bodySmall,
                    color = ArthTheme.colors.textSecondary
                )
                Text(
                    text = "• Financial protection & privacy: 100% on-device processing. Raw SMS text never leaves your device and is never uploaded to any server. Every candidate requires your confirmation.",
                    style = MaterialTheme.typography.bodySmall,
                    color = ArthTheme.colors.textSecondary
                )
            }
        },
        confirmButton = {
            ArthButton(
                text = "Enable Automatic Detection",
                onClick = onAccept
            )
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Not Now")
            }
        }
    )
}
