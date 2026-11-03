package com.digitaldodo.arth

import com.digitaldodo.arth.core.model.Money
import org.junit.Assert.assertEquals
import org.junit.Test

class MoneyTest {

    @Test
    fun convertsRupeesStringToPaiseWithoutFloatingPointInaccuracies() {
        assertEquals(0L, Money.rupeesToPaise(""))
        assertEquals(0L, Money.rupeesToPaise("0"))
        assertEquals(100L, Money.rupeesToPaise("1"))
        assertEquals(100L, Money.rupeesToPaise("1.00"))
        assertEquals(50L, Money.rupeesToPaise("0.50"))
        assertEquals(1L, Money.rupeesToPaise("0.01"))
        assertEquals(125050L, Money.rupeesToPaise("1,250.50"))
        assertEquals(125050L, Money.rupeesToPaise("₹ 1,250.50"))
        assertEquals(125050L, Money.rupeesToPaise("Rs. 1,250.50"))
        assertEquals(10000000L, Money.rupeesToPaise("1,00,000.00"))
    }

    @Test
    fun formatsPaiseToIndianNumberingFormat() {
        assertEquals("₹0.00", Money.formatPaise(0L))
        assertEquals("₹1.00", Money.formatPaise(100L))
        assertEquals("₹0.50", Money.formatPaise(50L))
        assertEquals("₹0.05", Money.formatPaise(5L))
        assertEquals("₹99.99", Money.formatPaise(9999L))
        assertEquals("₹1,250.50", Money.formatPaise(125050L))
        assertEquals("₹1,00,000.00", Money.formatPaise(10000000L))
        assertEquals("₹12,34,567.89", Money.formatPaise(123456789L))
        assertEquals("-₹500.00", Money.formatPaise(-50000L))
    }

    @Test
    fun formatsIndianGroupingCorrectly() {
        assertEquals("500", Money.formatIndianGrouping(500L))
        assertEquals("1,000", Money.formatIndianGrouping(1000L))
        assertEquals("10,000", Money.formatIndianGrouping(10000L))
        assertEquals("1,00,000", Money.formatIndianGrouping(100000L))
        assertEquals("10,00,000", Money.formatIndianGrouping(1000000L))
        assertEquals("1,00,00,000", Money.formatIndianGrouping(10000000L))
    }

    @Test
    fun formatsCompactRepresentations() {
        assertEquals("₹500", Money.formatCompact(50000L))
        assertEquals("₹1.5k", Money.formatCompact(150000L))
        assertEquals("₹1.2L", Money.formatCompact(12000000L))
        assertEquals("₹1.5Cr", Money.formatCompact(1500000000L))
    }
}
