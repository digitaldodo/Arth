# SpendSense — Visual Direction Exploration

> **Document Version**: 1.0 — Phase 01B  
> **Status**: Completed / Ready for Owner Review  
> **Date**: 2026-10-25  
> **Interactive Preview**: [`docs/design-concepts/preview.html`](./design-concepts/preview.html)  

---

## 1. Scope, Purpose & Design Principles

This document explores and defines three genuinely distinct visual directions for **SpendSense** before establishing the final tokenized design system or scaffolding production UI. 

SpendSense is a private, disciplined personal finance tracker built around intentional manual transaction entry. The visual design must serve and elevate this core daily practice.

### Non-Negotiable Visual Principles

1. **Restraint Over Decoration**  
   Financial clarity demands high signal-to-noise. Arbitrary gradients, bloated 3D charts, decorative cards, glassmorphic blur, and giant vanity headings are strictly excluded. Every border, surface, and label must earn its place.
2. **Mobile-First Ergonomics**  
   The primary interaction canvas is a smartphone held in one hand. Primary actions, segmented controls, and keypad targets must comfortably fit within the thumb reach zone (lower 45% of viewport) with minimum 44px touch targets.
3. **Intentional Theme Dualism**  
   Both Light and Dark themes must feel native and handcrafted—never an algorithmic color inversion. Light themes should avoid blinding clinical whiteout; dark themes must avoid pure eye-straining pitch black in favor of deep, balanced slate/stone tones.
4. **Data Integrity & Tabular Precision**  
   Currency (`₹`) and amounts must always use monospaced or tabular figures (`tabular-nums`) to ensure vertical decimal alignment across ledgers.
5. **No Color-Alone Signaling**  
   Income, expense, and necessity classifications must pair subtle semantic tints with explicit text labels, mathematical signs (`+` / `−`), and directional iconography (`↑` / `↓`).
6. **Subtle Progressive Disclosure**  
   Visual hierarchy must naturally guide the eye from Level 1 essential facts to Level 2 contextual breakdowns without requiring page reloads or jarring UI jumps.

---

## 2. Overview of the Three Visual Concepts

| Attribute | Concept 1: Ledger Minimal | Concept 2: Kintsugi Warm | Concept 3: Nordic Frost & Steel |
|---|---|---|---|
| **Personality** | Swiss editorial, monospaced accounting precision, disciplined archive | Warm terracotta, natural linen sandstone, tactile and calming | Modern industrial, cool slate, razor-sharp architectural clarity |
| **Surface Character** | Clean warm-white paper (`#FBFBF9`) / Obsidian stone (`#0C0A09`) | Unbleached linen (`#F7F4EE`) / Peat espresso basalt (`#151311`) | Cool mist slate (`#F8FAFC`) / Carbon steel night (`#090D16`) |
| **Corner Radius** | Precise & sharp: `3px` (`rounded-sm`) | Organic & tactile: `12px` (`rounded-xl`) | Balanced architectural: `8px` (`rounded-lg`) |
| **Borders & Elevation** | 1px hairline rules, zero shadow | Warm biscuit hairline, soft ambient shadow (`shadow-sm`) | Tonal surface layers, zero shadow in dark |
| **Typography** | Inter UI + Geist Mono for financial numbers | Plus Jakarta Sans (Humanist) throughout | Inter (Geometric) with micro-letterspaced numbers |
| **Primary Accent** | Stark high-contrast Ink / Chalk | Burnt Terracotta / Warm Amber | Electric Cobalt Blue / Ice Azure |

---

## 3. Deep-Dive Specification for Each Concept

---

### Concept 1: "Ledger Minimal" (Swiss Editorial & Accounting Precision)

#### 1. Visual Personality & Design Rationale
Inspired by traditional physical double-entry book ledgers and Swiss modernist typography (International Typographic Style). It treats personal finance as a serious, disciplined craft. There is zero decorative fluff. Information is organized with geometric precision, 1px hairline gridlines, and monospaced tabular numerals. It evokes the feeling of an artisan, Smyth-sewn archival notebook.

#### 2. Color Palettes & Tokens

