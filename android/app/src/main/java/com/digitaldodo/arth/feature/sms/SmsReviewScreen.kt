package com.digitaldodo.arth.feature.sms

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.digitaldodo.arth.core.designsystem.*
import com.digitaldodo.arth.core.model.*
import java.text.SimpleDateFormat
import java.util.*

@Composable
fun SmsReviewScreen(
    viewModel: SmsViewModel,
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
                    text = "SMS Suggestions (${state.pendingSuggestions.size})",
                    style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                    color = MaterialTheme.colorScheme.onBackground
                )
            }
        }
    ) { padding ->
        if (state.pendingSuggestions.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(24.dp),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        text = "No pending SMS transactions",
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Spacer(Modifier.height(6.dp))
                    Text(
                        text = "When bank or UPI SMS notifications arrive, they will appear here for your review.",
                        style = MaterialTheme.typography.bodySmall,
                        color = ArthTheme.colors.textMuted
                    )
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
                contentPadding = PaddingValues(top = 8.dp, bottom = 24.dp)
            ) {
                items(state.pendingSuggestions, key = { it.id }) { item ->
                    SmsSuggestionCard(
                        suggestion = item,
                        categories = state.categories,
                        onConfirm = { catId, catName, necessity ->
                            viewModel.confirmSuggestion(item, catId, catName, necessity)
                        },
                        onDismiss = { viewModel.dismissSuggestion(item.id) }
                    )
                }
            }
        }
    }
}

@Composable
fun SmsSuggestionCard(
    suggestion: SmsSuggestion,
    categories: List<Category>,
    onConfirm: (String, String, NecessityTier?) -> Unit,
    onDismiss: () -> Unit
) {
    var selectedCat by remember {
        mutableStateOf(categories.firstOrNull { it.type == suggestion.type } ?: categories.firstOrNull())
    }
    var selectedNecessity by remember { mutableStateOf(NecessityTier.ESSENTIAL) }

    val sdf = SimpleDateFormat("dd MMM, hh:mm a", Locale.getDefault())
    val dateStr = sdf.format(Date(suggestion.smsTimestamp))

    ArthCard {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = suggestion.merchant ?: "Financial Notification",
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                    color = MaterialTheme.colorScheme.onSurface
                )
                Spacer(Modifier.height(2.dp))
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    TypeBadge(type = suggestion.type)
                    PaymentBadge(mode = suggestion.paymentMode)
                    Text(
                        text = dateStr,
                        style = MaterialTheme.typography.labelSmall,
                        color = ArthTheme.colors.textMuted
                    )
                }
            }

            AmountDisplay(
                amountFormatted = suggestion.formattedAmount,
                type = suggestion.type
            )
        }

        if (!suggestion.refNumber.isNullOrBlank()) {
            Spacer(Modifier.height(6.dp))
            Text(
                text = "Ref: ${suggestion.refNumber}",
                style = MaterialTheme.typography.labelSmall,
                color = ArthTheme.colors.textMuted
            )
        }

        Spacer(Modifier.height(12.dp))
        HorizontalDivider(color = ArthTheme.colors.border)
        Spacer(Modifier.height(10.dp))

        // Category & Necessity Selection
        Text(
            text = "Select Category:",
            style = MaterialTheme.typography.labelSmall,
            color = ArthTheme.colors.textSecondary
        )
        Spacer(Modifier.height(6.dp))

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            categories.filter { it.type == suggestion.type }.forEach { cat ->
                val label = if (!cat.icon.isNullOrBlank()) "${cat.icon} ${cat.name}" else cat.name
                SelectablePill(
                    text = label,
                    selected = selectedCat?.id == cat.id,
                    onClick = { selectedCat = cat }
                )
            }
        }

        if (suggestion.type == TransactionType.EXPENSE) {
            Spacer(Modifier.height(10.dp))
            Text(
                text = "Necessity Tier:",
                style = MaterialTheme.typography.labelSmall,
                color = ArthTheme.colors.textSecondary
            )
            Spacer(Modifier.height(6.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                SelectablePill(
                    text = "Essential",
                    selected = selectedNecessity == NecessityTier.ESSENTIAL,
                    modifier = Modifier.weight(1f),
                    onClick = { selectedNecessity = NecessityTier.ESSENTIAL }
                )
                SelectablePill(
                    text = "Optional",
                    selected = selectedNecessity == NecessityTier.OPTIONAL,
                    modifier = Modifier.weight(1f),
                    onClick = { selectedNecessity = NecessityTier.OPTIONAL }
                )
                SelectablePill(
                    text = "Luxury",
                    selected = selectedNecessity == NecessityTier.LUXURY,
                    modifier = Modifier.weight(1f),
                    onClick = { selectedNecessity = NecessityTier.LUXURY }
                )
            }
        }

        Spacer(Modifier.height(14.dp))

        // Confirm & Dismiss Action Buttons
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            ArthOutlinedButton(
                text = "Dismiss",
                icon = Icons.Default.Close,
                onClick = onDismiss,
                modifier = Modifier.weight(1f)
            )
            ArthButton(
                text = "Confirm & Add",
                icon = Icons.Default.Check,
                onClick = {
                    val cat = selectedCat ?: categories.firstOrNull() ?: Category(name = "General")
                    val necessityToSave = if (suggestion.type == TransactionType.EXPENSE) selectedNecessity else null
                    onConfirm(cat.id, cat.name, necessityToSave)
                },
                modifier = Modifier.weight(1f)
            )
        }
    }
}
