# Arth — Design System Specification: Ledger Minimal

> **Document Version**: 1.0 — Phase 01C  
> **Status**: Completed / Ready for Owner Review  
> **Visual Identity**: Concept 1 — Ledger Minimal (Approved by Owner)  
> **Target Release**: Phase 01  

---

## 1. Selected Concept & Design Principles

### 1.1 Foundation & Character
Arth's visual identity is **Ledger Minimal**. Rooted in Swiss modernist typography (International Typographic Style) and physical accounting ledgers, it approaches personal financial tracking as an intentional, disciplined craft.

The design philosophy is defined by:
- **Quiet Authority**: Financial truth requires clarity, not spectacle. The UI never shouts with arbitrary gradients, candy-colored cards, or gratuitous illustrations.
- **Paper & Obsidian Surfaces**: A tactile warm archival paper surface in Light theme (`#FBFBF9`) and a deep, non-fatiguing volcanic obsidian stone in Dark theme (`#0C0A09`).
- **Monospaced Decimal Alignment**: Dual-typography pairing: high-legibility proportional grotesque sans-serif (`Inter`) for interface prose, and tabular monospaced figures (`Geist Mono`) for all financial amounts and dates.
- **Hairline Structural Discipline**: Visual structure is created through deliberate 1px hairline rules and exact geometric alignment rather than heavy drop shadows or rounded pill containers.
- **Restrained Semantic Accents**: Color is reserved almost exclusively for financial direction (Inflow vs. Outflow) and interactive focus. Even then, color is never the sole indicator of meaning.

### 1.2 Design Anti-Patterns (Explicitly Forbidden)
- No saturated linear/radial gradients.
- No heavy diffused colored drop shadows (e.g. glowing colored buttons).
- No glassmorphic backdrop-blur used as visual decoration.
- No large bubbly corner radii (`rounded-2xl`, `rounded-full` on cards/buttons).
- No emoji used as system interface icons (system icons are hairline vector glyphs).
- No unformatted floating-point numbers or inconsistent currency symbols.

---

## 2. Semantic Color Token System

Every color in Arth is mapped to a semantic token. Components consume tokens, never raw hex codes.

### 2.1 Theme Palettes & Semantic Mapping

