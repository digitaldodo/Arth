package com.digitaldodo.arth.feature.people

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.digitaldodo.arth.core.designsystem.*
import com.digitaldodo.arth.core.model.Money
import com.digitaldodo.arth.core.model.PaymentMode
import com.digitaldodo.arth.core.model.Person
import com.digitaldodo.arth.core.model.PersonTransactionType
import java.text.SimpleDateFormat
import java.util.*

@Composable
fun PersonDetailScreen(
    person: Person,
    viewModel: PeopleViewModel,
    onBack: () -> Unit
) {
    val state by viewModel.uiState.collectAsState()
    var showRecordDebt by remember { mutableStateOf(false) }

    LaunchedEffect(person.id) {
        viewModel.selectPerson(person)
    }

    val currentPerson = state.selectedPerson ?: person

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
                    text = currentPerson.name,
                    style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                    color = MaterialTheme.colorScheme.onBackground
                )
            }
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Balance Card
            ArthCard {
                Text(
                    text = "Current Balance",
                    style = MaterialTheme.typography.labelMedium,
                    color = ArthTheme.colors.textSecondary
                )
                Spacer(Modifier.height(4.dp))
                val (balText, balColor) = when {
                    currentPerson.totalBalancePaise > 0 -> "Owes you ${currentPerson.formattedBalance}" to ArthTheme.colors.emerald
                    currentPerson.totalBalancePaise < 0 -> "You owe ${currentPerson.formattedBalance}" to ArthTheme.colors.crimson
                    else -> "Settled Up (₹0.00)" to ArthTheme.colors.textMuted
                }
                Text(
                    text = balText,
                    style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.Bold),
                    color = balColor
                )

                Spacer(Modifier.height(16.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    ArthButton(
                        text = "Record Loan / Borrow",
                        onClick = { showRecordDebt = true },
                        modifier = Modifier.weight(1f)
                    )
                    if (currentPerson.totalBalancePaise != 0L) {
                        ArthOutlinedButton(
                            text = "Settle Up",
                            onClick = { viewModel.settlePerson(currentPerson.id, PaymentMode.ONLINE) },
                            modifier = Modifier.weight(1f)
                        )
                    }
                }
            }

            Text(
                text = "Transaction History",
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                color = MaterialTheme.colorScheme.onBackground
            )

            if (state.selectedPersonTransactions.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 32.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "No recorded transactions for ${currentPerson.name}.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = ArthTheme.colors.textMuted
                    )
                }
            } else {
                val sdf = SimpleDateFormat("dd MMM yyyy, hh:mm a", Locale.getDefault())
                LazyColumn(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(state.selectedPersonTransactions, key = { it.id }) { item ->
                        ArthCard {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column {
                                    Text(
                                        text = when (item.type) {
                                            PersonTransactionType.LENT -> "You lent"
                                            PersonTransactionType.BORROWED -> "You borrowed"
                                            PersonTransactionType.SETTLEMENT -> "Settlement"
                                        },
                                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                                        color = MaterialTheme.colorScheme.onSurface
                                    )
                                    Spacer(Modifier.height(2.dp))
                                    Text(
                                        text = sdf.format(Date(item.transactionDate)),
                                        style = MaterialTheme.typography.labelSmall,
                                        color = ArthTheme.colors.textMuted
                                    )
                                    if (!item.notes.isNullOrBlank()) {
                                        Spacer(Modifier.height(2.dp))
                                        Text(
                                            text = item.notes ?: "",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = ArthTheme.colors.textSecondary
                                        )
                                    }
                                }

                                Text(
                                    text = Money.formatPaise(item.amountPaise),
                                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                                    color = when (item.type) {
                                        PersonTransactionType.LENT -> ArthTheme.colors.emerald
                                        PersonTransactionType.BORROWED -> ArthTheme.colors.crimson
                                        PersonTransactionType.SETTLEMENT -> ArthTheme.colors.blue
                                    }
                                )
                            }
                        }
                    }
                }
            }
        }

        if (showRecordDebt) {
            RecordDebtDialog(
                personName = currentPerson.name,
                onDismiss = { showRecordDebt = false },
                onRecord = { amountPaise, type, mode, notes ->
                    viewModel.recordDebtTransaction(currentPerson.id, amountPaise, type, mode, notes)
                    showRecordDebt = false
                }
            )
        }
    }
}

@Composable
fun RecordDebtDialog(
    personName: String,
    onDismiss: () -> Unit,
    onRecord: (Long, PersonTransactionType, PaymentMode, String?) -> Unit
) {
    var amountString by remember { mutableStateOf("") }
    var type by remember { mutableStateOf(PersonTransactionType.LENT) }
    var mode by remember { mutableStateOf(PaymentMode.ONLINE) }
    var notes by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Record for $personName") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    SelectablePill(
                        text = "You Lent",
                        selected = type == PersonTransactionType.LENT,
                        modifier = Modifier.weight(1f),
                        onClick = { type = PersonTransactionType.LENT }
                    )
                    SelectablePill(
                        text = "You Borrowed",
                        selected = type == PersonTransactionType.BORROWED,
                        modifier = Modifier.weight(1f),
                        onClick = { type = PersonTransactionType.BORROWED }
                    )
                }

                OutlinedTextField(
                    value = amountString,
                    onValueChange = { amountString = it },
                    label = { Text("Amount (₹)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    SelectablePill(
                        text = "Online",
                        selected = mode == PaymentMode.ONLINE,
                        modifier = Modifier.weight(1f),
                        onClick = { mode = PaymentMode.ONLINE }
                    )
                    SelectablePill(
                        text = "Cash",
                        selected = mode == PaymentMode.CASH,
                        modifier = Modifier.weight(1f),
                        onClick = { mode = PaymentMode.CASH }
                    )
                }

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
                text = "Save",
                onClick = {
                    val paise = runCatching { Money.rupeesToPaise(amountString) }.getOrDefault(0L)
                    if (paise > 0L) {
                        onRecord(paise, type, mode, notes.takeIf { it.isNotBlank() })
                    }
                },
                enabled = amountString.isNotBlank()
            )
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
            }
        }
    )
}
