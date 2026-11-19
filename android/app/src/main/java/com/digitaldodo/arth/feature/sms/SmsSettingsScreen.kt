package com.digitaldodo.arth.feature.sms

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
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SmsSettingsScreen(
    viewModel: SmsViewModel,
    onNavigateToReview: () -> Unit,
    onBack: () -> Unit
) {
    val state by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Import a bank message") },
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
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                    Column(Modifier.padding(18.dp)) {
                        Row {
                            Icon(Icons.Default.Share, contentDescription = null)
                            Spacer(Modifier.width(10.dp))
                            Text("Private, user-selected import", fontWeight = FontWeight.SemiBold)
                        }
                        Spacer(Modifier.height(10.dp))
                        Text(
                            "Open your Messages app, select a bank or UPI transaction message, choose Share, then select SpendSense. The message is parsed on this device. Only a recognized transaction candidate is kept, and you review it before it enters your ledger.",
                            style = MaterialTheme.typography.bodyMedium
                        )
                        Spacer(Modifier.height(10.dp))
                        Text(
                            "SpendSense does not read your inbox or listen for incoming SMS in this direct-download app. Android restricts those permissions for ordinary sideload installs. No SMS permission is requested.",
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
}