| Token Name | Light Theme (`.light`) | Dark Theme (`.dark`) | Semantic Role & Usage | Target Contrast (vs Surface) |
|---|---|---|---|---|
| **Canvas & Surfaces** | | | | |
| `--bg-canvas` | `#FBFBF9` (Stone-50 tint) | `#0C0A09` (Stone-950) | Top-level viewport background | Base |
| `--bg-surface` | `#FFFFFF` (Pure white) | `#171513` (Stone-900 warm) | Main container, cards, modal body | > 1.1:1 vs canvas |
| `--bg-surface-subtle` | `#F4F4F1` (Stone-100 warm) | `#221F1C` (Stone-800 warm) | Table headers, secondary input backings | > 1.2:1 vs surface |
| `--bg-surface-elevated`| `#FFFFFF` | `#1E1B18` | Elevated dialogs, popovers, drawers | Layer separation |
| **Typography & Text** | | | | |
| `--text-primary` | `#1C1917` (Stone-900) | `#F5F5F4` (Stone-100) | Primary headers, transaction descriptions, amounts | **14.2:1** (AAA) / **16.5:1** (AAA) |
| `--text-secondary` | `#57534E` (Stone-600) | `#A8A29E` (Stone-400) | Secondary metadata, active filters, column headers | **6.1:1** (AA) / **6.8:1** (AA) |
| `--text-muted` | `#78716C` (Stone-500) | `#78716C` (Stone-500) | Timestamps, currency helper symbols, placeholders | **4.6:1** (AA) / **4.5:1** (AA) |
| `--text-inverse` | `#FFFFFF` | `#0C0A09` | Text inside solid primary action buttons | High contrast |
| **Borders & Dividers** | | | | |
| `--border-hairline` | `#E7E5E4` (Stone-200) | `#292524` (Stone-800) | Standard 1px card borders, table row dividers | 1px subtle rule |
| `--border-subtle` | `#D6D3D1` (Stone-300) | `#3F3B37` (Stone-700) | Inactive input borders, toggle borders | Structural division |
| `--border-strong` | `#A8A29E` (Stone-400) | `#57534E` (Stone-600) | Hovered inputs, active tab indicators | Interactive affordance |
| `--focus-ring` | `#1C1917` (Stone-900) | `#F5F5F4` (Stone-100) | 2px focus ring with 2px offset | Keyboard accessibility |
| **Primary Actions** | | | | |
| `--action-primary-bg` | `#1C1917` (Stone-900) | `#F5F5F4` (Stone-100) | Primary CTA (`Save`, `Submit`, `Add`) | Maximum prominence |
| `--action-primary-fg` | `#FFFFFF` | `#0C0A09` | Text/icon within primary CTA | Stark contrast |
| `--action-primary-hover`| `#292524` | `#E7E5E4` | Hover state for primary action | Perceptible feedback |
| `--action-secondary-bg`| `transparent` | `transparent` | Secondary actions (`Cancel`, `Clear`) | Low visual weight |
| `--action-secondary-border`| `#D6D3D1` | `#3F3B37` | Border for secondary actions | 1px outline |
| **Financial Direction** | | | | |
| `--income-fg` | `#15803D` (Emerald-700) | `#4ADE80` (Green-400) | Income amounts, positive cash flow text | **5.4:1** (AA) / **10.2:1** (AAA) |
| `--income-bg` | `#F0FDF4` (Emerald-50) | `rgba(74, 222, 128, 0.12)` | Subtle income badge / indicator backing | Soft backing |
| `--income-border` | `#BBF7D0` (Emerald-200) | `rgba(74, 222, 128, 0.25)` | Border for income badges | Crisp rule |
| `--expense-fg` | `#B91C1C` (Red-700) | `#F87171` (Red-400) | Expense amounts, negative cash flow text | **5.8:1** (AA) / **8.9:1** (AAA) |
| `--expense-bg` | `#FEF2F2` (Red-50) | `rgba(248, 113, 113, 0.12)` | Subtle expense badge backing | Soft backing |
| `--expense-border` | `#FECACA` (Red-200) | `rgba(248, 113, 113, 0.25)` | Border for expense badges | Crisp rule |
| **Necessity Classification** | | | | |
| `--nec-essential-fg` | `#292524` (Stone-800) | `#E7E5E4` (Stone-200) | Essential expense label / marker | Neutral baseline |
| `--nec-essential-bg` | `#F5F5F4` (Stone-100) | `#292524` (Stone-800) | Essential expense chip background | Low visual salience |
| `--nec-optional-fg` | `#0369A1` (Sky-700) | `#38BDF8` (Sky-400) | Optional expense label / marker | Controlled accent |
| `--nec-optional-bg` | `#F0F9FF` (Sky-50) | `rgba(56, 189, 248, 0.12)` | Optional expense chip background | Balanced distinction |
| `--nec-luxury-fg` | `#7E22CE` (Purple-700) | `#C084FC` (Purple-400) | Luxury expense label / marker | Discretionary accent |
| `--nec-luxury-bg` | `#FAF5FF` (Purple-50) | `rgba(192, 132, 252, 0.12)` | Luxury expense chip background | High awareness |
| **System Status** | | | | |
| `--status-warning-fg` | `#B45309` (Amber-700) | `#FBBF24` (Amber-400) | Warning alerts, unsaved edit warnings | **4.9:1** (AA) / **9.1:1** (AAA) |
| `--status-warning-bg` | `#FFFBEB` (Amber-50) | `rgba(251, 191, 36, 0.12)` | Warning container background | Soft alert backing |
| `--status-error-fg` | `#DC2626` (Red-600) | `#F87171` (Red-400) | Save failure, destructive delete button | Critical attention |
| `--status-error-bg` | `#FEF2F2` (Red-50) | `rgba(248, 113, 113, 0.15)` | Form error container background | Clear boundary |
| `--status-success-fg` | `#15803D` (Emerald-700) | `#4ADE80` (Green-400) | Confirmation toast text | Positive reassurance |
| **Sync Lifecycle (Future)** | | | | |
| `--sync-pending-fg` | `#78716C` (Stone-500) | `#A8A29E` (Stone-400) | "Queued for sync" indicator | Ambient/subtle |
| `--sync-synced-fg` | `#059669` (Emerald-600) | `#34D399` (Emerald-400) | "Synchronized to Sheets" badge | Confirmed status |
| `--sync-failed-fg` | `#DC2626` (Red-600) | `#F87171` (Red-400) | "Sync delayed / error" badge | Recovery trigger |
| **Interactive States** | | | | |
| `--state-disabled-fg` | `#A8A29E` (Stone-400) | `#57534E` (Stone-600) | Disabled action or field label | Inactive affordance |
| `--state-disabled-bg` | `#F5F5F4` (Stone-100) | `#1C1917` (Stone-900) | Disabled button/input background | Non-interactive |
| `--state-hover-overlay`| `rgba(0, 0, 0, 0.03)` | `rgba(255, 255, 255, 0.04)` | General hover surface tint | Fluid responsiveness |

