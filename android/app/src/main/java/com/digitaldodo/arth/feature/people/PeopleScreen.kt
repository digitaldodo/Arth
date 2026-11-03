package com.digitaldodo.arth.feature.people

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.digitaldodo.arth.core.designsystem.*
import com.digitaldodo.arth.core.model.Money
import com.digitaldodo.arth.core.model.Person

@Composable
fun PeopleScreen(
    viewModel: PeopleViewModel,
    onPersonClick: (Person) -> Unit
) {
    val state by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(MaterialTheme.colorScheme.background)
                    .padding(horizontal = 20.dp, vertical = 12.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "People",
                        style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.Bold),
                        color = MaterialTheme.colorScheme.onBackground
                    )
                    IconButton(onClick = { viewModel.showAddPersonDialog(true) }) {
                        Icon(Icons.Default.Add, contentDescription = "Add Person")
                    }
                }
            }
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
            contentPadding = PaddingValues(top = 8.dp, bottom = 24.dp)
        ) {
            // Summary Banner
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    ArthCard(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "Money Given (To Receive)",
                            style = MaterialTheme.typography.labelMedium,
                            color = ArthTheme.colors.textSecondary
                        )
                        Spacer(Modifier.height(4.dp))
                        Text(
                            text = Money.formatPaise(state.totalOwedToUserPaise),
                            style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                            color = ArthTheme.colors.emerald
                        )
                    }

                    ArthCard(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "Money Received (To Return)",
                            style = MaterialTheme.typography.labelMedium,
                            color = ArthTheme.colors.textSecondary
                        )
                        Spacer(Modifier.height(4.dp))
                        Text(
                            text = Money.formatPaise(state.totalUserOwesPaise),
                            style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                            color = ArthTheme.colors.crimson
                        )
                    }
                }
            }

            if (state.people.isEmpty()) {
                item {
                    ArthCard {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 24.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = "No people added yet. Tap + to add contacts.",
                                style = MaterialTheme.typography.bodyMedium,
                                color = ArthTheme.colors.textMuted
                            )
                        }
                    }
                }
            } else {
                items(state.people, key = { it.id }) { person ->
                    ArthCard(onClick = { onPersonClick(person) }) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = person.name,
                                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                                if (!person.phone.isNullOrBlank()) {
                                    Spacer(Modifier.height(2.dp))
                                    Text(
                                        text = person.phone ?: "",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = ArthTheme.colors.textSecondary
                                    )
                                }
                            }

                            val (statusText, color) = when {
                                person.totalBalancePaise > 0 -> "Owes you ${person.formattedBalance}" to ArthTheme.colors.emerald
                                person.totalBalancePaise < 0 -> "You owe ${person.formattedBalance}" to ArthTheme.colors.crimson
                                else -> "Settled" to ArthTheme.colors.textMuted
                            }

                            Text(
                                text = statusText,
                                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                                color = color
                            )
                        }
                    }
                }
            }
        }

        if (state.showAddPersonDialog) {
            AddPersonDialog(
                onDismiss = { viewModel.showAddPersonDialog(false) },
                onAdd = { name, phone, notes -> viewModel.addPerson(name, phone, notes) }
            )
        }
    }
}

@Composable
fun AddPersonDialog(
    onDismiss: () -> Unit,
    onAdd: (String, String?, String?) -> Unit
) {
    var name by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var notes by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add Person") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Name") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = phone,
                    onValueChange = { phone = it },
                    label = { Text("Phone Number (optional)") },
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
                text = "Add",
                onClick = { onAdd(name, phone.takeIf { it.isNotBlank() }, notes.takeIf { it.isNotBlank() }) },
                enabled = name.isNotBlank()
            )
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
            }
        }
    )
}
