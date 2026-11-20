# SpendSense Automatic SMS & Financial Notification Architecture

## 1. Overview & Regulatory Context

Automatic SMS capture is a core product capability of the SpendSense Android application. In India, SMS and push notifications serve as the primary real-time notification mechanism for UPI transactions, debit/credit card swipes, NEFT/RTGS/IMPS transfers, and ATM withdrawals.

SpendSense implements a robust, privacy-first, on-device capture pipeline that operates in the background, extracts structured financial events, executes local ML categorization, and queues transactions for user review or auto-confirmation.

```
+-----------------------------------------------------------------------------------------------+
|                                  INCOMING HARDWARE / OS EVENTS                                |
+-------------------------------+-------------------------------+-------------------------------+
|    Telephony SMS Broadcast   |   Historical SMS ContentResolver|    Banking App Push Notification|
|    (android.provider.SMS_REC) |   (Telephony.Sms.CONTENT_URI) |   (NotificationListenerService)|
+---------------+---------------+---------------+---------------+---------------+---------------+
                |                               |                               |
                +-------------------------------+-------------------------------+
                                                |
                                                v
+-----------------------------------------------------------------------------------------------+
|                                   PRIVACY & SECURITY GATEWAY                                  |
|  [1] Sender ID Validation: Trai 6-char alpha headers (e.g., AD-HDFCBK, BP-ICICIB, AX-KOTAKB)   |
|  [2] OTP Exclusion Filter: Discards strings containing "OTP", "verification code", "valid for" |
|  [3] Non-Transactional Filter: Rejects balance inquiries, bill promos, and personal SMS       |
+-----------------------------------------------+-----------------------------------------------+
                                                | (Passed financial message)
                                                v
+-----------------------------------------------------------------------------------------------+
|                                 NATIVE INDIAN PARSER PIPELINE                                 |
|  - Amount Regex: INR / Rs. / Re / ₹ followed by commas/decimals -> strict integer paise      |
|  - Direction Classifier: "debited", "spent", "paid" -> DEBIT; "credited", "refund" -> CREDIT  |
|  - Account Identification: "A/C **1234", "Card ending 5678" -> Last-4 digits extraction      |
|  - Reference Matcher: UTR, UPI Ref, RRN, IMPS Ref extraction (12-digit UPI reference ID)      |
|  - Counterparty Extraction: "at <Merchant>", "to <VPA>", "VPA <id>@okaxis"                  |
+-----------------------------------------------+-----------------------------------------------+
                                                |
                                                v
+-----------------------------------------------------------------------------------------------+
|                             ON-DEVICE INDIAN CATEGORIZATION ENGINE                            |
|  (com.digitaldodo.arth.core.sms.IndianCategorizationEngine)                                   |
|  - FastText subword matching & contextual regex heuristics                                    |
|  - SharedPreferences user feedback memory (spendsense_category_feedback_v1)                   |
|  - Emits: Category ID, Confidence Score (0.0 to 1.0), Decision Evidence List                  |
+-----------------------------------------------+-----------------------------------------------+
                                                |
                                                v
+-----------------------------------------------------------------------------------------------+
|                            SMS SUGGESTION REPOSITORY & LEDGER SYNC                            |
|  - Idempotent deduplication against existing transactions and suggestions                     |
|  - Auto-confirm eligible high-confidence transactions OR display high-priority notification   |
|  - Inserts to SQLite Room DB with ingestion_source = 'sms' | 'notification' | 'message_share'  |
|  - Replicates to backend via durable Outbox event queue                                       |
+-----------------------------------------------------------------------------------------------+
```

---

## 2. Android Permission & Security Architecture

### 2.1 Android Hard-Restricted Permission Boundary
Starting with Android 10 (API 29), Google classifies `READ_SMS` and `RECEIVE_SMS` as **hard-restricted permissions**. 
If an APK is installed via web browser or sideloading, the default Android package installer blocks the grant of these permissions, marking them as `RESTRICTION_WIFI_RESTRICTED` or `RESTRICTION_HIDE_PERMISSIONS`.

### 2.2 SpendSense Standalone Installer Architecture
SpendSense solves this problem cleanly without bypassing Android security policies through its dedicated standalone companion app: `SpendSense Installer` (`android/installer`):
1. **PackageInstaller Session Management**:
   The installer creates a native `PackageInstaller.Session` using `SessionParams(MODE_FULL_INSTALL)`.
2. **Permission Whitelisting**:
   Before committing the APK stream, the installer invokes:
   ```kotlin
   sessionParams.setWhitelistedRestrictedPermissions(
       setOf(
           Manifest.permission.READ_SMS,
           Manifest.permission.RECEIVE_SMS
       )
   )
   ```