### 2.2 Dual-Encoding Accessibility Mandate
Color is strictly forbidden from acting as the sole carrier of status. In Arth:
- **Income** always displays `+` prefix, green tint, and `↑` vector arrow.
- **Expense** always displays `−` prefix, red tint, and `↓` vector arrow.
- **Essential** always pairs with text label `Essential` and a solid geometric glyph `[▲]`.
- **Optional** always pairs with text label `Optional` and a circular glyph `[●]`.
- **Luxury** always pairs with text label `Luxury` and a diamond glyph `[◆]`.
- **People Tracker (I owe them)**: Always rendered in Red (`--expense-fg`, `--expense-bg`, `--expense-border`) AND paired with explicit textual phrasing: *"I owe [Name]"* and an amber/red status badge.
- **People Tracker (They owe me)**: Always rendered in Green (`--income-fg`, `--income-bg`, `--income-border`) AND paired with explicit textual phrasing: *"[Name] owes me"* and an emerald status badge.
- **Single Direction Rule**: Each person has exactly one active direction at a time with a single outstanding balance. Opposing color badges or split "To Pay / To Receive" numbers on the same card are strictly prohibited.

---

## 3. Typography & Financial Numerals

Arth utilizes a deliberate two-typeface typography system:
1. **Primary Interface Sans**: `Inter` (or system fallback: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`). Handles navigation, table headers, labels, form controls, and body copy.
2. **Financial Numerals & Dates Mono**: `Geist Mono` (or fallback: `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`). Handles monetary amounts, percentages, quantities, and dates. Always rendered with `tabular-nums`.

### 3.1 Type Hierarchy Scale

| Role | Font Family | Size (px / rem) | Weight | Line Height | Tracking | Usage / Notes |
|---|---|---|---|---|---|---|
| **Display / Hero Amount** | `Geist Mono` | `32px` / `2.0rem` | `600` (Semibold) | `1.15` | `-0.03em` | Net cash flow hero, Entry form amount input |
| **H1 / Page Title** | `Inter` | `20px` / `1.25rem` | `600` (Semibold) | `1.30` | `-0.02em` | View titles ("Financial Overview", "Transactions") |
| **H2 / Section Title** | `Inter` | `14px` / `0.875rem` | `600` (Semibold) | `1.40` | `-0.01em` | Section headers ("Recent Ledger", "Discipline") |
| **H3 / Micro Header** | `Inter` | `11px` / `0.6875rem`| `600` (Semibold) | `1.30` | `+0.05em` | Table column headers, uppercase metadata labels |
| **Body Primary** | `Inter` | `14px` / `0.875rem` | `400` (Regular) | `1.50` | `0` | Descriptions, list item titles, notes, dialog body |
| **Body Medium / Action** | `Inter` | `14px` / `0.875rem` | `500` (Medium) | `1.40` | `-0.005em` | Button labels, active tab items, category chips |
| **Body Small / Secondary**| `Inter` | `12px` / `0.75rem` | `400` (Regular) | `1.45` | `0` | Secondary descriptions, category badges, help text |
| **Table Amounts** | `Geist Mono` | `13px` / `0.8125rem`| `600` (Semibold) | `1.25` | `0` | Ledger row amounts, balance totals (`tabular-nums`) |
| **Dates & Timestamps** | `Geist Mono` | `11px` / `0.6875rem`| `400` (Regular) | `1.20` | `0` | Ledger dates (`2026-10-25`), IST time markers |
| **Micro Labels / Badges** | `Inter` | `10px` / `0.625rem` | `600` (Semibold) | `1.20` | `+0.04em` | Payment mode pill (`ONLINE`), status badges |

### 3.2 Rules for Financial Figure Alignment
1. **Vertical Decimal Alignment**: All tabular figures are displayed with exact two-place decimals (`₹1,450.00`, never `₹1450` or `₹1450.5`). 
2. **Indian Numbering Format**: Currency follows Indian lakh/crore formatting rules via `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })` (e.g. `₹1,25,000.00`, not `₹125,000.00`).
3. **Decimals Treatment**: On small mobile ledger rows, the fractional decimal paise is rendered at `0.85em` opacity (`.00`) to emphasize the integer rupee amount while maintaining exact decimal precision.
4. **Text Right-Alignment**: In tables and split lists, monetary amounts are **strictly right-aligned**. Headers for numeric columns are also right-aligned.
5. **No Micro-Text Floor**: Never use text smaller than `10px` (`0.625rem`) for any metadata badge; primary data fields must never fall below `12px` (`0.75rem`).

---

## 4. Spacing, Geometry & Responsive Layout

Arth adheres to a strict 4px base spacing grid with an 8px preferred spatial rhythm.

### 4.1 Spacing Scale

| Token | Pixels | Usage |
|---|---|---|
| `--space-1` | `4px` | Micro gap between icon and label, pill padding |
| `--space-2` | `8px` | Gap between related chips, tight input padding |
| `--space-3` | `12px` | Card internal padding (mobile), list item gap |
| `--space-4` | `16px` | Standard page margin (mobile), card padding (desktop) |
| `--space-5` | `20px` | Section vertical rhythm gap |
| `--space-6` | `24px` | Large container gap, modal header padding |
| `--space-8` | `32px` | Major section divider spacing |
| `--space-12` | `48px` | Maximum content separation |

### 4.2 Restrained Geometry & Corner Radii
In keeping with Ledger Minimal, corners are crisp, architectural, and subtle:

| Token | Value | Usage |
|---|---|---|
| `--radius-none` | `0px` | Table borders, divider lines, full-width mobile containers |
| `--radius-sm` | `2px` | Micro badges, status pills, table selection markers |
| `--radius-md` | `3px` | Form inputs, buttons, segmented controls, category chips |
| `--radius-lg` | `4px` | Surface cards, dialog containers, desktop sidebar |
| `--radius-sheet`| `8px` / `0px` | Mobile bottom sheet (top-left & top-right `8px`, bottom `0px`) |

*(Notice: No large 16px–24px bubbly radii. Elements feel engineered, grounded, and precise).*

### 4.3 Divider Thickness & Elevation
- **Divider thickness**: Standard is strictly **`1px solid`**.
- **Surface Elevation**:
  - Cards and in-page sections: **0px shadow**. Structure is created by `1px solid var(--border-hairline)`.
  - Floating dialogs and bottom sheets: Restrained neutral shadow: `0 4px 16px rgba(0, 0, 0, 0.08)` in Light theme; `0 4px 20px rgba(0, 0, 0, 0.6)` in Dark theme.

### 4.4 Responsive Content Widths & Breakpoints
Layout behavior is content-driven:

```
[Mobile Viewport]     < 640px    Fluid width (100%), 16px side margins
[Tablet Viewport]     640–1023px  Centered max-width 720px OR 64px compact icon rail
[Desktop Viewport]    ≥ 1024px   1120px max-width content container + 220px fixed left sidebar
```

### 4.5 Touch Targets & Ergonomic Reach
- **Minimum Interactive Target**: **44 × 44 CSS pixels** on all mobile tap targets (buttons, inputs, bottom nav items, category chips).
- **Safe Area**: Bottom navigation accounts for iOS Home Indicator and Android gesture bars via `padding-bottom: max(12px, env(safe-area-inset-bottom))`.

---

## 5. Reusable Component Specifications & State Behavior

### 5.1 Buttons

| Button Variant | Visual Specification | Hover / Active State | Disabled State |
|---|---|---|---|
| **Primary Button** (`Save`, `Submit`) | `bg-[var(--action-primary-bg)]`, `text-[var(--action-primary-fg)]`, `rounded-[3px]`, `h-11` (mobile) / `h-9` (desktop), `font-medium text-sm`. | Hover: `bg-[var(--action-primary-hover)]`. Active: scale `0.99`. | `bg-[var(--state-disabled-bg)]`, `text-[var(--state-disabled-fg)]`, cursor `not-allowed`. |
| **Secondary Button** (`Cancel`, `Dismiss`) | `border border-[var(--border-subtle)]`, `bg-transparent`, `text-[var(--text-primary)]`, `rounded-[3px]`. | Hover: `bg-[var(--bg-surface-subtle)]`, `border-[var(--border-strong)]`. | `opacity-50`, cursor `not-allowed`. |
| **Tertiary / Ghost** (`+ Add Note`, `Clear`) | `bg-transparent`, `border-none`, `text-[var(--text-secondary)]`, `underline-offset-4`. | Hover: `text-[var(--text-primary)]`, `underline`. | `text-[var(--state-disabled-fg)]`. |
| **Destructive Button** (`Delete Record`) | `border border-[var(--status-error-fg)]`, `bg-transparent`, `text-[var(--status-error-fg)]`. | Hover: `bg-[var(--status-error-bg)]`. | `opacity-40`, cursor `not-allowed`. |

- **Loading State on Buttons**: The button preserves its exact horizontal width, disables pointer events, and displays a crisp 14px hairline spinner alongside the label.

---

### 5.2 Form Inputs

#### Text & Note Input
- **Container**: `h-10`, `border border-[var(--border-subtle)]`, `bg-[var(--bg-surface)]`, `rounded-[3px]`, `px-3`, `text-sm text-[var(--text-primary)]`.
- **Placeholder**: `text-[var(--text-muted)]`.
- **Focus**: `border-[var(--focus-ring)]`, `ring-2 ring-[var(--focus-ring)] ring-offset-1`.
- **Error**: `border-[var(--status-error-fg)]`, `ring-1 ring-[var(--status-error-fg)]`.

#### Amount Input (Hero Financial Field)
- **Container**: `h-16`, centered numeric display, `bg-[var(--bg-surface-subtle)]`, `border border-[var(--border-hairline)]`, `rounded-[3px]`.
- **Typography**: `Geist Mono`, `text-3xl`, `font-semibold`.
- **Rupee Glyph**: `text-xl text-[var(--text-muted)]` anchored directly left of the first digit.
- **Mobile Keyboard**: Enforced `<input type="text" inputMode="decimal" pattern="[0-9]*" />` to trigger the large numeric keypad.

#### Date Input
- **Display**: Displays current date formatted as `Today, 25 Oct 2026` with a subtle `Asia/Kolkata` IST timezone pill.
- **Interaction**: Tap opens a streamlined date picker; retains current selection until confirmed.

---

### 5.3 Segmented Controls & Selectors

#### Type Selector (`Expense` / `Income`)
- **Structure**: 2-segment pill container: `h-9`, `p-0.5`, `bg-[var(--bg-surface-subtle)]`, `border border-[var(--border-hairline)]`, `rounded-[3px]`.
- **Selected Segment**: Solid `bg-[var(--bg-surface)]`, `border border-[var(--border-strong)]`, `text-[var(--text-primary)]`, subtle elevation.
- **Unselected Segment**: `text-[var(--text-muted)]`, transparent background.
- **Adaptive Rule**: Selecting `Income` immediately unmounts/hides the Necessity Classifier section.

#### Payment Method Selector (`Online` / `Cash`)
- **Structure**: 2 equal columns: `h-10`, `border border-[var(--border-subtle)]`, `rounded-[3px]`.
- **Icons**: Hairline card icon `[💳]` for `Online (UPI/Card)`, hairline banknote icon `[💵]` for `Cash`.
- **Selected**: Solid border highlight (`border-[var(--border-strong)]`), `bg-[var(--bg-surface-subtle)]`.

#### Necessity Selector (`Essential` / `Optional` / `Luxury`)
- **Structure**: 3 equal columns: `h-10`, `rounded-[3px]`.
- **Labeling & Markers**:
  - `Essential`: Icon `[▲]`, text `Essential`. Selected: `border-[var(--border-strong)]`.
  - `Optional`: Icon `[●]`, text `Optional`. Selected: `border-[var(--nec-optional-fg)]`.
  - `Luxury`: Icon `[◆]`, text `Luxury`. Selected: `border-[var(--nec-luxury-fg)]`.

---

### 5.4 Category Chips & Matrix
- **Layout**: 2 × 3 grid of primary category chips in quick-entry view.
- **Chip Structure**: `h-10`, `px-2.5`, `border border-[var(--border-subtle)]`, `bg-[var(--bg-surface)]`, `rounded-[3px]`, `text-xs font-medium`.
- **Ordering**: Strictly respects the user's custom `sort_order`.
- **"All Categories" Trigger**: A 7th action chip opens a searchable drawer containing all active categories.

---

### 5.5 Navigation Components

#### Mobile Bottom Navigation (Integrated Center Add)
- **Bar Geometry**: Fixed bottom dock, `h-16` + safe-area inset, `bg-[var(--bg-surface)]`, `border-t border-[var(--border-hairline)]`.
- **5 Navigation Slots**:
  1. `Home` (Dashboard) — 20px vector icon + 10px label.
  2. `Ledger` (History) — 20px vector icon + 10px label.
  3. `Add` (`+`) — **Integrated Center Pill**: `w-12 h-10`, `bg-[var(--action-primary-bg)]`, `text-[var(--action-primary-fg)]`, `rounded-[3px]`, sits neatly inside the bar (no awkward floating protrusion).
  4. `Categories` — 20px vector icon + 10px label.
  5. `Settings` — 20px vector icon + 10px label.
- **Active State**: High-contrast icon, text `font-semibold text-[var(--text-primary)]`.
- **Inactive State**: `text-[var(--text-muted)]`.

#### Desktop Left Sidebar
- **Geometry**: Fixed left column, `w-56` (220px), `h-screen`, `bg-[var(--bg-surface-subtle)]`, `border-r border-[var(--border-hairline)]`, `p-4`.
- **Header**: Arth logo glyph + version badge.
- **Primary CTA**: Top button `+ New Transaction` with keyboard hotkey hint `[N]`.
- **Menu Items**: Full-width rows with 16px vector icon and 13px label. Active item displays a 2px solid left accent bar.

---

### 5.6 Ledger Rows (Mobile) & Transaction Table (Desktop)

#### Mobile Ledger Row
- **Structure**: `p-3`, `border-b border-[var(--border-hairline)]`, `flex items-center justify-between`.
- **Left Column**: Category hairline icon box (`28×28px`), transaction description/entity name (`text-xs font-semibold`), metadata string: `Groceries • Online • [▲ Essential]`.
- **Right Column**: Monospaced amount (`text-xs font-semibold`), IST date marker (`text-[10px] text-muted`).

#### Desktop Transaction Table
- **Structure**: Clean HTML table with sticky header (`bg-[var(--bg-surface-subtle)]`).
- **Columns**: `Date` (110px, Mono), `Description` (auto), `Category` (140px), `Payment` (100px), `Necessity` (100px), `Amount` (130px, right-aligned, Mono).
- **Row Interaction**: Hover highlights row with `var(--bg-surface-subtle)`. Tapping row opens Edit Dialog.

---

### 5.7 Summary Metrics & Analytical Breakdowns

#### Net Cash Flow Card
- **Primary Figure**: Prominently labeled **`Net cash flow`** (explicitly avoiding the misleading label "Account balance").
- **Secondary Figures**: Horizontal split showing `Total Inflow: +₹X` and `Total Outflow: −₹Y`.

#### Proportional Discipline Bar (Progressive Disclosure Level 2)
- **Geometry**: Segmented horizontal bar, `h-2`, `rounded-[2px]`, `w-full`.
- **Segments**: Three continuous blocks: Essential (Charcoal), Optional (Sky/Slate), Luxury (Purple/Accent).
- **Legend**: Direct percentage labels below the bar (`Essential: 62%`, `Optional: 26%`, `Luxury: 12%`).

---

### 5.8 Overlays, Drawers & Dialogs
- **Mobile Transaction Entry**: Slides up from bottom as an overlay sheet (`rounded-t-[8px]`), max-height `90vh`, scrollable body.
- **Desktop Transaction Entry**: Centered modal dialog, `max-width: 520px`, `rounded-[4px]`, `border border-[var(--border-subtle)]`.
- **Backdrop**: Subtle dark tint: `rgba(0, 0, 0, 0.45)`.

---

### 5.9 Feedback & Status Alerts
- **Success Notification**: Non-blocking toast at top-center (mobile) or bottom-right (desktop), duration 3.5s.
- **Reversible Deletion Undo**: Toast pill displaying: *"Transaction deleted — [Undo (5s)]"*.
- **Save Error**: Persistent alert banner inside the active drawer preserving all entered data: *"Save failed. Please check connection and [Retry]"*.

---

## 6. Progressive Disclosure Visual Styling

To maintain Ledger Minimal's quiet clarity, Arth applies explicit visual weighting across the 3 disclosure levels:

```
┌────────────────────────────────────────────────────────┐
│ LEVEL 1: IMMEDIATE TRUTH (Heavy weight / High contrast)│
│ • Net Cash Flow (+₹42,850.00)                          │
│ • Today's Total Expense (₹750.00)                      │
│ • Recent 5 transactions list                           │
│ • Primary [+] Entry CTA                                │
└────────────────────────────────────────────────────────┘
                           │
                 [1-Tap Contextual Trigger]
                           ▼
