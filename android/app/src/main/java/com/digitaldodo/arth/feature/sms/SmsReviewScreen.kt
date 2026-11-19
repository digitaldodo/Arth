package com.digitaldodo.arth.feature.sms

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.digitaldodo.arth.core.designsystem.*
import com.digitaldodo.arth.core.model.*
import java.text.SimpleDateFormat
import java.util.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SmsReviewScreen(
    viewModel: SmsViewModel,
    onBack: () -> Unit
) {
    val state by viewModel.uiState.collectAsState()
    var candidateToEdit by remember { mutableStateOf<SmsSuggestion?>(null) }

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
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                }
                Spacer(Modifier.width(8.dp))
                Column {
                    Text(
                        text = "SMS Suggestions (${state.pendingSuggestions.size})",
                        style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                        color = MaterialTheme.colorScheme.onBackground
                    )
                    Text(
                        text = "Review, categorize and confirm transactions",
                        style = MaterialTheme.typography.labelSmall,
                        color = ArthTheme.colors.textMuted
                    )
                }
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
                    Icon(
                        imageVector = Icons.Default.CheckCircleOutline,
                        contentDescription = null,
                        tint = ArthTheme.colors.emerald,
                        modifier = Modifier.size(48.dp)
                    )
                    Spacer(Modifier.height(12.dp))
                    Text(
                        text = "No pending SMS transactions",
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Spacer(Modifier.height(6.dp))
                    Text(
                        text = "All detected financial notifications have been reviewed or dismissed.",
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
                        onEdit = {
                            candidateToEdit = item
                        },
                        onDismiss = { viewModel.dismissSuggestion(item.id) },
                        onMarkDuplicate = { viewModel.markAsDuplicate(item.id) }
                    )
                }
            }
        }

        // Edit Bottom Sheet
        candidateToEdit?.let { candidate ->
            EditSmsCandidateSheet(
                suggestion = candidate,
                categories = state.categories,
                onDismiss = { candidateToEdit = null },
                onSave = { updatedAmountPaise, updatedDate, updatedMerchant, updatedMode, updatedCatId, updatedCatName, updatedNecessity, updatedNotes ->
                    viewModel.confirmSuggestion(
                        suggestion = candidate,
                        categoryId = updatedCatId,
                        categoryName = updatedCatName,
                        necessity = updatedNecessity,
                        customAmountPaise = updatedAmountPaise,
                        customDate = updatedDate,
                        customMerchant = updatedMerchant,
                        customPaymentMode = updatedMode,
                        customNotes = updatedNotes
                    )
                    candidateToEdit = null
                }
            )
        }
    }
}

