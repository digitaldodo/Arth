package com.digitaldodo.arth.feature.ledger

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.digitaldodo.arth.core.designsystem.ArthTheme
import com.digitaldodo.arth.feature.dashboard.PeriodChip
import com.digitaldodo.arth.feature.dashboard.TransactionListItem

@Composable
fun LedgerScreen(
    viewModel: LedgerViewModel,
    onAddTransactionClick: () -> Unit
) {
    val state by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(MaterialTheme.colorScheme.background)
                    .padding(horizontal = 16.dp, vertical = 8.dp)
            ) {
                Text(
                    text = "Ledger",
                    style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.Bold),
                    color = MaterialTheme.colorScheme.onBackground
                )

                Spacer(Modifier.height(12.dp))

                // Search field
                OutlinedTextField(
                    value = state.searchQuery,
                    onValueChange = { viewModel.onSearchQueryChanged(it) },
                    placeholder = { Text("Search transactions, notes, merchants...") },
                    leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                    trailingIcon = {
                        if (state.searchQuery.isNotBlank()) {
                            IconButton(onClick = { viewModel.onSearchQueryChanged("") }) {
                                Icon(Icons.Default.Close, contentDescription = "Clear")
                            }
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )

                Spacer(Modifier.height(12.dp))

                // Filter row
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    PeriodChip("All", state.activeFilter == LedgerFilter.ALL) { viewModel.setFilter(LedgerFilter.ALL) }
                    PeriodChip("Expense", state.activeFilter == LedgerFilter.EXPENSE) { viewModel.setFilter(LedgerFilter.EXPENSE) }
                    PeriodChip("Income", state.activeFilter == LedgerFilter.INCOME) { viewModel.setFilter(LedgerFilter.INCOME) }
                    PeriodChip("Cash", state.activeFilter == LedgerFilter.CASH) { viewModel.setFilter(LedgerFilter.CASH) }
                    PeriodChip("Online", state.activeFilter == LedgerFilter.ONLINE) { viewModel.setFilter(LedgerFilter.ONLINE) }
                    PeriodChip("Essential", state.activeFilter == LedgerFilter.ESSENTIAL) { viewModel.setFilter(LedgerFilter.ESSENTIAL) }
                    PeriodChip("Optional", state.activeFilter == LedgerFilter.OPTIONAL) { viewModel.setFilter(LedgerFilter.OPTIONAL) }
                    PeriodChip("Luxury", state.activeFilter == LedgerFilter.LUXURY) { viewModel.setFilter(LedgerFilter.LUXURY) }
                }
            }
        }
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            if (state.filteredTransactions.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(24.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = if (state.searchQuery.isNotBlank()) "No transactions matching '${state.searchQuery}'"
                               else "No transactions found in this filter.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = ArthTheme.colors.textMuted
                    )
                }
            } else {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(horizontal = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                    contentPadding = PaddingValues(top = 8.dp, bottom = 24.dp)
                ) {
                    items(state.filteredTransactions, key = { it.id }) { tx ->
                        TransactionListItem(
                            transaction = tx,
                            onClick = { viewModel.selectTransaction(tx) }
                        )
                    }
                }
            }

            // Transaction Detail Bottom Sheet
            state.selectedTransaction?.let { tx ->
                TransactionDetailSheet(
                    transaction = tx,
                    onDismiss = { viewModel.selectTransaction(null) },
                    onDelete = { viewModel.deleteTransaction(it) }
                )
            }
        }
    }
}