3. **Verified APK Installation**:
   When SpendSense is installed or updated via SpendSense Installer, the Android system marks the restricted SMS permissions as allowlisted. The user can then grant runtime permission normally via the standard system runtime permission prompt (`ActivityResultContracts.RequestMultiplePermissions`).

---

## 3. On-Device Indian SMS Parser Engine

The native parser (`com.digitaldodo.arth.core.sms.SmsParser`) processes SMS text with high precision:

### 3.1 Financial Sender Identification
TRAI regulations mandate that commercial and transactional SMS headers consist of a 2-character provider prefix (e.g., `AD`, `BZ`, `VM`) followed by a hyphen and a 6-character bank identifier. SpendSense maintains a regex allowlist:
```kotlin
private val BANK_SENDER_PATTERN = Regex("^[A-Za-z]{2}-[A-Za-z0-9]{6}$", RegexOption.IGNORE_CASE)
```
Known financial sender identifiers include:
- `HDFCBK`, `ICICIB`, `SBIINB`, `AXISBK`, `KOTAKB`, `INDBNK`, `YESBNK`, `PNBSMS`, `BOISMS`, `CANBNK`
- UPI apps: `GPAYIN`, `PHNPAY`, `PAYTM`, `CREDCL`, `AMZPAY`

### 3.2 Privacy & Security Exclusion Filters
1. **OTP & Verification Filter**:
   Any message matching the following is dropped immediately from memory:
   ```kotlin
   private val OTP_PATTERN = Regex(
       "\\b(otp|one\\s*time\\s*password|verification\\s*code|auth\\s*code|secret\\s*code|is\\s*valid\\s*for|do\\s*not\\s*share)\\b",
       RegexOption.IGNORE_CASE
   )
   ```
2. **Balance Only Inquiries**:
   Messages detailing current balance without debits or credits (e.g., *"Available balance in A/C XX1234 is Rs. 45,200.00"*) are recorded for account reconciliation but excluded from transaction ledger imports.

### 3.3 Amount & Money Representation
Currency matches are converted directly to 64-bit integer paise (`Long`):
```kotlin
fun parseAmountPaise(raw: String): Long {
    val clean = raw.replace(",", "").trim()
    val parts = clean.split(".")
    val rupees = parts[0].toLong()
    val paise = if (parts.size > 1) {
        val decimals = parts[1].padEnd(2, '0').take(2)
        decimals.toLong()
    } else 0L
    return (rupees * 100L) + paise
}
```

### 3.4 Counterparty & Merchant Extraction
Merchant names are extracted via prepositional patterns:
- `"at (.*?) on"` -> e.g., *"spent Rs 450 at STARBUCKS on 20-Nov"* -> Counterparty: `STARBUCKS`
- `"to VPA (.*?) on"` -> e.g., *"sent Rs 1200 to VPA swiggy@icici on"* -> Counterparty: `swiggy`
- `"transferred to (.*?) ref"` -> e.g., *"transferred to Ramesh Kumar ref"* -> Counterparty: `Ramesh Kumar`

---

## 4. Background Processing & Notification Listener

### 4.1 Real-Time Broadcast Receiver
`SmsBroadcastReceiver` runs on `android.provider.Telephony.SMS_RECEIVED`. 
- When an SMS arrives, the broadcast receiver processes the PDU array using `Telephony.Sms.Intents.getMessagesFromIntent(intent)`.
- If recognized as a financial transaction, it triggers a coroutine in `SmsSuggestionRepository`.
- If confidence exceeds auto-confirm threshold (configured in user settings), it directly writes to `TransactionRepository` and issues an informational notification.
- Otherwise, it emits a reviewable `PendingSmsSuggestion` notification with action buttons: `[Confirm ₹450 as Food & Dining]` or `[Edit]`.

### 4.2 Historical SMS Scanning
Under the "Settings -> Financial SMS" screen, users can tap **"Scan Historical SMS"**.
- Queries `Telephony.Sms.CONTENT_URI` for messages from the last 30/60/90 days.
- Traverses records using a background `WorkManager` job.
- Checks each message against existing transaction references (`statement_reference`) and local suggestions.
- Deduplicates and adds unrecognized transactions to the review queue without duplicate insertion.

### 4.3 Notification Listener Service (`FinancialNotificationListenerService`)
Complementary to SMS, modern UPI apps frequently emit rich Android push notifications instead of SMS:
- `NotificationListenerService` intercepts notifications from `com.google.android.apps.nbu.paisa.user` (Google Pay), `com.phonepe.app` (PhonePe), and `net.one97.paytm` (Paytm).
- Extracts title, subtext, and big text.
- Parses amount, counterparty, and reference number.
- Ingestion source is tagged as `notification` with model provenance preserved.
