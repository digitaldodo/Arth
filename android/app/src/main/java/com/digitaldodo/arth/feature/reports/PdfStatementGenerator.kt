package com.digitaldodo.arth.feature.reports

import android.content.Context
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import com.digitaldodo.arth.core.model.Money
import com.digitaldodo.arth.core.model.Transaction
import com.digitaldodo.arth.core.model.TransactionType
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.*

object PdfStatementGenerator {

    fun generateStatementPdf(
        context: Context,
        periodName: String,
        totalIncomePaise: Long,
        totalExpensePaise: Long,
        transactions: List<Transaction>
    ): File {
        val document = PdfDocument()
        val pageInfo = PdfDocument.PageInfo.Builder(595, 842, 1).create() // Standard A4 (in points)
        val page = document.startPage(pageInfo)
        val canvas = page.canvas

        val titlePaint = Paint().apply {
            color = Color.BLACK
            textSize = 20f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            isAntiAlias = true
        }

        val subPaint = Paint().apply {
            color = Color.DKGRAY
            textSize = 10f
            typeface = Typeface.DEFAULT
            isAntiAlias = true
        }

        val headerPaint = Paint().apply {
            color = Color.BLACK
            textSize = 10f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            isAntiAlias = true
        }

        val bodyPaint = Paint().apply {
            color = Color.BLACK
            textSize = 9f
            typeface = Typeface.DEFAULT
            isAntiAlias = true
        }

        val incomePaint = Paint().apply {
            color = Color.rgb(5, 150, 105)
            textSize = 9f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            isAntiAlias = true
        }

        val expensePaint = Paint().apply {
            color = Color.rgb(220, 38, 38)
            textSize = 9f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            isAntiAlias = true
        }

        val linePaint = Paint().apply {
            color = Color.LTGRAY
            strokeWidth = 1f
        }

        var y = 50f

        // Document Title
        canvas.drawText("ARTH FINANCIAL STATEMENT", 40f, y, titlePaint)
        y += 18f
        val nowStr = SimpleDateFormat("dd MMMM yyyy, HH:mm", Locale.getDefault()).format(Date())
        canvas.drawText("Period: $periodName • Generated on $nowStr", 40f, y, subPaint)
        y += 20f

        // Summary box
        canvas.drawLine(40f, y, 555f, y, linePaint)
        y += 20f
        canvas.drawText("Total Inflow: ${Money.formatPaise(totalIncomePaise)}", 40f, y, headerPaint)
        canvas.drawText("Total Outflow: ${Money.formatPaise(totalExpensePaise)}", 220f, y, headerPaint)
        val netSavings = totalIncomePaise - totalExpensePaise
        canvas.drawText("Net: ${Money.formatPaise(netSavings, showSign = true)}", 400f, y, headerPaint)
        y += 15f
        canvas.drawLine(40f, y, 555f, y, linePaint)
        y += 25f

        // Table Header
        canvas.drawText("DATE", 40f, y, headerPaint)
        canvas.drawText("DESCRIPTION", 130f, y, headerPaint)
        canvas.drawText("CATEGORY", 300f, y, headerPaint)
        canvas.drawText("MODE", 410f, y, headerPaint)
        canvas.drawText("AMOUNT", 480f, y, headerPaint)
        y += 8f
        canvas.drawLine(40f, y, 555f, y, linePaint)
        y += 16f

        val sdf = SimpleDateFormat("dd/MM/yyyy", Locale.getDefault())

        for (tx in transactions.take(45)) { // First page limit
            if (y > 800f) break
            val dateStr = sdf.format(Date(tx.transactionDate))
            val desc = (tx.counterparty ?: tx.categoryName).take(24)
            val cat = tx.categoryName.take(18)
            val mode = tx.paymentMode.name.take(6)
            val amtStr = tx.formattedAmount

            canvas.drawText(dateStr, 40f, y, bodyPaint)
            canvas.drawText(desc, 130f, y, bodyPaint)
            canvas.drawText(cat, 300f, y, bodyPaint)
            canvas.drawText(mode, 410f, y, bodyPaint)
            val paint = if (tx.type == TransactionType.INCOME) incomePaint else expensePaint
            canvas.drawText(amtStr, 480f, y, paint)

            y += 15f
        }

        document.finishPage(page)

        val outputFile = File(context.cacheDir, "arth_statement_${System.currentTimeMillis()}.pdf")
        FileOutputStream(outputFile).use { out ->
            document.writeTo(out)
        }
        document.close()

        return outputFile
    }
}
