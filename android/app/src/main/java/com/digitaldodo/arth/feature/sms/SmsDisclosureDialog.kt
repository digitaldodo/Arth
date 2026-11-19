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
                text = "Automatically record your financial transactions",
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
                    text = "SpendSense can identify financial transactions from bank and UPI messages, helping you maintain a more complete financial ledger without manually entering every transaction.",
                    style = MaterialTheme.typography.bodyMedium
                )
                Text(
                    text = "• Which messages are processed: Only transaction alerts from supported Indian banks, UPI apps, and cards.",
                    style = MaterialTheme.typography.bodySmall,
                    color = ArthTheme.colors.textSecondary
                )
                Text(
                    text = "• Why they are processed: To extract transaction amounts, dates, merchants, and reference IDs for your review.",
                    style = MaterialTheme.typography.bodySmall,
                    color = ArthTheme.colors.textSecondary
                )
                Text(
                    text = "• What information is extracted: Amount in paise, debit/credit direction, counterparty, masked account (e.g. XX1234), and UTR reference.",
                    style = MaterialTheme.typography.bodySmall,
                    color = ArthTheme.colors.textSecondary
                )
                Text(
                    text = "• Unrelated messages excluded: Personal conversations, OTPs, 2FA security codes, and marketing promos are discarded immediately in memory.",
                    style = MaterialTheme.typography.bodySmall,
                    color = ArthTheme.colors.textSecondary
                )
                Text(
                    text = "• 100% On-Device: Raw SMS text never leaves your phone and is never uploaded to any server.",
                    style = MaterialTheme.typography.bodySmall,
                    color = ArthTheme.colors.textSecondary
                )
                Text(
                    text = "• Human-in-the-loop: Every detected transaction is presented as a pending suggestion. Only confirmed entries enter your ledger.",
                    style = MaterialTheme.typography.bodySmall,
                    color = ArthTheme.colors.textSecondary
                )
                Text(
                    text = "• Complete Control: You can pause tracking, disconnect, or delete local data at any time from Settings.",
                    style = MaterialTheme.typography.bodySmall,
                    color = ArthTheme.colors.textSecondary
                )
            }
        },
        confirmButton = {
            ArthButton(
                text = "Enable SMS Tracking",
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
