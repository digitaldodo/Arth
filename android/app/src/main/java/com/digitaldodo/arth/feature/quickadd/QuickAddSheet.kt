package com.digitaldodo.arth.feature.quickadd

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Backspace
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.digitaldodo.arth.core.designsystem.*
import com.digitaldodo.arth.core.model.NecessityTier
import com.digitaldodo.arth.core.model.PaymentMode
import com.digitaldodo.arth.core.model.TransactionType

@Composable
fun QuickAddSheet(
    viewModel: QuickAddViewModel,
    onDismiss: () -> Unit
) {
    val state by viewModel.uiState.collectAsState()

    Surface(
        modifier = Modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 20.dp, vertical = 16.dp)
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Header with close button
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "New Transaction",
                    style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                    color = MaterialTheme.colorScheme.onBackground
                )
                IconButton(onClick = onDismiss) {
                    Icon(Icons.Default.Close, contentDescription = "Close")
                }
            }

            Spacer(Modifier.height(12.dp))

            // Income / Expense selector
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(42.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant)
                    .padding(3.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                TabButton(
                    text = "Expense",
                    selected = state.type == TransactionType.EXPENSE,
                    selectedBg = ArthTheme.colors.crimson,
                    selectedFg = MaterialTheme.colorScheme.onError,
                    modifier = Modifier.weight(1f),
                    onClick = { viewModel.setType(TransactionType.EXPENSE) }
                )
                TabButton(
                    text = "Income",
                    selected = state.type == TransactionType.INCOME,
                    selectedBg = ArthTheme.colors.emerald,
                    selectedFg = MaterialTheme.colorScheme.onError,
                    modifier = Modifier.weight(1f),
                    onClick = { viewModel.setType(TransactionType.INCOME) }
                )
            }

            Spacer(Modifier.height(16.dp))

            // Large Amount Display
            Text(
                text = state.formattedAmount,
                style = MaterialTheme.typography.displayLarge.copy(
                    fontWeight = FontWeight.Bold,
                    fontSize = 42.sp
                ),
                color = if (state.type == TransactionType.EXPENSE) ArthTheme.colors.crimson else ArthTheme.colors.emerald
            )

            if (state.errorMessage != null) {
                Spacer(Modifier.height(4.dp))
                Text(
                    text = state.errorMessage ?: "",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error
                )
            }

            Spacer(Modifier.height(14.dp))

            // Payment Mode (Cash vs Online)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                SelectablePill(
                    text = "Online Account",
                    selected = state.paymentMode == PaymentMode.ONLINE,
                    modifier = Modifier.weight(1f),
                    onClick = { viewModel.setPaymentMode(PaymentMode.ONLINE) }
                )
                SelectablePill(
                    text = "Cash in Hand",
                    selected = state.paymentMode == PaymentMode.CASH,
                    modifier = Modifier.weight(1f),
                    onClick = { viewModel.setPaymentMode(PaymentMode.CASH) }
                )
            }

            if (state.type == TransactionType.EXPENSE) {
                Spacer(Modifier.height(10.dp))
                // Necessity selector (Needs / Wants / Savings)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    SelectablePill(
                        text = "Needs (50%)",
                        selected = state.necessity == NecessityTier.NEEDS,
                        modifier = Modifier.weight(1f),
                        onClick = { viewModel.setNecessity(NecessityTier.NEEDS) }
                    )
                    SelectablePill(
                        text = "Wants (30%)",
                        selected = state.necessity == NecessityTier.WANTS,
                        modifier = Modifier.weight(1f),
                        onClick = { viewModel.setNecessity(NecessityTier.WANTS) }
                    )
                    SelectablePill(
                        text = "Savings (20%)",
                        selected = state.necessity == NecessityTier.SAVINGS,
                        modifier = Modifier.weight(1f),
                        onClick = { viewModel.setNecessity(NecessityTier.SAVINGS) }
                    )
                }
            }

            Spacer(Modifier.height(14.dp))

            // Category horizontal list
            Text(
                text = "Select Category",
                style = MaterialTheme.typography.labelMedium,
                color = ArthTheme.colors.textSecondary,
                modifier = Modifier.align(Alignment.Start)
            )
            Spacer(Modifier.height(6.dp))

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                state.categories.forEach { cat ->
                    val isSelected = state.selectedCategory?.id == cat.id
                    val bg = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface
                    val fg = if (isSelected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface

                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .border(1.dp, if (isSelected) MaterialTheme.colorScheme.primary else ArthTheme.colors.border, RoundedCornerShape(8.dp))
                            .background(bg)
                            .clickable { viewModel.selectCategory(cat) }
                            .padding(horizontal = 12.dp, vertical = 8.dp)
                    ) {
                        Text(
                            text = cat.name,
                            style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Medium),
                            color = fg
                        )
                    }
                }
            }

            Spacer(Modifier.height(14.dp))

            // Counterparty / Merchant field
            OutlinedTextField(
                value = state.counterparty,
                onValueChange = { viewModel.onCounterpartyChanged(it) },
                label = { Text("Merchant or Counterparty (optional)") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )

            Spacer(Modifier.height(8.dp))

            // Notes field
            OutlinedTextField(
                value = state.notes,
                onValueChange = { viewModel.onNotesChanged(it) },
                label = { Text("Notes (optional)") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )

            Spacer(Modifier.height(18.dp))

            // Tactile Numeric Keypad
            NumericKeypad(
                onDigit = { viewModel.onDigitPressed(it) },
                onBackspace = { viewModel.onBackspacePressed() },
                onClear = { viewModel.onClearPressed() }
            )

            Spacer(Modifier.height(16.dp))

            // Save button
            ArthButton(
                text = "Record Transaction",
                onClick = { viewModel.save(onSuccess = onDismiss) },
                icon = Icons.Default.Check,
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(Modifier.height(16.dp))
        }
    }
}



@Composable
fun NumericKeypad(
    onDigit: (Int) -> Unit,
    onBackspace: () -> Unit,
    onClear: () -> Unit
) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        KeypadRow {
            KeypadButton("1") { onDigit(1) }
            KeypadButton("2") { onDigit(2) }
            KeypadButton("3") { onDigit(3) }
        }
        KeypadRow {
            KeypadButton("4") { onDigit(4) }
            KeypadButton("5") { onDigit(5) }
            KeypadButton("6") { onDigit(6) }
        }
        KeypadRow {
            KeypadButton("7") { onDigit(7) }
            KeypadButton("8") { onDigit(8) }
            KeypadButton("9") { onDigit(9) }
        }
        KeypadRow {
            KeypadButton("C") { onClear() }
            KeypadButton("0") { onDigit(0) }
            Box(
                modifier = Modifier
                    .weight(1f)
                    .height(52.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant)
                    .clickable { onBackspace() },
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Default.Backspace, contentDescription = "Backspace")
            }
        }
    }
}

@Composable
private fun KeypadRow(content: @Composable RowScope.() -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        content = content
    )
}

@Composable
private fun RowScope.KeypadButton(text: String, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .weight(1f)
            .height(52.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .clickable { onClick() },
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}
