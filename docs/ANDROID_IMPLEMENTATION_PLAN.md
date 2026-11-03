# Arth — Native Android Application Implementation Plan

## 1. Executive Summary & Architecture Overview

The native Android application for **Arth** is a first-class, offline-first personal finance platform built with **Kotlin** and **Jetpack Compose**. It strictly adheres to Arth's core financial tenets:
- **Zero Floating-Point Money**: All monetary amounts are represented as integer paise (`Long`).
- **Deterministic Historical Accounting**: Balances respect baseline configuration timestamps (`recorded_at <= balances_configured_at`).
- **Idempotency & Deterministic Sorting**: Uses time-ordered UUIDv7 identifiers with deterministic sorting (`transaction_date DESC, created_at DESC, id DESC`).
- **On-Device Financial Intelligence**: SMS transaction detection runs 100% on-device with zero transmission of raw SMS texts, strict privacy disclosures, and an explicit user confirmation workflow.
- **Ledger Minimal Aesthetics**: Muted archival paper (`#FBFBF9`) and obsidian (`#0C0A09`) palettes with high-contrast typography, hairline borders, and tactile interactions.

### Architecture: Clean Architecture + MVVM

```
               ┌────────────────────────────────────────────────────────┐
               │                   Presentation Layer                   │
               │   Jetpack Compose UI  •  ViewModels  •  UI State Flow   │
               └───────────────────────────┬────────────────────────────┘
                                           │
               ┌───────────────────────────▼────────────────────────────┐
               │                      Domain Layer                      │
               │      Use Cases  •  Financial Engine  •  SMS Parser      │
               └───────────────────────────┬────────────────────────────┘
                                           │
               ┌───────────────────────────▼────────────────────────────┐
               │                       Data Layer                       │
               │  Repositories  •  Room Local DB  •  Retrofit / OkHttp  │
               │       WorkManager Sync Engine  •  Encrypted Storage    │
               └────────────────────────────────────────────────────────┘
```

---

## 2. Screen Mapping & Navigation Structure

Using **Navigation Compose**, the application is organized around a primary scaffold with top-level destinations and hierarchical sub-destinations:

1. **Dashboard (`/dashboard`)**
   - Net Worth & Total Balance card (Cash + Online accounts).
   - Period Selector: Lifetime, Current Month, Custom Date Range.
   - Necessity Tier Breakdown (Needs, Wants, Investments/Savings).
   - Category spending progress bars.
   - Recent transactions quick list with instant drill-down.
   - SMS Pending Suggestions banner/pill when unreviewed SMS transactions exist.

2. **Ledger (`/ledger`)**
   - Deterministic chronological feed of transactions.
   - Real-time search by description, merchant, note, or counterparty.
   - Multi-criteria filter sheet (Date Range, Cash vs. Online, Category, Necessity Tier, Amount Range).
   - Transaction Detail Sheet with Edit and Soft-Delete actions.

3. **Quick Add (`/quick-add`)**
   - High-speed, tactile manual entry sheet/dialog.
   - Large numeric keypad with real-time paise formatting.
   - Cash vs. Online selector.
   - Income vs. Expense vs. Transfer toggle.
   - Category picker with recent category chips.
   - Necessity tier selector (Needs / Wants / Savings).
   - Notes, counterparty, and custom transaction date/time.

4. **Categories (`/categories`)**
   - Taxonomy management grouped by type and necessity.
   - Monthly category spending budgets vs. actuals.
   - Custom category creation and icon/color assignment.

5. **People & Debt Tracker (`/people`)**
   - Counterparty ledger: "You are owed" vs. "You owe" summaries.
   - Person detail screen with granular loan/borrow transaction history.
   - Settlement recording: Cash or Online debt clearance with one tap.

6. **More & Settings (`/more`)**
   - **Account Balances**: Configure starting balances, record Cash ↔ Online transfers, manual balance reconciliation.
   - **SMS Detection Settings**: Permission management, detected SMS review queue, bank keywords customization.
   - **Financial Reports & Export**: Monthly/Yearly summary charts and native PDF statement generation.
   - **Security**: App Lock (Biometrics / Device PIN via AndroidX Biometric), session timeout settings.
   - **Sync Status**: Outbox pending queue inspector, manual force-sync trigger, Supabase connectivity status.
   - **Appearance**: Light, Dark, System theme toggle.

---

