package com.digitaldodo.arth.feature.sms

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Security
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
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
                text = "Financial SMS Detection",
                style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold)
            )
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(
                    text = "Arth uses SMS permissions strictly to detect banking, card, and UPI transaction notifications on your device.",
                    style = MaterialTheme.typography.bodyMedium
                )
                Text(
                    text = "• 100% On-Device: No raw SMS bodies, personal messages, or OTPs are ever transmitted to any server.",
                    style = MaterialTheme.typography.bodySmall,
                    color = ArthTheme.colors.textSecondary
                )
                Text(
                    text = "• Manual Review: Detected messages are presented as suggestions. You review, assign categories, and confirm each entry before it is added.",
                    style = MaterialTheme.typography.bodySmall,
                    color = ArthTheme.colors.textSecondary
                )
                Text(
                    text = "• Privacy Guaranteed: OTPs and promotional messages are discarded immediately.",
                    style = MaterialTheme.typography.bodySmall,
                    color = ArthTheme.colors.textSecondary
                )
            }
        },
        confirmButton = {
            ArthButton(
                text = "Agree & Continue",
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
