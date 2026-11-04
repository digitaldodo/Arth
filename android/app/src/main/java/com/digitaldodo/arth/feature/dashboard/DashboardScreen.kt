package com.digitaldodo.arth.feature.dashboard

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowForward
import androidx.compose.material.icons.filled.Mail
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.digitaldodo.arth.core.designsystem.*
import com.digitaldodo.arth.core.model.Money
import com.digitaldodo.arth.core.model.Transaction
import com.digitaldodo.arth.core.model.TransactionType
import com.digitaldodo.arth.core.network.CategorySpendingDto
import java.text.SimpleDateFormat
import java.util.*

@Composable
fun DashboardScreen(
    viewModel: DashboardViewModel,
    onNavigateToLedger: () -> Unit,
    onNavigateToSmsReview: () -> Unit,
    onTransactionClick: (String) -> Unit
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
                    Column {
                        Text(
                            text = "Dashboard",
                            style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.Bold),
                            color = MaterialTheme.colorScheme.onBackground
                        )
                        Text(
                            text = "Financial Overview",
                            style = MaterialTheme.typography.bodySmall,
                            color = ArthTheme.colors.textMuted
                        )
                    }

                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        // Refresh button
                        IconButton(
                            onClick = { viewModel.refresh() },
                            modifier = Modifier.size(36.dp)
                        ) {
                            if (state.isRefreshing) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(18.dp),
                                    strokeWidth = 2.dp,
                                    color = MaterialTheme.colorScheme.primary
                                )
                            } else {
                                Icon(
                                    imageVector = Icons.Default.Refresh,
                                    contentDescription = "Refresh",
                                    tint = ArthTheme.colors.textSecondary,
                                    modifier = Modifier.size(20.dp)
                                )
                            }
                        }

                        // Period Filter Selector
                        PeriodChip(
                            label = "Month",
                            selected = state.period == DashboardPeriod.THIS_MONTH,
                            onClick = { viewModel.setPeriod(DashboardPeriod.THIS_MONTH) }
                        )
                        PeriodChip(
                            label = "30D",
                            selected = state.period == DashboardPeriod.LAST_30_DAYS,
                            onClick = { viewModel.setPeriod(DashboardPeriod.LAST_30_DAYS) }
                        )
                        PeriodChip(
                            label = "Lifetime",
                            selected = state.period == DashboardPeriod.LIFETIME,
                            onClick = { viewModel.setPeriod(DashboardPeriod.LIFETIME) }
                        )
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
            verticalArrangement = Arrangement.spacedBy(16.dp),
            contentPadding = PaddingValues(bottom = 24.dp)
        ) {
            // Initial loading state skeleton
            if (state.dataState is DashboardDataState.InitialLoading && !state.isRefreshing && state.recentTransactions.isEmpty()) {
                item {
                    DashboardLoadingSkeleton()
                }
            } else if (state.dataState is DashboardDataState.SyncError && state.recentTransactions.isEmpty()) {
                // Honest error state: never show 0.00
                item {
                    SyncErrorCard(
                        message = (state.dataState as DashboardDataState.SyncError).message,
                        onRetry = { viewModel.refresh() }
                    )
                }
            } else {
                // Pending SMS suggestions banner
                if (state.pendingSmsCount > 0) {
                    item {
                        ArthCard(
                            backgroundColor = ArthTheme.colors.blueContainer,
                            borderColor = ArthTheme.colors.blue.copy(alpha = 0.3f),
                            onClick = onNavigateToSmsReview
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(
                                        imageVector = Icons.Default.Mail,
                                        contentDescription = null,
                                        tint = ArthTheme.colors.blue,
                                        modifier = Modifier.size(20.dp)
                                    )
                                    Spacer(Modifier.width(10.dp))
                                    Text(
                                        text = "${state.pendingSmsCount} new financial SMS detected",
                                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                                        color = ArthTheme.colors.blue
                                    )
                                }
                                Icon(
                                    imageVector = Icons.Default.ArrowForward,
                                    contentDescription = null,
                                    tint = ArthTheme.colors.blue,
                                    modifier = Modifier.size(16.dp)
                                )
                            }
                        }
                    }
                }

                // Total Available Balance Card matching PWA
                item {
                    TotalBalanceCard(state = state)
                }

                // Summary Cards: Total Income, Total Expenses, Net Cash Flow
                item {
                    SummaryMetricsCards(state = state)
                }

                // Spending by Necessity
                item {
                    SpendingByNecessityCard(state = state)
                }

                // Spending Composition (Category Breakdown)
                if (state.spendingComposition.isNotEmpty()) {
                    item {
                        SpendingCompositionCard(composition = state.spendingComposition, totalExpense = state.periodExpensePaise)
                    }
                }

                // Recent Transactions Section Header
                item {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 8.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "Recent Activity",
                            style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.SemiBold),
                            color = MaterialTheme.colorScheme.onBackground
                        )
                        Text(
                            text = "View All →",
                            style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold),
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.clickable { onNavigateToLedger() }
                        )
                    }
                }

                // Recent Transactions List
                if (state.recentTransactions.isEmpty()) {
                    item {
                        ArthCard {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 24.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    Text(
                                        text = "No transactions in this period",
                                        style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium),
                                        color = ArthTheme.colors.textSecondary
                                    )
                                    Spacer(Modifier.height(4.dp))
                                    Text(
                                        text = "Tap Add below to record income or expenses.",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = ArthTheme.colors.textMuted
                                    )
                                }
                            }
                        }
                    }
                } else {
                    items(state.recentTransactions, key = { it.id }) { tx ->
                        TransactionListItem(transaction = tx, onClick = { onTransactionClick(tx.id) })
                    }
                }
            }
        }
    }
}

