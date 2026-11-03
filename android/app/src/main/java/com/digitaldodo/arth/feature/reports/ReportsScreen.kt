package com.digitaldodo.arth.feature.reports

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.PictureAsPdf
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import com.digitaldodo.arth.core.database.ArthDatabase
import com.digitaldodo.arth.core.designsystem.ArthButton
import com.digitaldodo.arth.core.designsystem.ArthCard
import com.digitaldodo.arth.core.designsystem.ArthTheme
import com.digitaldodo.arth.core.model.Money
import com.digitaldodo.arth.core.model.Transaction
import com.digitaldodo.arth.core.model.TransactionType
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.util.Calendar

@Composable
fun ReportsScreen(
    onBack: () -> Unit
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    var transactions by remember { mutableStateOf<List<Transaction>>(emptyList()) }
    var totalIncome by remember { mutableLongStateOf(0L) }
    var totalExpense by remember { mutableLongStateOf(0L) }
    var generatedPdfFile by remember { mutableStateOf<File?>(null) }
    var isGenerating by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        val db = ArthDatabase.getInstance(context)
        withContext(Dispatchers.IO) {
            val list = db.transactionDao().getAllActive().map { it.toDomain() }
            var inc = 0L
            var exp = 0L
            for (t in list) {
                if (t.type == TransactionType.INCOME) inc += t.amountPaise
                else if (t.type == TransactionType.EXPENSE) exp += t.amountPaise
            }
            withContext(Dispatchers.Main) {
                transactions = list
                totalIncome = inc
                totalExpense = exp
            }
        }
    }

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
                    text = "Financial Reports & Statements",
                    style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                    color = MaterialTheme.colorScheme.onBackground
                )
            }
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
            contentPadding = PaddingValues(top = 8.dp, bottom = 24.dp)
        ) {
            item {
                ArthCard {
                    Text(
                        text = "Statement Summary",
                        style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Spacer(Modifier.height(14.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column {
                            Text("Total Inflow", style = MaterialTheme.typography.labelMedium, color = ArthTheme.colors.textSecondary)
                            Spacer(Modifier.height(2.dp))
                            Text(Money.formatPaise(totalIncome), style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold), color = ArthTheme.colors.emerald)
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Text("Total Outflow", style = MaterialTheme.typography.labelMedium, color = ArthTheme.colors.textSecondary)
                            Spacer(Modifier.height(2.dp))
                            Text(Money.formatPaise(totalExpense), style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold), color = ArthTheme.colors.crimson)
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                    Divider(color = ArthTheme.colors.border)
                    Spacer(Modifier.height(12.dp))
                    val net = totalIncome - totalExpense
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text("Net Savings", style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold))
                        Text(
                            text = Money.formatPaise(net, showSign = true),
                            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                            color = if (net >= 0) ArthTheme.colors.emerald else ArthTheme.colors.crimson
                        )
                    }
                }
            }

            item {
                ArthCard {
                    Text(
                        text = "Generate PDF Statement",
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Spacer(Modifier.height(6.dp))
                    Text(
                        text = "Creates an official printable PDF statement containing all recorded transactions and financial breakdowns.",
                        style = MaterialTheme.typography.bodySmall,
                        color = ArthTheme.colors.textSecondary
                    )
                    Spacer(Modifier.height(16.dp))

                    ArthButton(
                        text = if (generatedPdfFile != null) "Share PDF Statement" else "Generate PDF Statement",
                        icon = if (generatedPdfFile != null) Icons.Default.Share else Icons.Default.PictureAsPdf,
                        isLoading = isGenerating,
                        onClick = {
                            if (generatedPdfFile != null) {
                                sharePdf(context, generatedPdfFile!!)
                            } else {
                                isGenerating = true
                                coroutineScope.launch(Dispatchers.IO) {
                                    val file = PdfStatementGenerator.generateStatementPdf(
                                        context = context,
                                        periodName = "All Recorded Transactions",
                                        totalIncomePaise = totalIncome,
                                        totalExpensePaise = totalExpense,
                                        transactions = transactions
                                    )
                                    withContext(Dispatchers.Main) {
                                        generatedPdfFile = file
                                        isGenerating = false
                                        sharePdf(context, file)
                                    }
                                }
                            }
                        },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }
        }
    }
}

private fun sharePdf(context: android.content.Context, file: File) {
    try {
        val uri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            file
        )
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "application/pdf"
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(Intent.createChooser(intent, "Share Arth Statement"))
    } catch (_: Exception) {
        // Fallback share
    }
}
