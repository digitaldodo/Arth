package com.digitaldodo.arth.core.sms

import android.content.Context
import com.digitaldodo.arth.core.model.Category
import com.digitaldodo.arth.core.model.TransactionType
import java.security.MessageDigest
import java.util.Locale

data class CategorySuggestion(
    val category: Category,
    val confidence: Float,
    val method: String, // "weak_supervision" | "user_correction"
    val evidence: String,
    val needsConfirmation: Boolean = true
)

object IndianCategorizationEngine {

    private data class PatternRule(val pattern: Regex, val categoryName: String, val ruleType: String)

    private val merchantAliases = listOf(
        PatternRule(Regex("\\b(?:zomato|swiggy|dominos|mcdonalds?|starbucks|kfc|pizza\\s*hut)\\b", RegexOption.IGNORE_CASE), "Food & Dining", "merchant alias"),
        PatternRule(Regex("\\b(?:amazon|flipkart|myntra|meesho|zepto|blinkit|nykaa|ajio|tata\\s*cliq)\\b", RegexOption.IGNORE_CASE), "Shopping", "merchant alias"),
        PatternRule(Regex("\\b(?:bescom|tneb|cesc|tata\\s*power|billdesk|airtel|jio|vi|vodafone|bsnl|mahanagar\\s*gas|igl|bwssb)\\b", RegexOption.IGNORE_CASE), "Utilities", "merchant alias"),
        PatternRule(Regex("\\b(?:uber|ola|rapido|irctc|hpcl|bpcl|iocl|shell|fastag)\\b", RegexOption.IGNORE_CASE), "Transport", "merchant alias"),
        PatternRule(Regex("\\b(?:netflix|spotify|prime\\s*video|hotstar|pvr|inox|bookmyshow|sonyliv)\\b", RegexOption.IGNORE_CASE), "Entertainment", "merchant alias"),
        PatternRule(Regex("\\b(?:apollo|fortis|max\\s*healthcare|medplus|pharmeasy|1mg)\\b", RegexOption.IGNORE_CASE), "Healthcare", "merchant alias"),
        PatternRule(Regex("\\b(?:allen|aakash|coursera|udemy)\\b", RegexOption.IGNORE_CASE), "Education", "merchant alias"),
        PatternRule(Regex("\\b(?:bajaj\\s*finance|hdb\\s*financial)\\b", RegexOption.IGNORE_CASE), "EMIs & Loans", "merchant alias")
    )

    private val transactionContexts = listOf(
        PatternRule(Regex("\\b(?:restaurant|cafe|food\\s*delivery|food\\s*merchant|dining|bakery|diner)\\b", RegexOption.IGNORE_CASE), "Food & Dining", "transaction context"),
        PatternRule(Regex("\\b(?:retail|shopping|marketplace|supermarket|mart|store|grocery)\\b", RegexOption.IGNORE_CASE), "Shopping", "transaction context"),
        PatternRule(Regex("\\b(?:electricity|water\\s*bill|gas\\s*bill|broadband|recharge|power\\s*bill|utility)\\b", RegexOption.IGNORE_CASE), "Utilities", "transaction context"),
        PatternRule(Regex("\\b(?:rent|landlord|house\\s*rent|lease)\\b", RegexOption.IGNORE_CASE), "Rent", "transaction context"),
        PatternRule(Regex("\\b(?:metro|petrol|fuel|toll|cab|transport|auto|fare|railway)\\b", RegexOption.IGNORE_CASE), "Transport", "transaction context"),
        PatternRule(Regex("\\b(?:school|college|tuition|university|coaching|exam\\s*fee)\\b", RegexOption.IGNORE_CASE), "Education", "transaction context"),
        PatternRule(Regex("\\b(?:emi|loan\\s*installment|loan\\s*repayment|home\\s*loan|car\\s*loan)\\b", RegexOption.IGNORE_CASE), "EMIs & Loans", "transaction context"),
        PatternRule(Regex("\\b(?:hospital|pharmacy|clinic|diagnostic|doctor|medical|lab|pathology)\\b", RegexOption.IGNORE_CASE), "Healthcare", "transaction context"),
        PatternRule(Regex("\\b(?:cinema|movie|theatre|gaming|subscription|concert|streaming)\\b", RegexOption.IGNORE_CASE), "Entertainment", "transaction context"),
        PatternRule(Regex("\\b(?:salary|payroll|stipend)\\b", RegexOption.IGNORE_CASE), "Salary", "transaction context"),
        PatternRule(Regex("\\b(?:refund|reversal|reversed|chargeback|credited\\s*back)\\b", RegexOption.IGNORE_CASE), "Refunds", "transaction context"),
        PatternRule(Regex("\\b(?:self\\s*transfer|own\\s*account|account\\s*transfer|intra-bank)\\b", RegexOption.IGNORE_CASE), "Transfers", "transaction context"),
        PatternRule(Regex("\\b(?:interest\\s*credited|dividend|cashback\\s*credited|reward\\s*points?)\\b", RegexOption.IGNORE_CASE), "Other Income", "transaction context")
    )