@Composable
fun TotalBalanceCard(state: DashboardUiState) {
    ArthCard {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "TOTAL AVAILABLE BALANCE",
                style = MaterialTheme.typography.labelSmall.copy(
                    letterSpacing = 1.sp,
                    fontWeight = FontWeight.SemiBold
                ),
                color = ArthTheme.colors.textSecondary
            )

            // Status Badge
            when (state.dataState) {
                is DashboardDataState.FreshServerData -> {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(6.dp)
                                .clip(CircleShape)
                                .background(ArthTheme.colors.emerald)
                        )
                        Text(
                            text = "Synced",
                            style = MaterialTheme.typography.labelSmall,
                            color = ArthTheme.colors.emerald
                        )
                    }
                }
                is DashboardDataState.CachedData -> {
                    Text(
                        text = "Saved Copy",
                        style = MaterialTheme.typography.labelSmall,
                        color = ArthTheme.colors.amber
                    )
                }
                else -> {}
            }
        }

        Spacer(Modifier.height(8.dp))

        // Total figure in monospaced tabular numbers
        Text(
            text = Money.formatPaise(state.totalBalancePaise),
            style = MaterialTheme.typography.displayMedium.copy(
                fontWeight = FontWeight.Bold,
                fontFamily = FontFamily.Monospace
            ),
            color = MaterialTheme.colorScheme.onSurface
        )

        Spacer(Modifier.height(16.dp))
        HorizontalDivider(color = ArthTheme.colors.border, thickness = 1.dp)
        Spacer(Modifier.height(12.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column {
                Text(
                    text = "Cash Balance",
                    style = MaterialTheme.typography.labelMedium,
                    color = ArthTheme.colors.textSecondary
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    text = Money.formatPaise(state.cashBalancePaise),
                    style = MaterialTheme.typography.titleMedium.copy(
                        fontWeight = FontWeight.SemiBold,
                        fontFamily = FontFamily.Monospace
                    ),
                    color = MaterialTheme.colorScheme.onSurface
                )
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    text = "Online Balance",
                    style = MaterialTheme.typography.labelMedium,
                    color = ArthTheme.colors.textSecondary
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    text = Money.formatPaise(state.onlineBalancePaise),
                    style = MaterialTheme.typography.titleMedium.copy(
                        fontWeight = FontWeight.SemiBold,
                        fontFamily = FontFamily.Monospace
                    ),
                    color = ArthTheme.colors.blue
                )
            }
        }
    }
}

