package com.digitaldodo.arth.feature.security

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Fingerprint
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.digitaldodo.arth.core.designsystem.ArthButton
import com.digitaldodo.arth.core.designsystem.ArthTheme

@Composable
fun ArthLockScreen(
    errorMessage: String? = null,
    onUnlockClicked: () -> Unit,
    onSignOut: () -> Unit
) {
    // Automatically trigger biometric prompt once on initial entry
    LaunchedEffect(Unit) {
        onUnlockClicked()
    }

    Surface(
        modifier = Modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 24.dp)
                .padding(vertical = 40.dp),
            verticalArrangement = Arrangement.SpaceBetween,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Brand Header
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.padding(top = 24.dp)
            ) {
                Text(
                    text = "ARTH",
                    style = MaterialTheme.typography.titleMedium.copy(
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 4.sp
                    ),
                    color = ArthTheme.colors.textMuted
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    text = "Personal Financial Ledger",
                    style = MaterialTheme.typography.bodySmall,
                    color = ArthTheme.colors.textSecondary
                )
            }

            // Central Biometric Hero
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Box(
                    modifier = Modifier
                        .size(80.dp)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.surfaceVariant)
                        .border(1.dp, ArthTheme.colors.border, CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.Fingerprint,
                        contentDescription = "Fingerprint",
                        tint = ArthTheme.colors.blue,
                        modifier = Modifier.size(44.dp)
                    )
                }

                Text(
                    text = "Unlock Arth",
                    style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.Bold),
                    color = MaterialTheme.colorScheme.onBackground
                )

                Text(
                    text = "Authenticate to access your financial information.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = ArthTheme.colors.textSecondary,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(horizontal = 20.dp)
                )

                if (!errorMessage.isNullOrBlank()) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth(0.9f)
                            .clip(RoundedCornerShape(8.dp))
                            .background(ArthTheme.colors.amberContainer)
                            .border(1.dp, ArthTheme.colors.amber.copy(alpha = 0.3f), RoundedCornerShape(8.dp))
                            .padding(horizontal = 14.dp, vertical = 10.dp)
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Warning,
                                contentDescription = null,
                                tint = ArthTheme.colors.amber,
                                modifier = Modifier.size(16.dp)
                            )
                            Text(
                                text = errorMessage,
                                color = ArthTheme.colors.amber,
                                style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Medium)
                            )
                        }
                    }
                }

                Spacer(Modifier.height(8.dp))

                ArthButton(
                    text = "Unlock with Fingerprint",
                    icon = Icons.Default.Fingerprint,
                    onClick = onUnlockClicked,
                    modifier = Modifier.fillMaxWidth(0.85f)
                )

                Text(
                    text = "Device PIN, pattern, or password supported as fallback.",
                    style = MaterialTheme.typography.labelSmall,
                    color = ArthTheme.colors.textMuted,
                    textAlign = TextAlign.Center
                )
            }

            // Bottom Sign Out Option
            TextButton(
                onClick = onSignOut
            ) {
                Text(
                    text = "Sign Out from Arth",
                    color = ArthTheme.colors.textMuted,
                    style = MaterialTheme.typography.labelMedium
                )
            }
        }
    }
}
