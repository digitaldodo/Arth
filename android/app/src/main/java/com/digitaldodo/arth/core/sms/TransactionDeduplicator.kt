package com.digitaldodo.arth.core.sms

import com.digitaldodo.arth.core.database.SmsSuggestionEntity
import com.digitaldodo.arth.core.database.TransactionEntity
import com.digitaldodo.arth.core.model.DuplicateStatus
import com.digitaldodo.arth.core.model.TransactionType
import java.util.Locale
import kotlin.math.abs

/**
 * Cross-source deterministic deduplication across SMS broadcasts, banking/UPI notifications,
 * Android Share imports, and existing ledger transactions.
 *
 * Rules:
 * 1. Exact UTR / RRN / Bank Ref match always deduplicates.
 * 2. Without matching refs, only merge across tight time window when BOTH amount and direction match
 *    AND merchants are compatible (or one channel omitted merchant/ref while another carried it).
 *    Distinct merchants (e.g. "Swiggy" vs "Zomato") at identical amounts are NEVER merged.
 */
object TransactionDeduplicator {
    const val CROSS_SOURCE_WINDOW_MILLIS = 5 * 60 * 1000L // 5 minutes

    sealed class CandidateDecision {
        object InsertNew : CandidateDecision()
        data class MergeIntoExisting(val mergedEntity: SmsSuggestionEntity) : CandidateDecision()
        object SkipDuplicate : CandidateDecision()
    }

    fun evaluatePendingSuggestion(
        incoming: SmsSuggestionEntity,
        exactRefMatch: SmsSuggestionEntity?,
        nearbyAmountMatches: List<SmsSuggestionEntity>
    ): CandidateDecision {
        if (exactRefMatch != null) {
            return CandidateDecision.SkipDuplicate
        }

        val compatibleMatch = nearbyAmountMatches.firstOrNull { existing ->
            isCompatibleCandidate(existing, incoming)
        } ?: return CandidateDecision.InsertNew

        // If the existing suggestion is still PENDING and incoming adds richer metadata (e.g. Bank SMS UTR), enrich it.
        if (compatibleMatch.status == "PENDING" && needsEnrichment(compatibleMatch, incoming)) {
            val enriched = compatibleMatch.copy(
                refNumber = compatibleMatch.refNumber ?: incoming.refNumber,
                bank = compatibleMatch.bank ?: incoming.bank,
                accountMask = compatibleMatch.accountMask ?: incoming.accountMask,
                balancePaise = compatibleMatch.balancePaise ?: incoming.balancePaise,
                merchant = compatibleMatch.merchant ?: incoming.merchant,
                confidence = maxOf(compatibleMatch.confidence, incoming.confidence)
            )
            return CandidateDecision.MergeIntoExisting(enriched)
        }

        return CandidateDecision.SkipDuplicate
    }

    fun evaluateLedgerDuplicate(
        amountPaise: Long,
        type: TransactionType,
        merchant: String?,
        refNumber: String?,
        timestamp: Long,
        refMatchedTx: TransactionEntity?,
        amountMatchedTxs: List<TransactionEntity>
    ): Pair<String, String?> {
        if (refMatchedTx != null) {
            return DuplicateStatus.POTENTIAL_DUPLICATE.name to refMatchedTx.id
        }
        val matched = amountMatchedTxs.firstOrNull { tx ->
            val txTypeMatches = tx.type.equals(type.name, ignoreCase = true)
            val txTimeClose = abs(tx.transactionDate - timestamp) <= 24L * 60L * 60L * 1000L
            txTypeMatches && txTimeClose && merchantsCompatibleOrMissing(tx.counterparty, merchant)
        }
        return if (matched != null) {
            DuplicateStatus.POTENTIAL_DUPLICATE.name to matched.id
        } else {
            DuplicateStatus.UNIQUE.name to null
        }
    }

    fun isCompatibleCandidate(existing: SmsSuggestionEntity, incoming: SmsSuggestionEntity): Boolean {
        if (existing.amountPaise != incoming.amountPaise) return false
        if (!existing.type.equals(incoming.type, ignoreCase = true)) return false
        if (abs(existing.smsTimestamp - incoming.smsTimestamp) > CROSS_SOURCE_WINDOW_MILLIS) return false

        if (!existing.refNumber.isNullOrBlank() && !incoming.refNumber.isNullOrBlank()) {
            return existing.refNumber.equals(incoming.refNumber, ignoreCase = true)
        }

        return merchantsCompatibleOrMissing(existing.merchant, incoming.merchant)
    }

    fun merchantsCompatibleOrMissing(a: String?, b: String?): Boolean {
        val normA = normalizeMerchant(a)
        val normB = normalizeMerchant(b)
        if (normA.isBlank() || normB.isBlank()) return true
        return normA == normB || normA.contains(normB) || normB.contains(normA)
    }

    private fun needsEnrichment(existing: SmsSuggestionEntity, incoming: SmsSuggestionEntity): Boolean {
        return (existing.refNumber.isNullOrBlank() && !incoming.refNumber.isNullOrBlank()) ||
            (existing.bank.isNullOrBlank() && !incoming.bank.isNullOrBlank()) ||
            (existing.accountMask.isNullOrBlank() && !incoming.accountMask.isNullOrBlank()) ||
            (existing.balancePaise == null && incoming.balancePaise != null) ||
            (existing.merchant.isNullOrBlank() && !incoming.merchant.isNullOrBlank())
    }

    private fun normalizeMerchant(raw: String?): String {
        return raw.orEmpty()
            .lowercase(Locale.ROOT)
            .replace(Regex("[^a-z0-9]"), "")
    }
}
