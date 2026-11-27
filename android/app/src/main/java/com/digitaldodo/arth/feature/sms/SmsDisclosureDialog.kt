package com.digitaldodo.arth.feature.sms

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.NotificationsActive
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
                modifier = Modifier.size(30.dp)
            )
        },
        title = {
            Text(
                text = "Automatically capture your bank SMS?",
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
                    text = "SpendSense can identify eligible financial transaction SMS alerts from your banks and payment providers and queue them for your review.",
                    style = MaterialTheme.typography.bodyMedium
                )
                DisclosureBullet("Messages accessed: Only financial transaction alerts. Personal chats, OTPs, 2FA security codes, login alerts, and promotions are discarded immediately in memory.")
                DisclosureBullet("Why permission is required: Android requires READ_SMS and RECEIVE_SMS to inspect incoming alerts and scan recent history when permitted.")
                DisclosureBullet("Local storage & sync: Raw SMS text is never saved or sent to servers. Only extracted amount, merchant, direction, and reference enter your local review queue.")
                DisclosureBullet("Duplicate prevention: UTR references, timestamps, and amount matching reconcile SMS and notification captures cleanly.")
                DisclosureBullet("Always your choice: Nothing is confirmed silently without review unless you explicitly opt in, and you can revoke access anytime in Settings.")
            }
        },
        confirmButton = {
            ArthButton(
                text = "Continue to SMS Permission",
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

@Composable
fun NotificationCaptureDisclosureDialog(
    onDismiss: () -> Unit,
    onContinueToSettings: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        icon = {
            Icon(
                Icons.Default.NotificationsActive,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(30.dp)
            )
        },
        title = {
            Text(
                text = "Allow Notification Access for Capture?",
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
                    text = "SpendSense can read eligible payment and bank notifications on this device to help keep your ledger up to date without requesting SMS inbox permissions.",
                    style = MaterialTheme.typography.bodyMedium
                )
                DisclosureBullet("OS-level access scope: Android grants Notification Access system-wide rather than per app. SpendSense immediately ignores and drops notifications from all apps outside your chosen financial & Messages allowlist before parsing.")
                DisclosureBullet("Local-only processing: Parsing runs strictly on this device in memory. Raw notification text is discarded immediately, OTPs and redacted alerts are rejected, and nothing is uploaded without your review.")
                DisclosureBullet("Stored locally: Only normalized candidate fields (amount, direction, merchant, masked ref/account) enter your local review queue. Confirmed items sync to your account.")
                DisclosureBullet("Android 13+ note: If Android marks Notification Access as restricted for browser-installed apps, open App Info → ⋮ → Allow restricted settings, then enable SpendSense.")
                DisclosureBullet("Full control: You can toggle individual payment apps, pause capture, or revoke Notification Access anytime in Android Settings.")
            }
        },
        confirmButton = {
            ArthButton(
                text = "Open Notification Access",
                onClick = onContinueToSettings
            )
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
            }
        }
    )
}

@Composable
private fun DisclosureBullet(text: String) {
    Text(
        text = "• $text",
        style = MaterialTheme.typography.bodySmall,
        color = ArthTheme.colors.textSecondary
    )
}
