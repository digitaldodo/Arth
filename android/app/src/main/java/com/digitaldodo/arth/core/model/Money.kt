package com.digitaldodo.arth.core.model

import java.math.BigDecimal
import java.math.RoundingMode
import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.util.Locale

/**
 * Money utilities enforcing integer paise (Long) calculations across the entire application.
 * 1 INR = 100 paise.
 * Floats and Doubles are NEVER used for storing or calculating balances.
 */
object Money {
    const val PAISE_PER_RUPEE = 100L

    /**
     * Converts a rupee string (e.g. "1250.50") safely to integer paise without floating point error.
     */
    fun rupeesToPaise(rupeeString: String): Long {
        val cleaned = rupeeString.trim().replace(",", "").replace("₹", "").replace("Rs.", "").trim()
        if (cleaned.isBlank()) return 0L
        val bd = BigDecimal(cleaned).setScale(2, RoundingMode.HALF_UP)
        return bd.multiply(BigDecimal(PAISE_PER_RUPEE)).toLong()
    }

    /**
     * Converts paise (Long) to a formatted INR string with the Indian grouping system:
     * e.g. 12345678 paise -> "₹1,23,456.78"
     */
    fun formatPaise(paise: Long, showSign: Boolean = false, includeSymbol: Boolean = true): String {
        val isNegative = paise < 0
        val absPaise = kotlin.math.abs(paise)
        val rupees = absPaise / PAISE_PER_RUPEE
        val remainderPaise = absPaise % PAISE_PER_RUPEE

        val formattedRupees = formatIndianGrouping(rupees)
        val paiseString = String.format(Locale.ROOT, "%02d", remainderPaise)
        val valueString = "$formattedRupees.$paiseString"

        val symbol = if (includeSymbol) "₹" else ""
        return when {
            isNegative -> "-$symbol$valueString"
            showSign && paise > 0 -> "+$symbol$valueString"
            else -> "$symbol$valueString"
        }
    }

    /**
     * Formats integer rupees according to Indian numbering system:
     * e.g. 1234567 -> "12,34,567"
     */
    fun formatIndianGrouping(rupees: Long): String {
        val s = rupees.toString()
        if (s.length <= 3) return s
        val last3 = s.substring(s.length - 3)
        val remaining = s.substring(0, s.length - 3)
        val sb = StringBuilder()
        var count = 0
        for (i in remaining.length - 1 downTo 0) {
            sb.append(remaining[i])
            count++
            if (count % 2 == 0 && i > 0) {
                sb.append(',')
            }
        }
        return sb.reverse().toString() + "," + last3
    }

    /**
     * Formats compact INR for overview widgets (e.g. ₹1.2L, ₹45k).
     */
    fun formatCompact(paise: Long): String {
        val absPaise = kotlin.math.abs(paise)
        val isNeg = paise < 0
        val prefix = if (isNeg) "-₹" else "₹"
        val rupees = absPaise / PAISE_PER_RUPEE

        return when {
            rupees >= 10_000_000 -> String.format(Locale.ROOT, "%s%.1fCr", prefix, rupees / 10_000_000.0)
            rupees >= 100_000 -> String.format(Locale.ROOT, "%s%.1fL", prefix, rupees / 100_000.0)
            rupees >= 1_000 -> String.format(Locale.ROOT, "%s%.1fk", prefix, rupees / 1_000.0)
            else -> "$prefix$rupees"
        }
    }
}