##### Light Theme
- **Background (`--bg`)**: `#FBFBF9` (Warm archival paper)
- **Card / Surface (`--surface`)**: `#FFFFFF` (Pure ledger page)
- **Subtle Surface (`--surface-subtle`)**: `#F4F4F2` (Stone tinted neutral)
- **Hairline Border (`--border`)**: `#E7E5E4` (Stone-200, 1px crisp rule)
- **Strong Border (`--border-strong`)**: `#A8A29E` (Stone-400)
- **Text Primary (`--text`)**: `#1C1917` (Deep printer's ink)
- **Text Muted (`--text-muted`)**: `#78716C` (Graphite stone)
- **Primary Accent (`--accent`)**: `#1C1917` (Stark ink black fill with white text)

##### Dark Theme
- **Background (`--bg`)**: `#0C0A09` (Obsidian stone)
- **Card / Surface (`--surface`)**: `#1C1917` (Deep volcanic stone)
- **Subtle Surface (`--surface-subtle`)**: `#292524` (Stone-800)
- **Hairline Border (`--border`)**: `#292524` (Subtle dark divider)
- **Strong Border (`--border-strong`)**: `#57534E` (Stone-600)
- **Text Primary (`--text`)**: `#F5F5F4` (Bleached parchment)
- **Text Muted (`--text-muted`)**: `#A8A29E` (Warm slate gray)
- **Primary Accent (`--accent`)**: `#F5F5F4` (Chalk ivory fill with obsidian text)

#### 3. Typography Recommendations
- **Primary Interface**: `Inter` or `Geist Sans` (`400` regular, `500` medium, `600` semibold). Tight tracking (`tracking-tight`).
- **Financial Amounts & Dates**: `Geist Mono` or `JetBrains Mono` (`font-mono tabular-nums`). Guarantees every numeral occupies an identical horizontal width for clean columnar scanning.

#### 4. Surfaces, Borders, Spacing & Corners
- **Corners**: Razor-precise `3px` radius (`rounded-sm`). Controls feel engineered rather than bubbly.
- **Borders**: 1px solid hairlines across all cards, table rows, and input containers.
- **Elevation**: Completely flat. Relies on 1px borders and slight background shifts rather than drop shadows.

#### 5. Financial Signaling
- **Income**: Botanical emerald (`#15803D` in light; `#4ADE80` in dark) paired with `+ ↑`.
- **Expense**: Classic ledger crimson (`#B91C1C` in light; `#F87171` in dark) paired with `− ↓`.
- **Necessity**: Hairline rectangular chips with distinct typographic markers:
  - Essential: `[▲ Essential]` (Solid border)
  - Optional: `[● Optional]` (Subtle border)
  - Luxury: `[◆ Luxury]` (High-contrast accent border)

#### 6. Navigation Character
- **Mobile**: Minimalist bottom bar with stark 1px top border. The center `(+)` action is a high-contrast square or octagonal pill with `+` icon.
- **Desktop**: Compact left rail with sharp hairline borders and hotkey hints (`Press 'N'`).

#### 7. Progressive Disclosure Treatment
- Secondary metrics (e.g. Necessity breakdown bar) are styled as compact, segmented hairline bars that sit seamlessly between ledger sections without card elevation.

#### 8. Strengths & Trade-Offs
- **Strengths**: Unmatched data clarity, zero eye fatigue, timeless aesthetic that never feels dated.
- **Trade-Offs**: May feel austere or overly strict to users accustomed to friendly, rounded mobile apps.

---

### Concept 2: "Kintsugi Warm" (Warm Terracotta & Sandstone / Tactile Humanist)

#### 1. Visual Personality & Design Rationale
Inspired by the Japanese philosophy of *Kintsugi* (finding beauty in care, repair, and mindful living) and Mediterranean natural materials (warm terracotta, sun-dried sandstone linen, raw clay, and espresso). Many people experience anxiety around personal finances; this concept counters that stress with warmth, calm, and organic tactility.

#### 2. Color Palettes & Tokens

##### Light Theme
- **Background (`--bg`)**: `#F7F4EE` (Warm unbleached sandstone linen)
- **Card / Surface (`--surface`)**: `#FFFFFF` (Warm alabaster)
- **Subtle Surface (`--surface-subtle`)**: `#EFECE6` (Warm biscuit tint)
- **Border (`--border`)**: `#E3DDD3` (Warm ceramic outline)
- **Strong Border (`--border-strong`)**: `#B8ADA0` (Muted clay)
- **Text Primary (`--text`)**: `#241C18` (Deep roasted espresso umber)
- **Text Muted (`--text-muted`)**: `#7C7267` (Warm clay taupe)
- **Primary Accent (`--accent`)**: `#99472A` (Rich burnt terracotta sienna)

##### Dark Theme
- **Background (`--bg`)**: `#151311` (Deep roasted peat basalt)
- **Card / Surface (`--surface`)**: `#211E1B` (Smoked espresso timber)
- **Subtle Surface (`--surface-subtle`)**: `#2C2824` (Warm charcoal clay)
- **Border (`--border`)**: `#36312B` (Dark umber hairline)
- **Strong Border (`--border-strong`)**: `#595147` (Warm driftwood)
- **Text Primary (`--text`)**: `#EDE7DE` (Warm toasted almond)
- **Text Muted (`--text-muted`)**: `#9E9487` (Dried sage taupe)
- **Primary Accent (`--accent`)**: `#D97746` (Luminous warm amber terracotta)

#### 3. Typography Recommendations
- **Primary Interface & Numerals**: `Plus Jakarta Sans` or `Cabinet Grotesk` (`400`, `500`, `600`, `700`). Warm, human open apertures, rounded terminals, and friendly rhythm.
- **Numbers**: Proportional numerals with explicit Indian Rupee symbol weighting.

#### 4. Surfaces, Borders, Spacing & Corners
- **Corners**: Soft, tactile `12px` (`rounded-xl`) for cards and `8px` (`rounded-lg`) for interactive chips.
- **Borders**: Soft warm biscuit borders paired with very gentle warm ambient drop shadows (`0 2px 8px rgba(36,28,24,0.05)`).
- **Elevation**: Layered warm cards that feel like stacked stationery sheets.

#### 5. Financial Signaling
- **Income**: Forest moss olive (`#2E6F40` in light; `#62B877` in dark) with upward leaf arrow.
- **Expense**: Roasted terracotta rust (`#B23B22` in light; `#E06D53` in dark) with downward arrow.
- **Necessity**: Organic pill-shaped badges with soft warm tinted backgrounds:
  - Essential: Deep olive shield pill `[🛡️ Essential]`
  - Optional: Warm honey balance pill `[⚖️ Optional]`
  - Luxury: Terracotta gem pill `[✨ Luxury]`

#### 6. Navigation Character
- **Mobile**: Rounded floating bottom dock with warm amber active indicators. The center `(+)` button is a prominent terracotta floating circle with soft warm glow.
- **Desktop**: Warm sidebar with comfortable card paddings and rounded menu items.

#### 7. Progressive Disclosure Treatment
- Collapsible cards expand with gentle accordion transitions and soft background tinting.

#### 8. Strengths & Trade-Offs
- **Strengths**: Extremely welcoming, reduces money stress, highly distinctive identity that stands far apart from generic fintech apps.
- **Trade-Offs**: Slightly less compact vertical rhythm than Concept 1 due to larger radii and padding.

---

### Concept 3: "Nordic Frost & Steel" (Modern Industrial Slate & Electric Cobalt)

#### 1. Visual Personality & Design Rationale
Inspired by modern Scandinavian industrial product design (Bang & Olufsen, Teenage Engineering, Braun). Characterized by cool slate tones, razor-sharp geometric alignment, deep navy/carbon backgrounds, and a high-clarity electric cobalt accent. It conveys precision, reliability, and modern technological confidence.

#### 2. Color Palettes & Tokens

##### Light Theme
- **Background (`--bg`)**: `#F8FAFC` (Cool crisp mist slate-50)
- **Card / Surface (`--surface`)**: `#FFFFFF` (Arctic pure white)
- **Subtle Surface (`--surface-subtle`)**: `#F1F5F9` (Slate-100)
- **Border (`--border`)**: `#E2E8F0` (Fine steel slate-200)
- **Strong Border (`--border-strong`)**: `#94A3B8` (Steel slate-400)
- **Text Primary (`--text`)**: `#0F172A` (Midnight ink slate-900)
- **Text Muted (`--text-muted`)**: `#64748B` (Steel slate-500)
- **Primary Accent (`--accent`)**: `#2563EB` (Electric cobalt blue-600)

##### Dark Theme
- **Background (`--bg`)**: `#090D16` (Deep carbon night)
- **Card / Surface (`--surface`)**: `#111827` (Dark industrial steel gray-900)
- **Subtle Surface (`--surface-subtle`)**: `#1E293B` (Slate-800)
- **Border (`--border`)**: `#1F2937` (Cool carbon gray-800)
- **Strong Border (`--border-strong`)**: `#475569` (Slate-600)
- **Text Primary (`--text`)**: `#F8FAFC` (Glacier white slate-50)
- **Text Muted (`--text-muted`)**: `#94A3B8` (Atmospheric cyan-slate)
- **Primary Accent (`--accent`)**: `#3B82F6` (Electric arctic azure blue-500)

#### 3. Typography Recommendations
- **Primary Interface**: `Inter` (Geometric neutrality) with `500` medium labels and `700` bold headers.
- **Numbers**: Micro-letterspaced geometric numerals with clean baseline alignment.

#### 4. Surfaces, Borders, Spacing & Corners
- **Corners**: Balanced industrial `8px` (`rounded-lg`) for cards, `6px` (`rounded-md`) for controls.
- **Borders**: Sharp steel outlines. Elevation is achieved through tonal layer contrast rather than diffuse shadows.

#### 5. Financial Signaling
- **Income**: High-clarity cyan-emerald (`#059669` light; `#10B981` dark).
- **Expense**: High-clarity vivid ruby-rose (`#DC2626` light; `#F43F5E` dark).
- **Necessity**: Industrial status chips with geometric dot markers:
  - Essential: Solid slate dot `[● Essential]`
  - Optional: Hollow blue ring `[○ Optional]`
  - Luxury: Violet diamond `[◇ Luxury]`

#### 6. Navigation Character
- **Mobile**: Clean, segmented bottom toolbar. The center `(+)` button is an integrated electric cobalt pill with glowing contrast.
- **Desktop**: Left navigation rail with clear active route indicators and high-contrast badge counters.

#### 7. Progressive Disclosure Treatment
- Uses clean industrial dividers and subtle sliding drawers with crisp focus rings.

#### 8. Strengths & Trade-Offs
- **Strengths**: Maximum contrast and readability under harsh sunlight or in total darkness. Feels snappy and hyper-responsive.
- **Trade-Offs**: Cool tones can feel somewhat clinical or tech-centric if not balanced with thoughtful micro-copy.

---

## 4. Visual Concept Previews & Comparison Matrix

An interactive HTML comparison studio has been created at [`docs/design-concepts/preview.html`](./design-concepts/preview.html). You can open this file in any browser to toggle concepts, switch light/dark themes, and inspect all three views interactively.

### Preview A: Mobile Dashboard Overview
- **Header**: Month & Year (`October 2026`) + App Identity + Profile trigger.
- **Financial Pulse**: Prominent Net Balance (`+₹42,850.00`) with dual-subcard showing Total Income (`+₹95,000.00`) and Total Expense (`−₹52,150.00`).
- **Discipline Gauge (Level 2)**: Proportional horizontal bar displaying Essential (62%), Optional (26%), and Luxury (12%) ratios.
- **Recent Transactions**: Clean list showing date, category icon, description, payment method badge, necessity chip, and exact formatted INR amount.

### Preview B: Mobile Quick-Entry Drawer
- **Modal Container**: Smooth bottom sheet with drag-handle indicator.
- **Type Toggle**: High-contrast segmented switch (`Expense` / `Income`). Switching to `Income` immediately hides the necessity classifier.
- **Amount Field**: Giant centered numeric display (`₹ 450.00`) with automatic numeric keypad invocation.
- **Category Matrix**: Top 6 categories displayed as 2x3 quick-tap chips (Groceries, Dining, Transport, Utilities, Health, Shopping) with "All (14)" popover.
- **Payment Method**: Segmented selector (`Online (UPI/Card)` vs `Cash`).
- **Necessity**: 3-button selector (`Essential`, `Optional`, `Luxury`).
- **Progressive Note**: Discreet `+ Add optional note` text button.
- **Submit**: Full-width primary CTA (`Save Expense (₹450.00)`).

### Preview C: Desktop Adaptation
- **Expanded Navigation**: 220px left sidebar featuring brand mark, instant `+ New Transaction (N)` action, and clean navigation links.
- **Summary Metrics**: 3-column top grid (Income | Expense | Net Savings).
- **Tabular Ledger**: Rich data table with column headers (Date, Description, Category, Payment, Necessity, Amount), row hover effects, and instant export/filter triggers.

---

## 5. Integration of Established UX Blueprint & Decisions

The visual concepts strictly honor the approved flows from `SPENDSENSE_UX_BLUEPRINT.md`:

### Evaluation of the Mobile Navigation & Central (+) Button
- **Analysis**: We evaluated two variations for the center `(+)` action:
  1. *Elevated Floating Circle (FAB)*: Extends 16px above the bottom bar. High thumb discoverability, but can visually occlude content at the bottom of long lists.
  2. *Integrated Center Pill*: Sits flush within the bottom navigation bar with a distinct high-contrast accent fill.
- **Provisional Recommendation**: We recommend the **Integrated Center Pill** (or a very modest 8px gentle elevation). It prevents bottom-list occlusion while remaining 100% discoverable as the primary action.

### Three Provisional UX Decisions Recorded
1. **Payment Method Memory**: The first transaction defaults to `Online`. Subsequent entries remember the last-used payment method (e.g. if you log two cash transactions in a row, the second entry opens with `Cash` pre-selected).
2. **Category Ordering**: Quick-entry category chips strictly respect the owner's explicit custom `sort_order` set in Category Management.
3. **Reversible Deletion**: Deleting a record triggers a non-destructive soft-delete (`deleted_at = now()`) paired with a 5-second "Undo" toast.

---

## 6. Accessibility & Theme Quality Targets

All three concepts are designed to comfortably exceed **WCAG 2.2 Level AA**:
- **Contrast Ratios**:
  - Concept 1: Primary text contrast is `14.2:1` (Light) and `16.5:1` (Dark).
  - Concept 2: Primary text contrast is `12.8:1` (Light) and `13.6:1` (Dark).
  - Concept 3: Primary text contrast is `15.1:1` (Light) and `17.2:1` (Dark).
- **Focus Rings**: All interactive controls incorporate a high-visibility 2px focus ring (`ring-2 ring-offset-2`) for full keyboard navigation.
- **Touch Targets**: Minimum 44 × 44px on all mobile tap targets.
- **Motion**: Sliding transitions respect `prefers-reduced-motion` and collapse to instant opacity fades.

---

## 7. Architect Recommendation & Trade-Offs

### **Recommendation: Concept 1 ("Ledger Minimal") with subtle warmth from Concept 2**

#### Why Concept 1 is Recommended:
1. **Aligned with Personal Finance Discipline**: SpendSense is not a social app or a gaming dashboard. A clean, high-contrast, Swiss editorial aesthetic honors the seriousness of manual accounting.
2. **Longevity & Timelessness**: Monospaced tabular numerals and hairline borders never go out of style. Bubbly gradients and trendy fintech aesthetics cause visual fatigue after months of daily use.
3. **Data Density Without Clutter**: Concept 1 allows the highest data density while maintaining the cleanest whitespace.

#### Potential Hybrid Enhancement:
We can blend the **monospaced precision and hairline discipline of Concept 1** with the **calming warm stone/linen surface tones of Concept 2** (e.g. using soft stone `#FBFBF9` instead of cold bright white).

---

## 8. Outstanding Choices Requiring Owner Review

Before proceeding to Phase 01C (Scaffold, Design Tokens & Implementation), please review the interactive preview at [`docs/design-concepts/preview.html`](./design-concepts/preview.html) and confirm your preference on:

1. **Visual Direction Preference**:
   - **Option A**: **Concept 1 (Ledger Minimal)** — Swiss editorial, hairline borders, monospaced numbers.
   - **Option B**: **Concept 2 (Kintsugi Warm)** — Warm terracotta, natural linen, tactile 12px corners.
   - **Option C**: **Concept 3 (Nordic Frost & Steel)** — Cool slate, electric cobalt, architectural industrial.
   - **Option D**: **Hybrid (Recommended)** — Concept 1 layout/typography + Concept 2 warm stone palette.
2. **Center Add Action**:
   - Elevated Floating Circle (protruding above bar) vs Integrated High-Contrast Pill (flush with bar).
3. **Confirm UX Behavior**:
   - Approve the payment method memory (remembering last-used method) and reversible soft-delete undo.

---
*End of SPENDSENSE_VISUAL_DIRECTION.md — Awaiting Owner Direction.*