┌────────────────────────────────────────────────────────┐
│ LEVEL 2: CONTEXTUAL DETAIL (Hairline dividers / Medium)│
│ • Proportional Necessity Split Bar (62% / 26% / 12%)   │
│ • Category Breakdown ranked list                       │
│ • Date range selector (This Month / Last Month)        │
│ • Transaction Note expansion field                     │
└────────────────────────────────────────────────────────┘
                           │
                 [Explicit Deep Dive Action]
                           ▼
┌────────────────────────────────────────────────────────┐
│ LEVEL 3: ADMINISTRATIVE & AUDIT (Sub-views / Dialogs)  │
│ • Full filtered transaction ledger                     │
│ • Category taxonomy manager (reorder/archive)          │
│ • Raw UUID v7 and exact synchronization timestamps     │
│ • Data export triggers (CSV / JSON)                    │
└────────────────────────────────────────────────────────┘
```

### Visual Transition Rules
- **No Layout Jumps**: Expanding Level 2 sections uses smooth CSS accordion transitions (`max-height` transition, 180ms ease-out) so adjacent content glides naturally rather than snapping abruptly.
- **Context Preservation**: Level 3 actions always open within distinct dedicated routes or explicit sub-drawers; the back button returns to the exact prior scroll position.

---

## 7. Iconography, Motion & Accessibility

### 7.1 Iconography Guidelines
- **Style**: Monoline, geometric vector stroke icons with a uniform **`1.5px` stroke width** (matching `Lucide` / `Radix Icons` standards).
- **Size Scale**:
  - `16 × 16px`: In-line buttons, metadata indicators, hotkey tags.
  - `20 × 20px`: Navigation items, category list icons.
  - `24 × 24px`: Dialog dismiss triggers, modal headers.
- **Emoji Rule**: Emojis are never used for system navigation, action buttons, or status indicators. Emojis are permitted solely as optional custom user-selected category symbols.

### 7.2 Motion & Animation Scale
Motion in Ledger Minimal is strictly functional—it communicates spatial relationship and state change without decorative lag.

| Motion Type | Duration | Easing Curve | Application |
|---|---|---|---|
| **Micro Fade** | `100ms` | `linear` | Hover state changes, button press scale |
| **Drawer Slide** | `200ms` | `cubic-bezier(0.16, 1, 0.3, 1)` | Bottom sheet entrance / exit |
| **Accordion Expand** | `180ms` | `cubic-bezier(0.16, 1, 0.3, 1)` | Level 2 progressive disclosure reveal |
| **Toast Entrance** | `150ms` | `ease-out` | Snackbar notification popup |

- **Reduced Motion**: If `prefers-reduced-motion: reduce` is active, all durations collapse to `0ms` (instantaneous rendering).

### 7.3 Accessibility (Targeting WCAG 2.2 Level AA)
- **Contrast Ratios**: Every text token specified in Section 2 exceeds the minimum 4.5:1 ratio against its corresponding surface. Primary amounts and headers exceed 14:1.
- **Focus Rings**: All interactive elements display a 2px solid focus ring with a 2px offset (`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2`).
- **Screen Reader Annotations**:
  - Monetary values include an explicit `aria-label`: `<span aria-label="Negative 1,450 rupees">−₹1,450.00</span>`.
  - Directional markers include hidden descriptions: `<span aria-hidden="true">↑</span><span class="sr-only">Income</span>`.
- **Keyboard Navigation**: The entire application is fully operable without a mouse. Modal dialogs trap focus upon opening and release focus upon close.

---

## 8. Locked Behavior Decisions (Owner Approved)

The following core behaviors are formally locked into the design system:

1. **Visual Concept**: **Concept 1: Ledger Minimal** is the authoritative aesthetic.
2. **Navigation Model**: Mobile navigation uses the 5 established destinations: `Home`, `Ledger`, `Add (+)`, `Categories`, and `Settings`.
3. **Integrated Center Add Action**: The central `(+)` button is an **integrated pill** flush within the bottom navigation bar rather than a protruding circular floating action button.
4. **Payment Method Memory**: The first transaction defaults to `Online`. Subsequent transaction entries remember the last-used method (`Online` or `Cash`).
5. **Custom Category Ordering**: Quick-entry category chips strictly respect the owner's manual `sort_order` configured in Category Management.
6. **Reversible Soft-Deletion**: Transaction deletion is non-destructive (`deleted_at = now()`) with a 5-second **Undo snackbar** for instant recovery.
7. **Net Cash Flow Terminology**: The difference between monthly income and monthly expenses is explicitly labeled **`Net cash flow`**, never "Account balance".
8. **Discipline / Necessity Analysis**: Positioned as an on-demand Level 2 contextual breakdown using neutral, non-judgmental language (`Essential`, `Optional`, `Luxury`).
9. **5-Second Entry Target**: The 5-second entry path is an architectural usability benchmark, not an infallible guarantee.

---

## 9. Open Technical & Design Questions

The following operational questions cannot be deduced from prior documents and should be confirmed during Phase 01D prototype review:

1. **Category Icon Set**: Should custom categories use standard curated SVG icons (e.g., Lucide financial icons) or allow native Unicode emojis as custom category badges?
2. **Number Keypad vs. Native Keypad**: On mobile web/PWA, should Arth render a custom in-app numeric keypad component or rely exclusively on the mobile OS virtual decimal keypad (`inputMode="decimal"`)? *(Recommendation: Start with native `inputMode="decimal"` for native haptics, speed, and zero layout overhead).*
3. **Table Row Density on Desktop**: Should the desktop ledger support an explicit density toggle (`Compact: 32px row` vs `Comfortable: 44px row`) or default to a single standard `40px` row height?

---

## 10. Acceptance Checklist for Phase 01D (Screen Prototype)

Before Phase 01D is declared complete, the screen-level prototype must satisfy:

- [ ] **Ledger Minimal Aesthetic**: Verified against the token tables in Section 2 (Warm Paper `#FBFBF9` light, Obsidian `#0C0A09` dark).
- [ ] **Typography**: `Inter` interface prose + `Geist Mono` tabular figures applied correctly.
- [ ] **Mobile Dashboard Prototype**: Includes Month Net Cash Flow, Total Inflow/Outflow, Today's Spend, Level 2 Discipline Bar, and Recent Transactions.
- [ ] **Mobile Quick-Entry Prototype**: Includes Amount with `₹` symbol, Date in IST, 6 category chips, Online/Cash toggle, Essential/Optional/Luxury segmented control, and collapsed Note trigger.
- [ ] **Adaptive Form Logic**: Toggling `Income` immediately hides the Necessity classification section.
- [ ] **Desktop Adaptation Prototype**: Includes 220px fixed left sidebar, 3-metric overview grid, and full-width tabular transaction ledger.
- [ ] **Integrated Navigation**: Mobile bottom bar displays the 5 destinations with the integrated center `(+)` button.
- [ ] **Accessibility & States**: Focus rings, active states, and empty states rendered faithfully according to this specification.

---
*End of ARTH_DESIGN_SYSTEM.md — Ready for Review.*
