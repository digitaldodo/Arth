package com.digitaldodo.arth

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONObject
import java.util.Locale

data class Candidate(
    val id: Long, val createdAt: Long, val packageName: String, val fingerprint: String,
    val amount: String?, val direction: String?, val merchant: String?, val date: String?, val time: String?,
    val method: String?, val reference: String?, val event: String, val confidence: Int,
    val origins: String, val state: String, val categoryId: String?, val necessity: String?, val txId: String?
)

class CandidateStore(context: Context) : SQLiteOpenHelper(context, "arth_detection.db", null, 1) {
    private val appContext = context.applicationContext
    private val ownerId get() = NativeAuth.userId(appContext)
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("""CREATE TABLE candidates (
            id INTEGER PRIMARY KEY AUTOINCREMENT, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
            owner_id TEXT NOT NULL, package_name TEXT NOT NULL, fingerprint TEXT NOT NULL, notification_hash TEXT NOT NULL, amount TEXT, direction TEXT,
            merchant TEXT, transaction_date TEXT, transaction_time TEXT, method TEXT, reference TEXT, event TEXT NOT NULL,
            confidence INTEGER NOT NULL, origins TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending',
            category_id TEXT, necessity TEXT, tx_id TEXT, payload TEXT
        )""".trimIndent())
        db.execSQL("CREATE INDEX candidate_state_created ON candidates(state, created_at DESC)")
    }
    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit

    @Synchronized fun insert(parsed: TransactionMessageParser.Parsed, packageName: String, notificationHash: String, retentionDays: Int): Long {
        val currentOwner = ownerId ?: return -1
        val eligible = parsed.event in setOf(TransactionMessageParser.Event.COMPLETED_DEBIT, TransactionMessageParser.Event.COMPLETED_CREDIT, TransactionMessageParser.Event.REFUND) ||
            (parsed.event == TransactionMessageParser.Event.UNKNOWN && parsed.potentialCandidate)
        val merchantKey = parsed.merchant?.lowercase(Locale.ROOT)?.replace(Regex("[^a-z0-9]"), "") ?: ""
        val fingerprint = if (parsed.reference != null) "ref:${parsed.reference.lowercase(Locale.ROOT)}" else if (parsed.amount != null && parsed.direction != null && parsed.date != null && merchantKey.isNotBlank())
            "txn:${parsed.amount}|${parsed.direction}|${parsed.date}|$merchantKey" else "notification:$notificationHash"
        val db = writableDatabase
        db.delete("candidates", "expires_at < ? AND state = 'pending'", arrayOf(System.currentTimeMillis().toString()))
        db.delete("candidates", "created_at < ? AND state IN ('saved','ignored')", arrayOf((System.currentTimeMillis() - 90L * 24 * 60 * 60 * 1000).toString()))
        var existingState: String? = null
        val existingNotification = db.rawQuery("SELECT id,state FROM candidates WHERE notification_hash=? AND owner_id=?", arrayOf(notificationHash, currentOwner)).use {
            if (it.moveToFirst()) { existingState = it.getString(1); it.getLong(0) } else -1L
        }
        if (existingNotification > 0) {
            if (existingState != "pending") return -1
            if (!eligible) {
                db.execSQL("UPDATE candidates SET state='ignored',event=?,amount=?,direction=?,merchant=?,transaction_date=?,transaction_time=?,method=?,reference=? WHERE id=?",
                    arrayOf(parsed.event.name, parsed.amount, parsed.direction, parsed.merchant, parsed.date, parsed.time, parsed.method, parsed.reference, existingNotification))
                return -1
            }
            if (parsed.reference != null && db.rawQuery(
                    "SELECT id FROM candidates WHERE fingerprint=? AND owner_id=? AND id<>?",
                    arrayOf(fingerprint, currentOwner, existingNotification.toString())
                ).use { it.moveToFirst() }) {
                db.execSQL("UPDATE candidates SET state='ignored' WHERE id=? AND state='pending'", arrayOf(existingNotification))
                return -1
            }
            db.execSQL("UPDATE candidates SET fingerprint=?,amount=?,direction=?,merchant=?,transaction_date=?,transaction_time=?,method=?,reference=?,event=?,confidence=?,origins=? WHERE id=?",
                arrayOf(fingerprint, parsed.amount, parsed.direction, parsed.merchant, parsed.date, parsed.time, parsed.method, parsed.reference, parsed.event.name, parsed.confidence, JSONObject(parsed.origins as Map<*, *>).toString(), existingNotification))
            return existingNotification
        }
        if (!eligible) return -1
        if (parsed.reference != null && db.rawQuery("SELECT id FROM candidates WHERE fingerprint = ? AND owner_id=?", arrayOf(fingerprint, currentOwner)).use { it.moveToFirst() }) return -1
        val now = System.currentTimeMillis()
        val values = android.content.ContentValues().apply {
            put("created_at", now); put("expires_at", now + retentionDays.coerceIn(7, 90) * 24L * 60 * 60 * 1000)
            put("owner_id", currentOwner); put("package_name", packageName); put("fingerprint", fingerprint); put("notification_hash", notificationHash); put("amount", parsed.amount)
            put("direction", parsed.direction); put("merchant", parsed.merchant); put("transaction_date", parsed.date); put("transaction_time", parsed.time)
            put("method", parsed.method); put("reference", parsed.reference); put("event", parsed.event.name)
            put("confidence", parsed.confidence); put("origins", JSONObject(parsed.origins as Map<*, *>).toString())
            put("state", "pending")
        }
        return db.insert("candidates", null, values)
    }

    @Synchronized fun pending(): List<Candidate> {
        val currentOwner = ownerId ?: return emptyList()
        val db = writableDatabase
        db.delete("candidates", "expires_at < ? AND state = 'pending'", arrayOf(System.currentTimeMillis().toString()))
        db.delete("candidates", "created_at < ? AND state IN ('saved','ignored')", arrayOf((System.currentTimeMillis() - 90L * 24 * 60 * 60 * 1000).toString()))
        return db.rawQuery("SELECT * FROM candidates WHERE state='pending' AND owner_id=? ORDER BY created_at DESC", arrayOf(currentOwner)).use { c ->
            buildList { while (c.moveToNext()) add(Candidate(
                c.getLong(c.getColumnIndexOrThrow("id")), c.getLong(c.getColumnIndexOrThrow("created_at")),
                c.getString(c.getColumnIndexOrThrow("package_name")), c.getString(c.getColumnIndexOrThrow("fingerprint")),
                c.getString(c.getColumnIndexOrThrow("amount")), c.getString(c.getColumnIndexOrThrow("direction")),
                c.getString(c.getColumnIndexOrThrow("merchant")), c.getString(c.getColumnIndexOrThrow("transaction_date")), c.getString(c.getColumnIndexOrThrow("transaction_time")),
                c.getString(c.getColumnIndexOrThrow("method")), c.getString(c.getColumnIndexOrThrow("reference")),
                c.getString(c.getColumnIndexOrThrow("event")), c.getInt(c.getColumnIndexOrThrow("confidence")),
                c.getString(c.getColumnIndexOrThrow("origins")), c.getString(c.getColumnIndexOrThrow("state")),
                c.getString(c.getColumnIndexOrThrow("category_id")), c.getString(c.getColumnIndexOrThrow("necessity")),
                c.getString(c.getColumnIndexOrThrow("tx_id")))) }
        }
    }

    @Synchronized fun candidate(id: Long): Candidate? = pending().firstOrNull { it.id == id }

    @Synchronized fun ignore(id: Long) { ownerId?.let { writableDatabase.execSQL("UPDATE candidates SET state='ignored' WHERE id=? AND state='pending' AND owner_id=?", arrayOf(id, it)) } }

    @Synchronized fun confirm(id: Long, payload: JSONObject, userSupplied: Set<String>): Boolean {
        val txId = payload.optString("id")
        if (txId.isBlank()) return false
        val values = android.content.ContentValues().apply {
            put("state", "queued"); put("tx_id", txId); put("payload", payload.toString())
            put("amount", payload.optString("amount")); put("direction", payload.optString("type"))
            put("merchant", payload.optString("description")); put("transaction_date", payload.optString("transaction_date"))
            put("category_id", payload.optString("category_id")); put("necessity", payload.optString("necessity"))
        }
        candidate(id)?.let { previous ->
            val origins = runCatching { JSONObject(previous.origins) }.getOrDefault(JSONObject())
            userSupplied.forEach { origins.put(it, "user") }
            values.put("origins", origins.toString())
        }
        val currentOwner = ownerId ?: return false
        return writableDatabase.update("candidates", values, "id=? AND state='pending' AND owner_id=?", arrayOf(id.toString(), currentOwner)) == 1
    }

    @Synchronized fun queued(): List<Pair<Long, String>> {
        val currentOwner = ownerId ?: return emptyList()
        return writableDatabase.rawQuery("SELECT id,payload FROM candidates WHERE state='queued' AND owner_id=? ORDER BY created_at", arrayOf(currentOwner)).use { c ->
        buildList { while (c.moveToNext()) add(c.getLong(0) to c.getString(1)) }
        }
    }
    @Synchronized fun complete(id: Long) { ownerId?.let { writableDatabase.execSQL("UPDATE candidates SET state='saved',payload=NULL WHERE id=? AND state='queued' AND owner_id=?", arrayOf(id, it)) } }
    @Synchronized fun clearPending() { ownerId?.let { writableDatabase.delete("candidates", "state='pending' AND owner_id=?", arrayOf(it)) } }
    @Synchronized fun countPending(): Int = pending().size
    @Synchronized fun queuedSummaries(): List<String> {
        val currentOwner = ownerId ?: return emptyList()
        return writableDatabase.rawQuery("SELECT amount,merchant,transaction_date FROM candidates WHERE state='queued' AND owner_id=?", arrayOf(currentOwner)).use { c ->
        buildList { while (c.moveToNext()) add(listOfNotNull(c.getString(0)?.let { "₹$it" }, c.getString(1), c.getString(2)).joinToString(" · ")) }
        }
    }
    @Synchronized fun hasPossibleMatch(candidate: Candidate): Boolean {
        if (candidate.amount == null || candidate.date == null || candidate.direction == null) return false
        val currentOwner = ownerId ?: return false
        return writableDatabase.rawQuery(
            "SELECT id FROM candidates WHERE id<>? AND owner_id=? AND amount=? AND transaction_date=? AND direction=? AND state IN ('pending','queued','saved') LIMIT 1",
            arrayOf(candidate.id.toString(), currentOwner, candidate.amount, candidate.date, candidate.direction)
        ).use { it.moveToFirst() }
    }
}