@Composable
fun SmsSuggestionCard(
    suggestion: SmsSuggestion,
    categories: List<Category>,
    onConfirm: (String, String, NecessityTier?) -> Unit,
    onEdit: () -> Unit,
    onDismiss: () -> Unit,
    onMarkDuplicate: () -> Unit
) {
    var selectedCat by remember {
        mutableStateOf(categories.firstOrNull { it.type == suggestion.type } ?: categories.firstOrNull())
    }
    var selectedNecessity by remember { mutableStateOf(NecessityTier.ESSENTIAL) }

    val sdf = SimpleDateFormat("dd MMM, hh:mm a", Locale.getDefault())
    val dateStr = sdf.format(Date(suggestion.smsTimestamp))

    val isPotentialDuplicate = suggestion.duplicateStatus == DuplicateStatus.POTENTIAL_DUPLICATE.name

    ArthCard {
        // Potential Duplicate Alert
        if (isPotentialDuplicate) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(ArthTheme.colors.amber.copy(alpha = 0.12f), RoundedCornerShape(6.dp))
                    .padding(horizontal = 10.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = Icons.Default.WarningAmber,
                    contentDescription = null,
                    tint = ArthTheme.colors.amber,
                    modifier = Modifier.size(16.dp)
                )
                Spacer(Modifier.width(6.dp))
                Text(
                    text = "Possible duplicate of an existing ledger transaction",
                    style = MaterialTheme.typography.labelSmall,
                    color = ArthTheme.colors.amber
                )
            }
            Spacer(Modifier.height(8.dp))
        }

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

        // Details metadata row
        Spacer(Modifier.height(8.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            if (!suggestion.bank.isNullOrBlank()) {
                Text(
                    text = suggestion.bank ?: "",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.primary
                )
            }
            if (!suggestion.accountMask.isNullOrBlank()) {
                Text(
                    text = "A/c: ${suggestion.accountMask}",
                    style = MaterialTheme.typography.labelSmall,
                    color = ArthTheme.colors.textSecondary
                )
            }
            if (!suggestion.refNumber.isNullOrBlank()) {
                Text(
                    text = "Ref: ${suggestion.refNumber}",
                    style = MaterialTheme.typography.labelSmall,
                    color = ArthTheme.colors.textMuted
                )
            }
        }

        if (suggestion.balancePaise != null) {
            Spacer(Modifier.height(4.dp))
            Text(
                text = "Avl Bal: ${suggestion.formattedBalance}",
                style = MaterialTheme.typography.labelSmall,
                color = ArthTheme.colors.textMuted
            )
        }

        if (suggestion.sender == "User-shared message") {
            Text(
                text = "Confirm the transaction date from the shared message before adding it to your ledger.",
                style = MaterialTheme.typography.bodySmall,
                color = ArthTheme.colors.amber
            )
        }

        Spacer(Modifier.height(10.dp))
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

        // Actions: Confirm & Add, Edit, Dismiss
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            ArthOutlinedButton(
                text = "Dismiss",
                icon = Icons.Default.Close,
                onClick = onDismiss,
                modifier = Modifier.weight(1f)
            )

            ArthOutlinedButton(
                text = "Edit",
                icon = Icons.Default.Edit,
                onClick = onEdit,
                modifier = Modifier.weight(1f)
            )

            ArthButton(
                text = if (suggestion.sender == "User-shared message") "Set date to confirm" else "Confirm",
                icon = if (suggestion.sender == "User-shared message") Icons.Default.Edit else Icons.Default.Check,
                onClick = {
                    if (suggestion.sender == "User-shared message") {
                        onEdit()
                    } else {
                        val cat = selectedCat ?: categories.firstOrNull() ?: Category(name = "General")
                        val necessityToSave = if (suggestion.type == TransactionType.EXPENSE) selectedNecessity else null
                        onConfirm(cat.id, cat.name, necessityToSave)
                    }
                },
                modifier = Modifier.weight(1.2f)
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EditSmsCandidateSheet(
    suggestion: SmsSuggestion,
    categories: List<Category>,
    onDismiss: () -> Unit,
    onSave: (Long, Long, String, PaymentMode, String, String, NecessityTier?, String?) -> Unit
) {
    var rawRupees by remember { mutableStateOf<String>(Money.paiseToDecimalString(suggestion.amountPaise)) }
    var transactionDate by remember { mutableStateOf(SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(Date(suggestion.smsTimestamp))) }
    var invalidDate by remember { mutableStateOf(false) }
    var merchant by remember { mutableStateOf(suggestion.merchant ?: "") }
    var notes by remember { mutableStateOf("") }
    var selectedMode by remember { mutableStateOf(suggestion.paymentMode) }
    var selectedType by remember { mutableStateOf(suggestion.type) }
    var selectedCat by remember {
        mutableStateOf(categories.firstOrNull { it.type == suggestion.type } ?: categories.firstOrNull())
    }
    var selectedNecessity by remember { mutableStateOf(NecessityTier.ESSENTIAL) }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 12.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(
                text = "Edit & Confirm SMS Transaction",
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold)
            )

            OutlinedTextField(
                value = rawRupees,
                onValueChange = { rawRupees = it },
                label = { Text("Amount (₹)") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )

            OutlinedTextField(
                value = merchant,
                onValueChange = { merchant = it },
                label = { Text("Merchant / Counterparty") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )

            OutlinedTextField(
                value = transactionDate,
                onValueChange = { transactionDate = it; invalidDate = false },
                label = { Text("Transaction date (YYYY-MM-DD)") },
                supportingText = if (invalidDate) ({ Text("Enter the date shown in the message before confirming.") }) else null,
                isError = invalidDate,
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )

            OutlinedTextField(
                value = notes,
                onValueChange = { notes = it },
                label = { Text("Notes (Optional)") },
                modifier = Modifier.fillMaxWidth()
            )

            // Account selection: Cash vs Online
            Text(
                text = "Account:",
                style = MaterialTheme.typography.labelSmall,
                color = ArthTheme.colors.textSecondary
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                SelectablePill(
                    text = "Online Bank",
                    selected = selectedMode == PaymentMode.ONLINE,
                    modifier = Modifier.weight(1f),
                    onClick = { selectedMode = PaymentMode.ONLINE }
                )
                SelectablePill(
                    text = "Cash",
                    selected = selectedMode == PaymentMode.CASH,
                    modifier = Modifier.weight(1f),
                    onClick = { selectedMode = PaymentMode.CASH }
                )
            }

            // Category Selection
            Text(
                text = "Category:",
                style = MaterialTheme.typography.labelSmall,
                color = ArthTheme.colors.textSecondary
            )
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                categories.filter { it.type == selectedType }.forEach { cat ->
                    SelectablePill(
                        text = if (!cat.icon.isNullOrBlank()) "${cat.icon} ${cat.name}" else cat.name,
                        selected = selectedCat?.id == cat.id,
                        onClick = { selectedCat = cat }
                    )
                }
            }

            Spacer(Modifier.height(10.dp))

            ArthButton(
                text = "Confirm & Add to Ledger",
                icon = Icons.Default.Check,
                onClick = {
                    val parsedDate = if (transactionDate.matches(Regex("\\d{4}-\\d{2}-\\d{2}"))) {
                        SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).apply { isLenient = false }.runCatching { parse(transactionDate)?.time }.getOrNull()
                    } else null
                    if (parsedDate == null) {
                        invalidDate = true
                        return@ArthButton
                    }
                    val amountPaise = try {
                        Money.rupeesToPaise(rawRupees)
                    } catch (_: Exception) {
                        suggestion.amountPaise
                    }
                    val cat = selectedCat ?: categories.firstOrNull() ?: Category(name = "General")
                    val necessityToSave = if (selectedType == TransactionType.EXPENSE) selectedNecessity else null
                    onSave(
                        amountPaise,
                        parsedDate,
                        merchant.trim().ifEmpty { suggestion.merchant ?: "Transaction" },
                        selectedMode,
                        cat.id,
                        cat.name,
                        necessityToSave,
                        notes.trim().ifEmpty { null }
                    )
                },
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(Modifier.height(16.dp))
        }
    }
}
