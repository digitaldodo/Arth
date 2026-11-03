package com.digitaldodo.arth.feature.ledger

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.digitaldodo.arth.core.designsystem.*
import com.digitaldodo.arth.core.model.Transaction
import com.digitaldodo.arth.core.model.TransactionType
import java.text.SimpleDateFormat
import java.util.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TransactionDetailSheet(
    transaction: Transaction,
    onDismiss: () -> Unit,
    onDelete: (String) -> Unit
) {
    val sdf = SimpleDateFormat("EEEE, dd MMMM yyyy 'at' hh:mm a", Locale.getDefault())
    val dateFormatted = sdf.format(Date(transaction.transactionDate))

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = MaterialTheme.colorScheme.surface
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp)
                .padding(bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Transaction Details",
                    style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                    color = MaterialTheme.colorScheme.onSurface
                )
                TypeBadge(type = transaction.type)
            }

            Divider(color = ArthTheme.colors.border)

            AmountDisplay(
                amountFormatted = transaction.formattedAmount,
                type = transaction.type,
                large = true
            )

            DetailRow(title = "Counterparty", value = transaction.counterparty ?: "—")
            DetailRow(title = "Category", value = transaction.categoryName)
            DetailRow(title = "Payment Mode", value = transaction.paymentMode.name)
            if (transaction.type == TransactionType.EXPENSE) {
                DetailRow(title = "Necessity", value = transaction.necessity.name)
            }
            DetailRow(title = "Date & Time", value = dateFormatted)
            if (!transaction.notes.isNullOrBlank()) {
                DetailRow(title = "Notes", value = transaction.notes)
            }
            DetailRow(title = "Sync Status", value = transaction.syncStatus.name)

            Spacer(Modifier.height(16.dp))

            ArthButton(
                text = "Delete Transaction",
                onClick = { onDelete(transaction.id) },
                icon = Icons.Default.Delete,
                backgroundColor = ArthTheme.colors.crimson,
                contentColor = MaterialTheme.colorScheme.onError,
                modifier = Modifier.fillMaxWidth()
            )
        }
    }
}

@Composable
private fun DetailRow(title: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.bodyMedium,
            color = ArthTheme.colors.textSecondary
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium),
            color = MaterialTheme.colorScheme.onSurface
        )
    }
}