    fun normalizeNarration(raw: String): String {
        return raw.trim()
            .lowercase(Locale.ROOT)
            .replace(Regex("\\b(?:upi\\s*)?(?:ref|reference|utr|rrn|txn(?:\\s*id)?)\\s*[:#-]?\\s*[a-z0-9-]{6,30}\\b", RegexOption.IGNORE_CASE), " ")
            .replace(Regex("\\b(?:inr|rs\\.?|₹)\\s*[\\d,]+(?:\\.\\d{1,2})?", RegexOption.IGNORE_CASE), " amount ")
            .replace(Regex("\\b\\d{8,}\\b"), " reference ")
            .replace(Regex("[^a-z0-9@._-]+"), " ")
            .replace(Regex("\\s+"), " ")
            .trim()
    }

    fun merchantFingerprint(narration: String): String {
        val normalized = normalizeNarration(narration)
        return normalized.split(" ")
            .filter { token -> !token.all { it.isDigit() } && token.isNotBlank() }
            .take(5)
            .joinToString(" ")
    }

    private fun sha256(input: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(input.toByteArray(Charsets.UTF_8))
        return digest.joinToString("") { "%02x".format(it) }
    }

    fun saveCategoryCorrection(context: Context, merchantText: String, categoryId: String) {
        val fp = merchantFingerprint(merchantText)
        if (fp.isBlank()) return
        val prefs = context.getSharedPreferences("spendsense_category_feedback_v1", Context.MODE_PRIVATE)
        prefs.edit().putString(sha256(fp), categoryId).apply()
    }

    fun getCategoryCorrection(context: Context, merchantText: String): String? {
        val fp = merchantFingerprint(merchantText)
        if (fp.isBlank()) return null
        val prefs = context.getSharedPreferences("spendsense_category_feedback_v1", Context.MODE_PRIVATE)
        return prefs.getString(sha256(fp), null)
    }

    fun suggestCategory(
        context: Context?,
        narration: String,
        categories: List<Category>,
        type: TransactionType
    ): CategorySuggestion? {
        val normalized = normalizeNarration(narration)
        if (normalized.isBlank()) return null

        // 1. Check user-confirmed historical correction
        if (context != null) {
            val correctedCatId = getCategoryCorrection(context, narration)
            if (!correctedCatId.isNullOrBlank()) {
                val found = categories.find { it.id == correctedCatId && it.type == type }
                if (found != null) {
                    return CategorySuggestion(
                        category = found,
                        confidence = 1.0f,
                        method = "user_correction",
                        evidence = "You previously assigned this merchant to ${found.name}"
                    )
                }
            }
        }

        // 2. Weak supervision multi-signal rules
        val votes = mutableListOf<PatternRule>()
        for (rule in merchantAliases) {
            if (rule.pattern.containsMatchIn(normalized)) votes.add(rule)
        }
        for (rule in transactionContexts) {
            if (rule.pattern.containsMatchIn(normalized)) votes.add(rule)
        }

        if (votes.isEmpty()) return null

        val counts = mutableMapOf<String, Int>()
        for (vote in votes) {
            counts[vote.categoryName] = (counts[vote.categoryName] ?: 0) + 1
        }

        val sorted = counts.entries.sortedByDescending { it.value }
        val top = sorted.first()
        val totalVotes = votes.size
        val sourceTypes = votes.map { it.ruleType }.distinct().size

        // Single weak signal is conservative (0.5); multiple signals provide higher confidence
        val confidence = if (sourceTypes < 2) 0.5f else top.value.toFloat() / totalVotes.toFloat()
        if (sourceTypes >= 2 && confidence < 0.65f) return null
        if (sorted.size > 1 && sorted[1].value == top.value) return null // Tie abstention

        // Match to category list
        val targetName = top.key.lowercase(Locale.ROOT)
        val matchedCategory = categories.find { cat ->
            cat.type == type && (
                cat.name.lowercase(Locale.ROOT) == targetName ||
                (targetName == "other income" && cat.name.lowercase(Locale.ROOT).contains("income")) ||
                (targetName == "food & dining" && cat.name.lowercase(Locale.ROOT).contains("food")) ||
                (targetName == "emis & loans" && (cat.name.lowercase(Locale.ROOT).contains("emi") || cat.name.lowercase(Locale.ROOT).contains("loan")))
            )
        } ?: return null

        val evidenceDetails = votes.filter { it.categoryName == top.key }
            .joinToString("; ") { "${it.ruleType}: ${it.categoryName}" }

        return CategorySuggestion(
            category = matchedCategory,
            confidence = confidence,
            method = "weak_supervision",
            evidence = evidenceDetails
        )
    }
}
