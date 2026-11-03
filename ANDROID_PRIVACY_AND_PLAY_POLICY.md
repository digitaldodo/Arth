# Google Play Sensitive Permissions & Privacy Compliance Guide

This document details Arth's compliance strategy for Google Play Store policies regarding sensitive permissions: `android.permission.RECEIVE_SMS` and `android.permission.READ_SMS`.

---

## 1. Google Play Policy Requirements

Google Play Developer Program Policy strictly restricts the use of SMS or Call Log permissions:
- Apps may only request SMS permissions if SMS is core to the application's primary functionality.
- The use case must fall into an approved exception category.
- **Approved Exception Category**: **Financial Management / Personal Financial Management (PFM)**.

### Policy Criteria Met by Arth:
1. **Core Feature**: Automatic expense tracking from banking and payment SMS alerts is an established, core expectation of Indian personal finance management apps.
2. **Alternative Methods Inadequate**: In India, open banking APIs (Account Aggregator) are not accessible to independent personal projects or require heavy institutional licensure, while banks do not provide consumer webhooks for personal accounts. SMS notifications are the sole universal, real-time mechanism for tracking consumer banking transactions.
3. **No Alternative Permission**: The Android `NotificationListenerService` can miss SMS alerts when notifications are dismissed, grouped, silent, or disabled on OEM skins (MIUI, ColorOS, FunTouchOS). Direct SMS reception ensures zero missed debit/credit alerts.
4. **On-Device Data Processing**: SMS messages are parsed in volatile RAM on the device. Neither raw SMS messages nor phone numbers are ever saved to the database or transmitted across the network.
5. **Human-in-the-Loop Review**: No transaction enters the ledger automatically. The user must manually approve each detected record.

---

## 2. Play Console Declaration & Submission Form

When submitting the `playRelease` bundle (`.aab`) to the Google Play Console, complete the **Permissions Declaration Form** as follows:

### Primary Purpose of App:
> Personal Financial Management & Budgeting

### Permission Requested:
- `android.permission.RECEIVE_SMS`
- `android.permission.READ_SMS`

### Core Functionality Declaration:
> **Question**: Why does your app need SMS permissions?  
> **Response**: Arth is a personal financial management application designed to help users track expenses, maintain accurate cash and bank balances, and avoid overspending. Arth requires SMS access solely to automatically detect banking transaction notifications (such as UPI debits, ATM cash withdrawals, and card spends) from financial institutions. The detected data is parsed 100% on-device into a local review queue. The user explicitly reviews, categorizes, and confirms each transaction before it is recorded in their private financial ledger. No raw SMS text, OTPs, or personal correspondence are stored or transmitted.

### Video Demonstration Requirements:
Google Play requires a short YouTube/Drive link demonstrating the SMS permission flow:
1. Show the user navigating to **Settings → SMS Transaction Detection**.
2. Show the **Prominent In-App Disclosure Dialog** (`SmsDisclosureDialog`) stating that SMS is used strictly for on-device bank detection.
3. Show the Android system runtime permission request dialog.
4. Send or simulate a bank SMS alert (e.g., `"Rs 450.00 debited from HDFC Bank A/c ... at Swiggy via UPI"`).
5. Open Arth and show the detected transaction card in the **SMS Review Screen**.
6. Demonstrate the user selecting a category ("Food & Dining"), choosing necessity ("Need"), and clicking "Confirm & Add" to commit it to the ledger.

---

## 3. Why Google Play Protect Blocks Direct Sideloading of Debug APKs

When installing `app-debug.apk` directly on a physical phone via browser download or USB file transfer, Google Play Protect displays:
> *"App blocked to protect your device. This app can request access to sensitive data..."*

### The Cause:
Play Protect applies automated heuristics to **sideloaded APKs** (untrusted origins not installed through the Play Store). Because malware frequently masquerades as utility apps requesting SMS permissions to intercept two-factor SMS OTPs, Play Protect's client scanner flags **any sideloaded APK declaring `RECEIVE_SMS` or `READ_SMS`** unless it has already been submitted and approved in the Play Console.

### The Solution:
- **`local` flavor (`localDebug`, `localRelease`)**:
  - Contains **0 SMS permissions** in `src/main/AndroidManifest.xml`.
  - Application ID: `com.digitaldodo.arth.local`.
  - Sideloads cleanly on any physical device without Play Protect warnings or blocks.
- **`play` flavor (`playDebug`, `playRelease`)**:
  - Merges `src/play/AndroidManifest.xml` with `RECEIVE_SMS` and `READ_SMS`.
  - Exported receiver is protected with `android:permission="android.permission.BROADCAST_SMS"`.
  - Ready for Google Play internal testing tracks and production release.
