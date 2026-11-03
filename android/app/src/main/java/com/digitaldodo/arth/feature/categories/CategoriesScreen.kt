package com.digitaldodo.arth.feature.categories

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.digitaldodo.arth.core.designsystem.*
import com.digitaldodo.arth.core.model.TransactionType

@Composable
fun CategoriesScreen(
    viewModel: CategoriesViewModel
) {
    val state by viewModel.uiState.collectAsState()
    val filtered = state.categories.filter { it.type == state.selectedType }

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
                        text = "Categories",
                        style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.Bold),
                        color = MaterialTheme.colorScheme.onBackground
                    )
                    IconButton(onClick = { viewModel.showAddDialog(true) }) {
                        Icon(Icons.Default.Add, contentDescription = "Add Category")
                    }
                }

                Spacer(Modifier.height(12.dp))

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(40.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant)
                        .padding(3.dp),
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    TabButton(
                        text = "Expense Categories",
                        selected = state.selectedType == TransactionType.EXPENSE,
                        selectedBg = MaterialTheme.colorScheme.primary,
                        selectedFg = MaterialTheme.colorScheme.onPrimary,
                        modifier = Modifier.weight(1f),
                        onClick = { viewModel.setType(TransactionType.EXPENSE) }
                    )
                    TabButton(
                        text = "Income Categories",
                        selected = state.selectedType == TransactionType.INCOME,
                        selectedBg = MaterialTheme.colorScheme.primary,
                        selectedFg = MaterialTheme.colorScheme.onPrimary,
                        modifier = Modifier.weight(1f),
                        onClick = { viewModel.setType(TransactionType.INCOME) }
                    )
                }
            }
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
            contentPadding = PaddingValues(top = 8.dp, bottom = 24.dp)
        ) {
            items(filtered, key = { it.id }) { cat ->
                ArthCard {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            if (!cat.icon.isNullOrBlank()) {
                                Text(
                                    text = cat.icon,
                                    fontSize = 20.sp
                                )
                                Spacer(Modifier.width(10.dp))
                            }
                            Text(
                                text = cat.name,
                                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                                color = MaterialTheme.colorScheme.onSurface
                            )
                        }
                        if (!cat.isSystem) {
                            IconButton(onClick = { viewModel.deleteCategory(cat.id) }) {
                                Icon(
                                    Icons.Default.Delete,
                                    contentDescription = "Delete",
                                    tint = ArthTheme.colors.crimson
                                )
                            }
                        }
                    }
                }
            }
        }

        if (state.showAddDialog) {
            AddCategoryDialog(
                currentType = state.selectedType,
                onDismiss = { viewModel.showAddDialog(false) },
                onAdd = { name -> viewModel.addCategory(name, state.selectedType) }
            )
        }
    }
}

@Composable
fun AddCategoryDialog(
    currentType: TransactionType,
    onDismiss: () -> Unit,
    onAdd: (String) -> Unit
) {
    var name by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("New ${currentType.name.lowercase().replaceFirstChar { it.uppercase() }} Category") },
        text = {
            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                label = { Text("Category Name") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
        },
        confirmButton = {
            ArthButton(
                text = "Create",
                onClick = { onAdd(name) },
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