@Composable
fun SummaryMetricsCards(state: DashboardUiState) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        // Income Card
        ArthCard(modifier = Modifier.weight(1f)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Income",
                    style = MaterialTheme.typography.labelSmall,
                    color = ArthTheme.colors.textMuted
                )
                Text(
                    text = "In",
                    style = MaterialTheme.typography.labelSmall.copy(fontSize = 9.sp),
                    color = ArthTheme.colors.emerald
                )
            }
            Spacer(Modifier.height(4.dp))
            Text(
                text = "+${Money.formatPaise(state.periodIncomePaise)}",
                style = MaterialTheme.typography.titleMedium.copy(
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace
                ),
                color = ArthTheme.colors.emerald
            )
        }

        // Expense Card
        ArthCard(modifier = Modifier.weight(1f)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Expense",
                    style = MaterialTheme.typography.labelSmall,
                    color = ArthTheme.colors.textMuted
                )
                Text(
                    text = "Out",
                    style = MaterialTheme.typography.labelSmall.copy(fontSize = 9.sp),
                    color = ArthTheme.colors.crimson
                )
            }
            Spacer(Modifier.height(4.dp))
            Text(
                text = "−${Money.formatPaise(state.periodExpensePaise)}",
                style = MaterialTheme.typography.titleMedium.copy(
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace
                ),
                color = ArthTheme.colors.crimson
            )
        }

        // Net Cash Flow Card
        val isSurplus = state.netCashFlowPaise > 0
        val isDeficit = state.netCashFlowPaise < 0
        val netColor = if (isSurplus) ArthTheme.colors.emerald else if (isDeficit) ArthTheme.colors.crimson else ArthTheme.colors.textSecondary

        ArthCard(modifier = Modifier.weight(1f)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Net Flow",
                    style = MaterialTheme.typography.labelSmall,
                    color = ArthTheme.colors.textMuted
                )
                Text(
                    text = if (isSurplus) "Surplus" else if (isDeficit) "Deficit" else "Zero",
                    style = MaterialTheme.typography.labelSmall.copy(fontSize = 9.sp),
                    color = netColor
                )
            }
            Spacer(Modifier.height(4.dp))
            val netSign = if (isSurplus) "+" else if (isDeficit) "−" else ""
            Text(
                text = "$netSign${Money.formatPaise(Math.abs(state.netCashFlowPaise))}",
                style = MaterialTheme.typography.titleMedium.copy(
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace
                ),
                color = netColor
            )
        }
    }
}

@Composable
fun SpendingByNecessityCard(state: DashboardUiState) {
    val totalExpense = state.periodExpensePaise
    val essentialPct = if (totalExpense > 0) ((state.essentialExpensePaise * 100) / totalExpense).toInt() else 0
    val optionalPct = if (totalExpense > 0) ((state.optionalExpensePaise * 100) / totalExpense).toInt() else 0
    val luxuryPct = if (totalExpense > 0) ((state.luxuryExpensePaise * 100) / totalExpense).toInt() else 0

    ArthCard {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "Spending by Necessity",
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                color = MaterialTheme.colorScheme.onSurface
            )
            Text(
                text = "3 tiers",
                style = MaterialTheme.typography.labelSmall,
                color = ArthTheme.colors.textMuted
            )
        }

        Spacer(Modifier.height(14.dp))

        if (totalExpense <= 0L) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 12.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "No expense activity in this period",
                    style = MaterialTheme.typography.bodySmall,
                    color = ArthTheme.colors.textMuted
                )
            }
        } else {
            // Segmented 3-tier progress bar
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(8.dp)
                    .clip(RoundedCornerShape(4.dp))
                    .background(ArthTheme.colors.border)
            ) {
                if (essentialPct > 0) {
                    Box(
                        modifier = Modifier
                            .fillMaxHeight()
                            .weight(essentialPct.toFloat().coerceAtLeast(1f))
                            .background(Color(0xFF3B82F6))
                    )
                }
                if (optionalPct > 0) {
                    Box(
                        modifier = Modifier
                            .fillMaxHeight()
                            .weight(optionalPct.toFloat().coerceAtLeast(1f))
                            .background(Color(0xFFF59E0B))
                    )
                }
                if (luxuryPct > 0) {
                    Box(
                        modifier = Modifier
                            .fillMaxHeight()
                            .weight(luxuryPct.toFloat().coerceAtLeast(1f))
                            .background(Color(0xFFA855F7))
                    )
                }
            }

            Spacer(Modifier.height(14.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                NecessityStat(
                    title = "Essential ($essentialPct%)",
                    amount = Money.formatPaise(state.essentialExpensePaise),
                    color = Color(0xFF3B82F6)
                )
                NecessityStat(
                    title = "Optional ($optionalPct%)",
                    amount = Money.formatPaise(state.optionalExpensePaise),
                    color = Color(0xFFF59E0B)
                )
                NecessityStat(
                    title = "Luxury ($luxuryPct%)",
                    amount = Money.formatPaise(state.luxuryExpensePaise),
                    color = Color(0xFFA855F7)
                )
            }
        }
    }
}

