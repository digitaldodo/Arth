package com.digitaldodo.arth

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.Build
import android.provider.Settings
import android.view.View
import android.view.ViewGroup
import android.widget.*
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.concurrent.Executors

class DetectionActivity : Activity() {
    private val executor = Executors.newSingleThreadExecutor()
    private lateinit var root: LinearLayout
    private val prefs by lazy { getSharedPreferences("detection", MODE_PRIVATE) }
    private val store by lazy { CandidateStore(this) }
    private val categoryPrefs by lazy { getSharedPreferences("arth_categories", MODE_PRIVATE) }
    private var hasResumed = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        render()
        intent.getLongExtra("candidate_id", -1).takeIf { it > 0 }?.let { id ->
            store.candidate(id)?.let(::showReview)
        }
    }

    override fun onResume() {
        super.onResume()
        if (hasResumed) render() else hasResumed = true
    }

    private fun render() {
        root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(24), dp(20), dp(24))
            setBackgroundColor(if (isDark()) 0xFF0C0A09.toInt() else 0xFFFBFBF9.toInt())
        }
        val scroll = ScrollView(this).apply { addView(root) }
        setContentView(scroll)
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            view.setPadding(dp(20), dp(24) + bars.top, dp(20), dp(24) + bars.bottom)
            insets
        }
        ViewCompat.requestApplyInsets(root)
        root.addView(label("Arth · Transaction detection", 24f, true))
        root.addView(label("Notifications from apps you choose are parsed on this device. Detected items stay pending until you review and confirm them.", 14f))

        if (!NativeAuth.signedIn(this)) {
            root.addView(label("Sign in to your Arth account", 18f, true))
            val email = field("Email address").apply { inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS }
            val password = field("Password").apply { inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD }
            root.addView(email); root.addView(password)
            root.addView(button("Sign in securely") {
                val e = email.text.toString().trim(); val p = password.text.toString()
                if (e.isBlank() || p.isBlank()) { toast("Enter your email and password."); return@button }
                it.isEnabled = false
                executor.execute {
                    runCatching { NativeAuth.login(this, e, p); loadCategories() }.onSuccess {
                        runOnUiThread { toast("Signed in to Arth."); render() }
                        queueSync()
                    }.onFailure { err -> runOnUiThread { it.isEnabled = true; toast(err.message ?: "Sign-in failed.") } }
                }
            })
            root.addView(label("Your password is sent only to Supabase Auth over HTTPS. It is not stored. Session tokens are encrypted with the Android Keystore.", 12f))
        } else {
            root.addView(label("Signed in to Arth", 14f, true))
            root.addView(button("Refresh categories for offline review") {
                executor.execute { loadCategories(); runOnUiThread { toast("Category list refreshed.") } }
            })
            root.addView(button("Sign out") { prefs.edit().putBoolean("enabled", false).apply(); NativeAuth.clear(this); render() })
        }

        val enabled = prefs.getBoolean("enabled", false)
        val access = listenerAccessEnabled()
        val connected = prefs.getBoolean("listener_connected", false)
        val alertsEnabled = alertsEnabled()
        val status = when {
            !enabled -> "Off"
            !access -> "Unavailable · notification access revoked or not granted"
            !alertsEnabled -> "Monitoring enabled · Arth alerts are blocked"
            connected -> "On · notification listener connected"
            else -> "On · access granted; waiting for Android listener"
        }
        root.addView(label("Monitoring status: $status", 15f, true))
        root.addView(label("Notification access lets Arth inspect notifications only from apps you select below. The separate alert permission lets Arth show private review alerts. Arth does not read the SMS inbox. Hidden or disabled source notifications and unsupported app formats cannot be detected.", 13f))
        root.addView(button(if (alertsEnabled) "Open Arth alert settings" else "Enable transaction review alerts") {
            if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), NOTIFICATION_PERMISSION_REQUEST)
            } else {
                openAppNotificationSettings()
            }
        })
        root.addView(button("Open Android app notification settings") {
            openAppNotificationSettings()
        })
        root.addView(button("Open notification access settings") {
            startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
        })
        root.addView(button(if (enabled) "Disable automatic detection" else "Enable automatic detection") {
            if (!enabled && !access) {
                toast("Grant Arth notification access in Android settings, then enable detection.")
                startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
            } else if (!enabled && !NativeAuth.signedIn(this)) {
                toast("Sign in to Arth before enabling detection.")
            } else if (!enabled && !alertsEnabled()) {
                toast("Allow Arth review alerts before enabling detection.")
            } else {
                prefs.edit().putBoolean("enabled", !enabled).apply()
                if (!enabled) { try { stopService(Intent(this, FinancialNotificationListener::class.java)) } catch (_: Exception) { } }
                render()
            }
        })

        root.addView(label("Choose notification sources", 18f, true))
        root.addView(label("Apps shown here are launchable apps on this device. Select only your bank, payment, wallet, or SMS apps. Availability and notification content vary by app.", 13f))
        val selected = prefs.getStringSet("allowed_packages", emptySet()).orEmpty()
        installedApps().forEach { app ->
            root.addView(CheckBox(this).apply {
                text = app.label
                isChecked = app.packageName in selected
                setOnCheckedChangeListener { _, checked ->
                    val next = prefs.getStringSet("allowed_packages", emptySet()).orEmpty().toMutableSet()
                    if (checked) next.add(app.packageName) else next.remove(app.packageName)
                    prefs.edit().putStringSet("allowed_packages", next).apply()
                }
            })
        }
        val privateAlerts = CheckBox(this).apply {
            text = "Hide merchant and amount on the lock screen"
            isChecked = prefs.getBoolean("private_alerts", true)
            setOnCheckedChangeListener { _, checked -> prefs.edit().putBoolean("private_alerts", checked).apply() }
        }
        root.addView(privateAlerts)
        root.addView(button("Pending candidate expiry · ${prefs.getInt("retention_days", 30)} days") {
            val choices = arrayOf("7 days", "30 days", "90 days")
            val days = intArrayOf(7, 30, 90)
            val current = days.indexOf(prefs.getInt("retention_days", 30)).coerceAtLeast(0)
            AlertDialog.Builder(this).setTitle("Remove unreviewed candidates after")
                .setSingleChoiceItems(choices, current) { dialog, which ->
                    prefs.edit().putInt("retention_days", days[which]).apply()
                    dialog.dismiss(); render()
                }.setNegativeButton("Cancel", null).show()
        })

        root.addView(label("Pending review · ${store.countPending()}", 19f, true))
        store.pending().forEach { candidate ->
            val summary = listOfNotNull(candidate.amount?.let { "₹$it" }, candidate.merchant, candidate.date, candidate.event.lowercase().replace('_', ' ')).joinToString(" · ")
            root.addView(button("${summary.ifBlank { "Transaction details need review" }}\nReview transaction") { showReview(candidate) })
        }
        if (store.countPending() == 0) root.addView(label("No transactions waiting for review.", 14f))
        store.queuedSummaries().forEach { summary -> root.addView(label("Confirmed · waiting to sync${if (summary.isBlank()) "" else " · $summary"}", 13f)) }
        root.addView(button("Clear pending candidates") {
            AlertDialog.Builder(this).setMessage("Clear all pending detections from this device?")
                .setNegativeButton("Cancel", null).setPositiveButton("Clear") { _, _ -> store.clearPending(); render() }.show()
        })
        root.addView(button("Open Arth") {
            startActivity(Intent(this, com.google.androidbrowserhelper.trusted.LauncherActivity::class.java))
        })
    }

    private data class AppChoice(val packageName: String, val label: String)
    private fun installedApps(): List<AppChoice> {
        val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        return packageManager.queryIntentActivities(intent, 0).mapNotNull {
            val pkg = it.activityInfo?.packageName ?: return@mapNotNull null
            if (pkg == packageName) return@mapNotNull null
            AppChoice(pkg, it.loadLabel(packageManager).toString())
        }.distinctBy { it.packageName }.sortedBy { it.label.lowercase(Locale.ROOT) }
    }

    private fun listenerAccessEnabled(): Boolean {
        val current = Settings.Secure.getString(contentResolver, "enabled_notification_listeners").orEmpty()
        return current.split(':').mapNotNull { ComponentName.unflattenFromString(it) }
            .any { it.packageName == packageName && it.className == FinancialNotificationListener::class.java.name }
    }

    private fun openAppNotificationSettings() {
        val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
        } else {
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, android.net.Uri.fromParts("package", packageName, null))
        }
        runCatching { startActivity(intent) }.onFailure { toast("Open Arth’s notification settings from Android Settings.") }
    }

    private fun alertsEnabled(): Boolean {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false
        if (!NotificationManagerCompat.from(this).areNotificationsEnabled()) return false
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = getSystemService(NotificationManager::class.java).getNotificationChannel("transaction_reviews")
            if (channel != null && channel.importance == NotificationManager.IMPORTANCE_NONE) return false
        }
        return true
    }

    private fun showReview(c: Candidate) {
        val panel = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(22), dp(8), dp(22), dp(4)) }
        val amount = field("Amount in INR").apply { setText(c.amount.orEmpty()); inputType = android.text.InputType.TYPE_CLASS_NUMBER or android.text.InputType.TYPE_NUMBER_FLAG_DECIMAL }
        val merchant = field("Merchant or description").apply { setText(c.merchant.orEmpty()) }
        val date = field("Date · YYYY-MM-DD").apply { setText(c.date.orEmpty()) }
        val direction = spinner(listOf("Select transaction type", "Expense", "Income"), when (c.direction) { "expense" -> 1; "income" -> 2; else -> 0 })
        val method = spinner(listOf("Online", "Cash"), if (c.method.equals("cash", true)) 1 else 0)
        val cats = cachedCategories(if (c.direction == "income") "income" else "expense")
        val category = Spinner(this).apply { adapter = ArrayAdapter(this@DetectionActivity, android.R.layout.simple_spinner_dropdown_item, cats.map { it.second.ifBlank { "Choose category" } }) }
        category.tag = cats
        direction.onItemSelectedListener = object : android.widget.AdapterView.OnItemSelectedListener {
            override fun onNothingSelected(parent: android.widget.AdapterView<*>?) = Unit
            override fun onItemSelected(parent: android.widget.AdapterView<*>?, view: View?, position: Int, id: Long) {
                val options = cachedCategories(if (position == 2) "income" else "expense")
                category.adapter = ArrayAdapter(this@DetectionActivity, android.R.layout.simple_spinner_dropdown_item, options.map { it.second })
                category.tag = options
            }
        }
        val necessity = spinner(listOf("Select necessity", "Essential", "Optional", "Luxury"), 0)
        panel.addView(label("Check extracted fields and correct anything uncertain. Event: ${c.event.lowercase().replace('_', ' ')} · confidence ${c.confidence}%", 13f))
        val provenance = runCatching { JSONObject(c.origins) }.getOrDefault(JSONObject())
        val provenanceText = provenance.keys().asSequence().map { "$it: ${provenance.optString(it)}" }.joinToString(" · ")
        c.time?.let { panel.addView(label("Time available · $it (${provenance.optString("time", "notification time")})", 12f)) }
        if (provenanceText.isNotBlank()) panel.addView(label("Field sources · $provenanceText. Changes are marked as user-supplied.", 12f))
        panel.addView(amount); panel.addView(merchant); panel.addView(date); panel.addView(label("Type", 12f)); panel.addView(direction)
        panel.addView(label("Payment method", 12f)); panel.addView(method)
        panel.addView(label("Category", 12f)); panel.addView(category)
        panel.addView(label("Necessity (expenses)", 12f)); panel.addView(necessity)
        val possibleMatch = store.hasPossibleMatch(c)
        val canCheckLedger = c.amount != null && c.date != null && c.direction != null
        val matchWarning = label(if (canCheckLedger) "Checking for a possible match in your Arth ledger…" else "This event is ambiguous. Check your ledger before confirming.", 13f).apply { visibility = View.VISIBLE }
        panel.addView(matchWarning)
        if (possibleMatch) {
            matchWarning.text = "Possible match: another local detection has the same amount, date, and direction. Review before saving."
            matchWarning.visibility = View.VISIBLE
        }
        val scroll = ScrollView(this).apply { addView(panel) }
        val dialog = AlertDialog.Builder(this).setTitle("Review transaction").setView(scroll)
            .setNegativeButton("Ignore") { _, _ -> store.ignore(c.id); render() }
            .setNeutralButton("Cancel", null)
            .setPositiveButton("Confirm and add", null).create()
        dialog.setOnShowListener {
            if (!possibleMatch && canCheckLedger && NativeAuth.signedIn(this)) {
                executor.execute {
                    val matchCheck = runCatching {
                        val token = NativeAuth.freshAccess(this)
                        val query = "?page=1&page_size=100&type=${c.direction}&start_date=${c.date}&end_date=${c.date}"
                        val response = NativeAuth.request("${BuildConfig.API_URL.trimEnd('/')}/api/native/transactions$query", BuildConfig.SUPABASE_ANON_KEY, token, null)
                        val items = response.optJSONArray("items") ?: JSONArray()
                        (0 until items.length()).any { index ->
                            val item = items.getJSONObject(index)
                            val existingAmount = runCatching { java.math.BigDecimal(item.optString("amount_decimal")).setScale(2).toPlainString() }.getOrNull()
                            val exactReference = c.reference != null && item.optString("notes").contains(c.reference, ignoreCase = true)
                            exactReference || (item.optString("transaction_date") == c.date && existingAmount == c.amount && item.optString("type") == c.direction)
                        }
                    }
                    runOnUiThread {
                        when {
                            matchCheck.isFailure -> {
                                matchWarning.text = "Could not check the ledger while offline. Check manually before confirming."
                                matchWarning.visibility = View.VISIBLE
                            }
                            matchCheck.getOrDefault(false) -> {
                                matchWarning.text = "Possible match in your Arth ledger: same transaction date, amount, and direction. Confirm only if this is a separate transaction."
                                matchWarning.visibility = View.VISIBLE
                            }
                            else -> matchWarning.visibility = View.GONE
                        }
                    }
                }
            }
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val selectedType = when (direction.selectedItemPosition) { 1 -> "expense"; 2 -> "income"; else -> null }
                val selectedCategories = selectedType?.let(::cachedCategories).orEmpty()
                val selectedCategory = selectedCategories.getOrNull(category.selectedItemPosition)
                val selectedNecessity = when (necessity.selectedItemPosition) { 1 -> "essential"; 2 -> "optional"; 3 -> "luxury"; else -> null }
                val amountText = amount.text.toString().trim()
                val dateText = date.text.toString().trim()
                val parsedAmount = runCatching { java.math.BigDecimal(amountText).setScale(2, java.math.RoundingMode.UNNECESSARY).takeIf { it.signum() > 0 } }.getOrNull()
                if (parsedAmount == null || merchant.text.isNullOrBlank() || !dateText.matches(Regex("\\d{4}-\\d{2}-\\d{2}")) || !isCalendarDate(dateText) || selectedType == null || selectedCategory == null ||
                    (selectedType == "expense" && selectedNecessity == null)) {
                    toast("Fill in the amount, merchant, valid date, transaction type, category${if (selectedType == "expense") ", and necessity" else ""}.")
                    return@setOnClickListener
                }
                val txId = uuidV7()
                val payload = JSONObject().put("id", txId).put("amount", parsedAmount.toPlainString())
                    .put("type", selectedType).put("category_id", selectedCategory.first).put("transaction_date", dateText)
                    .put("payment_method", if (method.selectedItemPosition == 1) "cash" else "online")
                    .put("necessity", if (selectedType == "expense") selectedNecessity else JSONObject.NULL)
                    .put("description", merchant.text.toString().trim())
                    .put("notes", "Confirmed from local notification review (${c.event.lowercase().replace('_', ' ')})${c.time?.let { "; time ${it} (${provenance.optString("time", "notification time")})"}.orEmpty()}${c.reference?.let { "; provider reference $it"}.orEmpty()}.")
                val userSupplied = buildSet {
                    if (amountText != c.amount) add("amount")
                    if (merchant.text.toString().trim() != c.merchant) add("merchant")
                    if (dateText != c.date) add("date")
                    if (selectedType != c.direction) add("direction")
                    add("category"); add("necessity"); add("payment_method")
                }
                if (store.confirm(c.id, payload, userSupplied)) {
                    queueSync()
                    dialog.dismiss()
                    toast("Confirmed. Arth will sync this transaction when connected.")
                    render()
                } else toast("This candidate is no longer pending.")
            }
        }
        dialog.show()
    }

    private fun loadCategories() {
        runCatching {
            val token = NativeAuth.freshAccess(this)
            val response = NativeAuth.request("${BuildConfig.API_URL.trimEnd('/')}/api/native/categories", BuildConfig.SUPABASE_ANON_KEY, token, null)
            val array = response.optJSONArray("categories") ?: JSONArray()
            val serialized = JSONArray()
            for (i in 0 until array.length()) {
                val x = array.getJSONObject(i)
                serialized.put(JSONObject().put("id", x.getString("id")).put("name", x.getString("name")).put("type", x.getString("type")).put("archived_at", x.optString("archived_at")))
            }
            categoryPrefs.edit().putString("categories", serialized.toString()).apply()
        }
    }
    private fun cachedCategories(type: String): List<Pair<String, String>> {
        val result = mutableListOf<Pair<String, String>>()
        val array = runCatching { JSONArray(categoryPrefs.getString("categories", "[]")) }.getOrDefault(JSONArray())
        for (i in 0 until array.length()) runCatching {
            val c = array.getJSONObject(i)
            if (c.optString("type") == type && c.optString("archived_at") in listOf("", "null")) result += c.getString("id") to c.getString("name")
        }
        return result
    }

    private fun queueSync() {
        val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
        val request = OneTimeWorkRequestBuilder<ConfirmedTransactionSyncWorker>().setConstraints(constraints).build()
        WorkManager.getInstance(this).enqueueUniqueWork("arth-confirmed-transaction-sync", ExistingWorkPolicy.APPEND_OR_REPLACE, request)
    }

    private fun uuidV7(): String {
        val bytes = ByteArray(16).also { java.security.SecureRandom().nextBytes(it) }
        val now = System.currentTimeMillis()
        for (i in 5 downTo 0) { bytes[i] = (now ushr ((5 - i) * 8)).toByte() }
        bytes[6] = ((bytes[6].toInt() and 0x0f) or 0x70).toByte()
        bytes[8] = ((bytes[8].toInt() and 0x3f) or 0x80).toByte()
        val hex = bytes.joinToString("") { "%02x".format(it) }
        return "${hex.substring(0,8)}-${hex.substring(8,12)}-${hex.substring(12,16)}-${hex.substring(16,20)}-${hex.substring(20)}"
    }

    private fun field(hint: String) = EditText(this).apply { this.hint = hint; textSize = 15f; singleLine = true }
    private fun spinner(items: List<String>, selected: Int) = Spinner(this).apply {
        adapter = ArrayAdapter(this@DetectionActivity, android.R.layout.simple_spinner_dropdown_item, items)
        setSelection(selected)
    }
    private fun label(text: String, size: Float, bold: Boolean = false) = TextView(this).apply {
        this.text = text; textSize = size; setTextColor(if (isDark()) 0xFFF5F5F4.toInt() else 0xFF1C1917.toInt()); if (bold) setTypeface(typeface, android.graphics.Typeface.BOLD)
        setPadding(0, dp(10), 0, dp(8))
    }
    private fun button(text: String, action: (Button) -> Unit) = Button(this).apply {
        this.text = text; minHeight = dp(48); isAllCaps = false; setOnClickListener { action(this) }
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { bottomMargin = dp(8) }
    }
    private fun toast(message: String) = Toast.makeText(this, message, Toast.LENGTH_LONG).show()
    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()
    private fun isDark() = (resources.configuration.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK) == android.content.res.Configuration.UI_MODE_NIGHT_YES
    private fun isCalendarDate(value: String) = runCatching {
        val parser = SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).apply { isLenient = false }
        val date = parser.parse(value)
        date != null && parser.format(date) == value
    }.getOrDefault(false)

    companion object { private const val NOTIFICATION_PERMISSION_REQUEST = 2001 }
}