## 3. Financial Engine & Data Precision Invariants

### 3.1 Integer Paise Everywhere
- In all Kotlin models, Room entities, and network payloads, money is represented as `Long` paise (1 INR = 100 paise).
- Conversion utilities:
  - `Paise.fromRupees(rupees: Double): Long = Math.round(rupees * 100)`
  - `Paise.toFormattedString(paise: Long): String = "₹" + ...` (with Indian numbering format: e.g., ₹1,23,456.78).
- Absolutely no `Float` or `Double` used in calculations, database storage, or balance aggregations.

### 3.2 Baseline Snapshot Accounting
When starting balances are configured, the backend stores `balances_configured_at`.
- Any transaction with `recorded_at <= balances_configured_at` is treated as a historical transaction whose impact is already factored into the starting balance.
- Active Balance Formula:
  $$\text{Current Balance} = \text{Starting Balance} + \sum_{t > \text{configured\_at}} \text{Inflow}(t) - \sum_{t > \text{configured\_at}} \text{Outflow}(t)$$
- Cash and Online balances are tracked independently with transfer reconciliation.

### 3.3 UUIDv7 Idempotency & Deterministic Ordering
- All client-generated entities use UUIDv7 (time-ordered UUIDs).
- Query sorting: `ORDER BY transaction_date DESC, created_at DESC, id DESC`.
- This ensures zero UI flicker, stable pagination, and reproducible balance histories across local Room and remote Supabase storage.

---

## 4. On-Device SMS Transaction Detection Engine

### 4.1 Legal & Privacy Compliance
1. **Zero Raw SMS Transmission**: No raw SMS messages or non-financial messages are ever written to remote servers or external logs.
2. **Prominent In-App Disclosure**: Before invoking Android's `READ_SMS` / `RECEIVE_SMS` permission dialog, a prominent disclosure screen explains:
   - The app only scans transactional financial messages from authorized Indian banks/gateways.
   - Processing is 100% on-device.
   - The user must explicitly approve every detected transaction before it enters the ledger.
3. **Pending Suggestion Queue**: Detected messages are stored locally in Room as `SmsSuggestionEntity` with status `PENDING`. The user can:
   - **Confirm**: Converts the suggestion into a legitimate `TransactionEntity` and queues it for outbox sync.
   - **Edit**: Adjusts category, account, or amount before confirming.
   - **Dismiss**: Marks the suggestion as `DISMISSED` or deletes it without creating a transaction.

### 4.2 Regex & Heuristic Parsing Pipeline
- **Sender Whitelist**: Bank and UPI sender headers (e.g., `AD-HDFCBK`, `VK-SBIINB`, `AXISBK`, `ICICIB`, `KOTAKB`, `PAYTM`, `GPAY`, `CRED`).
- **Negative Filters**: Explicitly filters out:
  - OTPs / verification codes (`OTP`, `verification code`, `do not share`).
  - Balance inquiries / statements without debits/credits (`avl bal`, `statement is ready`).
  - Loan / credit card marketing offers (`pre-approved`, `apply now`, `congratulations`).
- **Entity Extraction**:
  - **Amount**: Extracts numerical amounts following `Rs.`, `INR`, `₹` (converted immediately to integer paise).
  - **Direction**: `DEBIT` ("debited", "spent", "paid to", "sent") vs. `CREDIT` ("credited", "received", "refund").
  - **Payment Mode**: UPI (VPA, UPI Ref), Card (ending in XX1234), ATM, NetBanking.
  - **Merchant / Counterparty**: Extracted from "at {Merchant}", "to {VPA}", "info: {Desc}".
  - **Reference Number**: UTR / UPI Ref / Transaction ID.
  - **Timestamp**: Extracted from SMS timestamp or parsed message date.

---

## 5. Local Database & Durable Outbox Engine

### 5.1 Room Database (`ArthDatabase`)
- **`transactions`**:
  - `id: String` (UUIDv7 primary key)
  - `user_id: String`
  - `amount_paise: Long`
  - `type: String` (`INCOME`, `EXPENSE`, `TRANSFER`)
  - `payment_mode: String` (`CASH`, `ONLINE`)
  - `necessity: String` (`NEEDS`, `WANTS`, `SAVINGS`)
  - `category_id: String`
  - `transaction_date: Long` (epoch millis)
  - `notes: String?`
  - `counterparty: String?`
  - `is_deleted: Boolean` (soft-delete)
  - `sync_status: String` (`SYNCED`, `PENDING`, `FAILED`)
  - `created_at: Long`
  - `updated_at: Long`
