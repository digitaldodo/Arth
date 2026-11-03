package com.digitaldodo.arth.feature.dashboard

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowForward
import androidx.compose.material.icons.filled.Mail
import androidx.compose.material.icons.filled.TrendingDown
import androidx.compose.material.icons.filled.TrendingUp
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
import com.digitaldodo.arth.core.model.Money
import com.digitaldodo.arth.core.model.Transaction
import com.digitaldodo.arth.core.model.TransactionType
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
                    Text(
                        text = "Dashboard",
                        style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.Bold),
                        color = MaterialTheme.colorScheme.onBackground
                    )

                    // Period Filter Selector
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
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

            // Net Balance Card
            item {
                ArthCard {
                    Text(
                        text = "Net Balance",
                        style = MaterialTheme.typography.titleMedium,
                        color = ArthTheme.colors.textSecondary
                    )
                    Spacer(Modifier.height(6.dp))
                    Text(
                        text = Money.formatPaise(state.totalBalancePaise),
                        style = MaterialTheme.typography.displayMedium.copy(fontWeight = FontWeight.Bold),
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Spacer(Modifier.height(16.dp))
                    Divider(color = ArthTheme.colors.border, thickness = 1.dp)
                    Spacer(Modifier.height(12.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column {
                            Text(
                                text = "Cash in Hand",
                                style = MaterialTheme.typography.labelMedium,
                                color = ArthTheme.colors.textSecondary
                            )
                            Spacer(Modifier.height(2.dp))
                            Text(
                                text = Money.formatPaise(state.cashBalancePaise),
                                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                                color = ArthTheme.colors.amber
                            )
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Text(
                                text = "Online Accounts",
                                style = MaterialTheme.typography.labelMedium,
                                color = ArthTheme.colors.textSecondary
                            )
                            Spacer(Modifier.height(2.dp))
                            Text(
                                text = Money.formatPaise(state.onlineBalancePaise),
                                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                                color = ArthTheme.colors.blue
                            )
                        }
                    }
                }
            }

            // Inflow & Outflow Summary Cards
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    ArthCard(modifier = Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                Icons.Default.TrendingUp,
                                contentDescription = null,
                                tint = ArthTheme.colors.emerald,
                                modifier = Modifier.size(16.dp)
                            )
                            Spacer(Modifier.width(6.dp))
                            Text(
                                text = "Inflow",
                                style = MaterialTheme.typography.labelMedium,
                                color = ArthTheme.colors.textSecondary
                            )
                        }
                        Spacer(Modifier.height(6.dp))
                        Text(
                            text = Money.formatPaise(state.periodIncomePaise),
                            style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                            color = ArthTheme.colors.emerald
                        )
                    }

                    ArthCard(modifier = Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                Icons.Default.TrendingDown,
                                contentDescription = null,
                                tint = ArthTheme.colors.crimson,
                                modifier = Modifier.size(16.dp)
                            )
                            Spacer(Modifier.width(6.dp))
                            Text(
                                text = "Outflow",
                                style = MaterialTheme.typography.labelMedium,
                                color = ArthTheme.colors.textSecondary
                            )
                        }
                        Spacer(Modifier.height(6.dp))
                        Text(
                            text = Money.formatPaise(state.periodExpensePaise),
                            style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                            color = ArthTheme.colors.crimson
                        )
                    }
                }
            }

            // 50/30/20 Necessity Breakdown Card
            item {
                val totalExpense = state.periodExpensePaise
                val needsPct = if (totalExpense > 0) ((state.needsExpensePaise * 100) / totalExpense).toInt() else 0
                val wantsPct = if (totalExpense > 0) ((state.wantsExpensePaise * 100) / totalExpense).toInt() else 0
                val savingsPct = if (totalExpense > 0) ((state.savingsExpensePaise * 100) / totalExpense).toInt() else 0

                ArthCard {
                    Text(
                        text = "Spending by Necessity",
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Spacer(Modifier.height(14.dp))

                    // Progress bar split
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(8.dp)
                            .clip(RoundedCornerShape(4.dp))
                            .background(ArthTheme.colors.border)
                    ) {
                        if (needsPct > 0) {
                            Box(
                                modifier = Modifier
                                    .fillMaxHeight()
                                    .weight(needsPct.toFloat().coerceAtLeast(1f))
                                    .background(ArthTheme.colors.blue)
                            )
                        }
                        if (wantsPct > 0) {
                            Box(
                                modifier = Modifier
                                    .fillMaxHeight()
                                    .weight(wantsPct.toFloat().coerceAtLeast(1f))
                                    .background(ArthTheme.colors.purple)
                            )
                        }
                        if (savingsPct > 0) {
                            Box(
                                modifier = Modifier
                                    .fillMaxHeight()
                                    .weight(savingsPct.toFloat().coerceAtLeast(1f))
                                    .background(ArthTheme.colors.emerald)
                            )
                        }
                    }

                    Spacer(Modifier.height(14.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        NecessityStat(
                            title = "Needs ($needsPct%)",
                            amount = Money.formatPaise(state.needsExpensePaise),
                            color = ArthTheme.colors.blue
                        )
                        NecessityStat(
                            title = "Wants ($wantsPct%)",
                            amount = Money.formatPaise(state.wantsExpensePaise),
                            color = ArthTheme.colors.purple
                        )
                        NecessityStat(
                            title = "Savings ($savingsPct%)",
                            amount = Money.formatPaise(state.savingsExpensePaise),
                            color = ArthTheme.colors.emerald
                        )
                    }
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
                        text = "Recent Transactions",
                        style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.SemiBold),
                        color = MaterialTheme.colorScheme.onBackground
                    )
                    Text(
                        text = "View All",
                        style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold),
                        color = ArthTheme.colors.blue,
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
                                .padding(vertical = 20.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = "No transactions yet. Use Quick Add below.",
                                style = MaterialTheme.typography.bodyMedium,
                                color = ArthTheme.colors.textMuted
                            )
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
fun NecessityStat(title: String, amount: String, color: androidx.compose.ui.graphics.Color) {
    Column {
        Text(text = title, style = MaterialTheme.typography.labelSmall, color = color)
        Spacer(Modifier.height(2.dp))
        Text(
            text = amount,
            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
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
                Text(
                    text = transaction.counterparty ?: transaction.categoryName,
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                    color = MaterialTheme.colorScheme.onSurface
                )
                Spacer(Modifier.height(4.dp))
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    PaymentBadge(mode = transaction.paymentMode)
                    if (transaction.type == TransactionType.EXPENSE) {
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