@Composable
fun SpendingCompositionCard(composition: List<CategorySpendingDto>, totalExpense: Long) {
    ArthCard {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "Spending Composition",
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                color = MaterialTheme.colorScheme.onSurface
            )
            Text(
                text = "${composition.size} categories",
                style = MaterialTheme.typography.labelSmall,
                color = ArthTheme.colors.textMuted
            )
        }

        Spacer(Modifier.height(12.dp))

        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            composition.take(5).forEach { cat ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = cat.categoryName,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text(
                            text = "${cat.sharePercentage.toInt()}%",
                            style = MaterialTheme.typography.labelSmall,
                            color = ArthTheme.colors.textMuted
                        )
                        Text(
                            text = Money.formatPaise(cat.amountPaise),
                            style = MaterialTheme.typography.bodyMedium.copy(
                                fontWeight = FontWeight.SemiBold,
                                fontFamily = FontFamily.Monospace
                            ),
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun SyncErrorCard(message: String, onRetry: () -> Unit) {
    ArthCard(
        borderColor = ArthTheme.colors.crimson.copy(alpha = 0.4f),
        backgroundColor = ArthTheme.colors.crimsonContainer
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Icon(
                imageVector = Icons.Default.Warning,
                contentDescription = null,
                tint = ArthTheme.colors.crimson,
                modifier = Modifier.size(28.dp)
            )
            Text(
                text = "Unable to retrieve financial data",
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                color = ArthTheme.colors.crimson
            )
            Text(
                text = message,
                style = MaterialTheme.typography.bodySmall,
                color = ArthTheme.colors.textSecondary
            )
            Button(
                onClick = onRetry,
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    contentColor = MaterialTheme.colorScheme.onPrimary
                ),
                shape = RoundedCornerShape(8.dp)
            ) {
                Text("Retry Connection")
            }
        }
    }
}

@Composable
fun DashboardLoadingSkeleton() {
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        ArthCard {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(110.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "Retrieving financial records…",
                    style = MaterialTheme.typography.bodySmall,
                    color = ArthTheme.colors.textMuted
                )
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .height(72.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant)
            )
            Box(
                modifier = Modifier
                    .weight(1f)
                    .height(72.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant)
            )
            Box(
                modifier = Modifier
                    .weight(1f)
                    .height(72.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant)
            )
        }
    }
}

@Composable
fun PeriodChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit
) {
    val bg = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant
    val fg = if (selected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant

    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(bg)
            .clickable { onClick() }
            .padding(horizontal = 10.dp, vertical = 6.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
            color = fg
        )
    }
}

@Composable
fun NecessityStat(title: String, amount: String, color: Color) {
    Column {
        Text(text = title, style = MaterialTheme.typography.labelSmall, color = color)
        Spacer(Modifier.height(2.dp))
        Text(
            text = amount,
            style = MaterialTheme.typography.titleMedium.copy(
                fontWeight = FontWeight.SemiBold,
                fontFamily = FontFamily.Monospace
            ),
            color = MaterialTheme.colorScheme.onSurface
        )
    }
}

@Composable
fun TransactionListItem(
    transaction: Transaction,
    onClick: () -> Unit
) {
    val sdf = SimpleDateFormat("dd MMM, hh:mm a", Locale.getDefault())
    val dateStr = sdf.format(Date(transaction.transactionDate))

    ArthCard(
        modifier = Modifier.fillMaxWidth(),
        onClick = onClick
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                val primaryTitle = transaction.counterparty?.takeIf { it.isNotBlank() }
                    ?: transaction.categoryName
                Text(
                    text = primaryTitle,
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                    color = MaterialTheme.colorScheme.onSurface
                )
                Spacer(Modifier.height(4.dp))
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    PaymentBadge(mode = transaction.paymentMode)
                    if (transaction.type == TransactionType.EXPENSE && transaction.necessity != null) {
                        NecessityBadge(necessity = transaction.necessity)
                    }
                    Text(
                        text = dateStr,
                        style = MaterialTheme.typography.labelSmall,
                        color = ArthTheme.colors.textMuted
                    )
                }
            }

            AmountDisplay(
                amountFormatted = transaction.formattedAmount,
                type = transaction.type
            )
        }
    }
}