- **`categories`**:
  - `id: String`, `name: String`, `icon: String`, `color: String`, `type: String`, `is_system: Boolean`, `sort_order: Int`
- **`account_balances`**:
  - `id: String`, `cash_paise: Long`, `online_paise: Long`, `balances_configured_at: Long`
- **`people` & `person_transactions`**:
  - Contact tracking, loan balances, repayment history.
- **`sms_suggestions`**:
  - `id: String`, `sender: String`, `amount_paise: Long`, `type: String`, `payment_mode: String`, `merchant: String?`, `ref_number: String?`, `sms_timestamp: Long`, `status: String` (`PENDING`, `CONFIRMED`, `DISMISSED`)
- **`sync_outbox`**:
  - `id: Long` (auto-increment)
  - `entity_type: String` (`TRANSACTION`, `CATEGORY`, `BALANCE`)
  - `entity_id: String`
  - `operation: String` (`INSERT`, `UPDATE`, `DELETE`)
  - `payload_json: String`
  - `attempts: Int`
  - `last_error: String?`
  - `created_at: Long`

### 5.2 WorkManager Offline-First Sync (`SyncWorker`)
- Triggers on network availability (`NetworkType.CONNECTED`).
- Reads pending items from `sync_outbox` in sequential order.
- Performs idempotent REST calls to backend (`POST /api/native/transactions`, etc.).
- On success: removes outbox entry and marks local entity as `SYNCED`.
- On failure: applies exponential backoff up to max attempts with detailed failure logging.

---

## 6. Ledger Minimal Design System (Compose)

### Colors & Theming
- **Light Theme (Archival Paper)**:
  - Surface: `#FBFBF9`
  - Canvas: `#F4F4F0`
  - Text Primary: `#1C1917` (Stone 900)
  - Text Secondary: `#78716C` (Stone 500)
  - Hairline Border: `#E7E5E4` (Stone 200)
- **Dark Theme (Obsidian)**:
  - Surface: `#0C0A09` (Stone 950)
  - Canvas: `#1C1917` (Stone 900)
  - Text Primary: `#FAFAF9` (Stone 50)
  - Text Secondary: `#A8A29E` (Stone 400)
  - Hairline Border: `#292524` (Stone 800)
- **Semantic Accents**:
  - Inflow / Green: `#059669` (Emerald 600) / `#10B981` (Emerald 500)
  - Outflow / Red: `#DC2626` (Red 600) / `#EF4444` (Red 500)
  - Cash / Amber: `#D97706` (Amber 600)
  - Online / Blue: `#2563EB` (Blue 600)

### Typography & Layout
- Font: Inter typography scale (Display, Headline, Title, Body, Label).
- High density tabular numbers for financial figures.
- Micro-interactions: haptic feedback on numeric keypad presses, subtle swipe-to-delete in ledger.

---

## 7. Implementation Roadmap & Verification

1. **Phase 1: Gradle & Compose Foundation**
   - Configure Gradle dependencies: Compose BOM, Navigation Compose, Room, WorkManager, Retrofit, Kotlinx Serialization, Biometric, Coil.
   - Setup Design System (Color, Type, Theme, Core components).
2. **Phase 2: Data Layer & Room Architecture**
   - Room Entities, DAOs, Database class, TypeConverters.
   - Outbox repository & WorkManager SyncWorker.
   - Token & Secure Keystore manager.
3. **Phase 3: Core Financial UI**
   - Dashboard screen with period selector and balance cards.
   - Ledger screen with filtering and search.
   - Quick Add high-speed sheet.
   - Categories manager.
4. **Phase 4: SMS Transaction Detection Engine**
   - SMS BroadcastReceiver & parsing logic with synthetic test suite.
   - Permission disclosure flow & SMS Review UI.
5. **Phase 5: Balances, People, Settlements & PDF Statements**
   - Starting balance manager and Cash ↔ Online transfers.
   - People & Debt tracker.
   - Native Android PDF generation.
6. **Phase 6: Verification, Testing & Build Validation**
   - Unit tests for SMS parser, financial calculations, Room operations.
   - Production release build verification (`assembleRelease` / `bundleRelease`).
