package com.digitaldodo.arth.feature.balances

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.SyncAlt
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.digitaldodo.arth.core.designsystem.*
import com.digitaldodo.arth.core.model.Money
import java.text.SimpleDateFormat
import java.util.*

@Composable
fun BalancesScreen(
    viewModel: BalancesViewModel,
    onBack: () -> Unit
) {
    val state by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(MaterialTheme.colorScheme.background)
                    .padding(horizontal = 8.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = onBack) {
                    Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                }
                Spacer(Modifier.width(8.dp))
                Text(
                    text = "Account Balances",
                    style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
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
            verticalArrangement = Arrangement.spacedBy(16.dp),
            contentPadding = PaddingValues(top = 8.dp, bottom = 24.dp)
        ) {
            // Net Total Balance Card
            item {
                ArthCard {
                    Text(
                        text = "Total Balance",
                        style = MaterialTheme.typography.labelMedium,
                        color = ArthTheme.colors.textSecondary
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = state.currentBalances.formattedTotal,
                        style = MaterialTheme.typography.displayMedium.copy(fontWeight = FontWeight.Bold),
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Spacer(Modifier.height(16.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        ArthButton(
                            text = "Set Starting Balance",
                            onClick = { viewModel.showConfigureDialog(true) },
                            modifier = Modifier.weight(1f)
                        )
                        ArthOutlinedButton(
                            text = "Transfer",
                            icon = Icons.Default.SyncAlt,
                            onClick = { viewModel.showTransferDialog(true) },
                            modifier = Modifier.weight(1f)
                        )
                    }
                }
            }

            // Account Breakdown
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    ArthCard(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "Cash Balance",
                            style = MaterialTheme.typography.labelMedium,
                            color = ArthTheme.colors.textSecondary
                        )
                        Spacer(Modifier.height(4.dp))
                        Text(
                            text = state.currentBalances.formattedCash,
                            style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                            color = ArthTheme.colors.amber
                        )
                        Spacer(Modifier.height(8.dp))
                        Text(
                            text = "Starting: ${Money.formatPaise(state.startingBalances.cashPaise)}",
                            style = MaterialTheme.typography.labelSmall,
                            color = ArthTheme.colors.textMuted
                        )
                    }

                    ArthCard(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "Online Balance",
                            style = MaterialTheme.typography.labelMedium,
                            color = ArthTheme.colors.textSecondary
                        )
                        Spacer(Modifier.height(4.dp))
                        Text(
                            text = state.currentBalances.formattedOnline,
                            style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                            color = ArthTheme.colors.blue
                        )
                        Spacer(Modifier.height(8.dp))
                        Text(
                            text = "Starting: ${Money.formatPaise(state.startingBalances.onlinePaise)}",
                            style = MaterialTheme.typography.labelSmall,
                            color = ArthTheme.colors.textMuted
                        )
                    }
                }
            }

            // Information Explaining Invariant
            item {
                ArthCard(backgroundColor = MaterialTheme.colorScheme.surfaceVariant) {
                    Text(
                        text = "Deterministic Baseline Accounting",
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(Modifier.height(6.dp))
                    Text(
                        text = "When you set a starting balance, Arth records a baseline timestamp. Only transactions recorded after that timestamp adjust your current balance. Past transactions remain in your historical records without altering baseline figures.",
                        style = MaterialTheme.typography.bodySmall,
                        color = ArthTheme.colors.textSecondary
                    )
                    if (state.startingBalances.balancesConfiguredAt > 0L) {
                        Spacer(Modifier.height(8.dp))
                        val sdf = SimpleDateFormat("dd MMM yyyy, hh:mm a", Locale.getDefault())
                        Text(
                            text = "Last configured: ${sdf.format(Date(state.startingBalances.balancesConfiguredAt))}",
                            style = MaterialTheme.typography.labelSmall,
                            color = ArthTheme.colors.textMuted
                        )
                    }
                }
            }
        }

        if (state.showConfigureDialog) {
            ConfigureStartingBalancesDialog(
                currentCash = state.startingBalances.cashPaise,
                currentOnline = state.startingBalances.onlinePaise,
                onDismiss = { viewModel.showConfigureDialog(false) },
                onSave = { cash, online -> viewModel.setStartingBalances(cash, online) }
            )
        }

        if (state.showTransferDialog) {
            TransferDialog(
                onDismiss = { viewModel.showTransferDialog(false) },
                onTransfer = { amount, fromCash, notes -> viewModel.recordTransfer(amount, fromCash, notes) }
            )
        }
    }
}

@Composable
fun ConfigureStartingBalancesDialog(
    currentCash: Long,
    currentOnline: Long,
    onDismiss: () -> Unit,
    onSave: (Long, Long) -> Unit
) {
    var cashStr by remember { mutableStateOf(if (currentCash > 0) (currentCash / 100.0).toString() else "") }
    var onlineStr by remember { mutableStateOf(if (currentOnline > 0) (currentOnline / 100.0).toString() else "") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Configure Starting Balances") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(
                    value = cashStr,
                    onValueChange = { cashStr = it },
                    label = { Text("Cash Balance (₹)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = onlineStr,
                    onValueChange = { onlineStr = it },
                    label = { Text("Online / Bank Balance (₹)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        },
        confirmButton = {
            ArthButton(
                text = "Save Baseline",
                onClick = {
                    val cash = runCatching { Money.rupeesToPaise(cashStr) }.getOrDefault(0L)
                    val online = runCatching { Money.rupeesToPaise(onlineStr) }.getOrDefault(0L)
                    onSave(cash, online)
                }
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
fun TransferDialog(
    onDismiss: () -> Unit,
    onTransfer: (Long, Boolean, String?) -> Unit
) {
    var amountStr by remember { mutableStateOf("") }
    var fromCash by remember { mutableStateOf(false) } // false = Online -> Cash (ATM withdrawal)
    var notes by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Cash ↔ Online Transfer") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    SelectablePill(
                        text = "Bank ➔ Cash (ATM)",
                        selected = !fromCash,
                        modifier = Modifier.weight(1f),
                        onClick = { fromCash = false }
                    )
                    SelectablePill(
                        text = "Cash ➔ Bank (Deposit)",
                        selected = fromCash,
                        modifier = Modifier.weight(1f),
                        onClick = { fromCash = true }
                    )
                }

                OutlinedTextField(
                    value = amountStr,
                    onValueChange = { amountStr = it },
                    label = { Text("Transfer Amount (₹)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )

                OutlinedTextField(
                    value = notes,
                    onValueChange = { notes = it },
                    label = { Text("Notes (optional)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        },
        confirmButton = {
            ArthButton(
                text = "Execute Transfer",
                onClick = {
                    val amount = runCatching { Money.rupeesToPaise(amountStr) }.getOrDefault(0L)
                    if (amount > 0L) {
                        onTransfer(amount, fromCash, notes.takeIf { it.isNotBlank() })
                    }
                },
                enabled = amountStr.isNotBlank()
            )
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
            }
        }
    )
}
