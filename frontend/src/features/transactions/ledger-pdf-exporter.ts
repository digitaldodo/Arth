import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type {
  TransactionDTO,
  CategoryDTO,
  TransactionType,
  NecessityClass,
} from '@arth/contracts';
import { formatPaiseToINR, formatDateHuman, getTodayIST } from '@/lib/format';
import { fetchTransactions } from '@/lib/api-client';

export interface UserProfileSummary {
  displayName?: string;
  username?: string;
  email?: string;
}

export interface ExportPdfOptions {
  selectedType: TransactionType | 'all';
  selectedCategory: string; // 'all' or category ID
  selectedNecessity?: NecessityClass | 'all';
  categories: CategoryDTO[];
  startDate?: string;
  endDate?: string;
  dateRangeLabel?: string;
  userProfile?: UserProfileSummary;
  onProgress?: (status: string) => void;
  prefetchedTransactions?: TransactionDTO[];
}

// In-memory cache for loaded font base64 strings so repeated exports are instantaneous
let cachedFonts: { regular: string; bold: string } | null = null;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

/**
 * Loads NotoSans TrueType font assets for Unicode (INR currency symbol) support in jsPDF.
 * Seamlessly resolves in both client browser execution and Node.js testing environments.
 */
export async function loadFonts(): Promise<{ regular: string; bold: string }> {
  if (cachedFonts) {
    return cachedFonts;
  }

  // Node.js test environment support
  if (typeof window === 'undefined') {
    try {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');

      const candidatePaths = [
        path.resolve(process.cwd(), 'public/fonts'),
        path.resolve(process.cwd(), 'frontend/public/fonts'),
      ];

      for (const dir of candidatePaths) {
        try {
          const regBuf = await fs.readFile(path.join(dir, 'NotoSans-Regular.ttf'));
          const boldBuf = await fs.readFile(path.join(dir, 'NotoSans-Bold.ttf'));
          cachedFonts = {
            regular: Buffer.from(regBuf).toString('base64'),
            bold: Buffer.from(boldBuf).toString('base64'),
          };
          return cachedFonts;
        } catch {
          // Check next candidate
        }
      }
    } catch {
      // Fall through to browser fetch
    }
  }

  const [regularRes, boldRes] = await Promise.all([
    fetch('/fonts/NotoSans-Regular.ttf'),
    fetch('/fonts/NotoSans-Bold.ttf'),
  ]);

  if (!regularRes.ok || !boldRes.ok) {
    throw new Error(
      `Failed to load PDF typography assets (${regularRes.status}/${boldRes.status}). Please check network connectivity.`
    );
  }

  const [regBuf, boldBuf] = await Promise.all([
    regularRes.arrayBuffer(),
    boldRes.arrayBuffer(),
  ]);

  cachedFonts = {
    regular: arrayBufferToBase64(regBuf),
    bold: arrayBufferToBase64(boldBuf),
  };

  return cachedFonts;
}

/**
 * Formats a Date object into an Asia/Kolkata (IST) timestamp string: "25 Oct 2026, 06:15 PM IST".
 */
export function getTimestampIST(): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(now);

  const day = parts.find((p) => p.type === 'day')?.value ?? '';
  const month = parts.find((p) => p.type === 'month')?.value ?? '';
  const year = parts.find((p) => p.type === 'year')?.value ?? '';
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '';
  const dayPeriod = parts.find((p) => p.type === 'dayPeriod')?.value?.toUpperCase() ?? '';

  return `${day}-${month}-${year}, ${hour}:${minute} ${dayPeriod} IST`;
}

/**
 * Sanitizes a username for safe, cross-platform PDF file naming.
 * Strips leading '@', converts to lowercase, and replaces invalid characters with hyphens.
 */
export function sanitizeUsernameForFilename(username?: string | null): string {
  if (!username || typeof username !== 'string') return '';
  return username
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Generates a deterministic, username-based PDF filename.
 * Pattern: arth-statement-<username>-<start-date>-to-<end-date>.pdf
 * Example: arth-statement-ansh-2026-10-01-to-2026-10-31.pdf
 * Fallback: arth-statement-2026-10-01-to-2026-10-31.pdf
 */
export function generateStatementFilename(params: {
  username?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}): string {
  const safeUser = sanitizeUsernameForFilename(params.username);
  const userSegment = safeUser ? `-${safeUser}` : '';
  const start = params.startDate?.trim() || 'all';
  const end = params.endDate?.trim() || getTodayIST();

  return `arth-statement${userSegment}-${start}-to-${end}.pdf`;
}

/**
 * Generates a deterministic, non-sensitive statement reference ID for report auditability.
 * Example: ARTH-STMT-20261026-F5A2
 */
export function generateStatementReference(params: {
  startDate?: string;
  endDate?: string;
  transactionCount: number;
}): string {
  const dateSegment = (params.endDate || getTodayIST()).replace(/[^0-9]/g, '');
  const rawSeed = `${params.startDate || 'all'}-${params.endDate || 'now'}-${params.transactionCount}`;
  let hash = 0;
  for (let i = 0; i < rawSeed.length; i++) {
    hash = (hash << 5) - hash + rawSeed.charCodeAt(i);
    hash |= 0;
  }
  const hexPart = Math.abs(hash).toString(16).toUpperCase().padStart(4, '0').slice(-4);
  return `ARTH-STMT-${dateSegment || '20261026'}-${hexPart}`;
}

/**
 * Fetches all pages of transactions matching the given filter criteria.
 * Enforces deduplication and a loop circuit breaker.
 */
export async function fetchAllMatchingTransactions(
  selectedType: TransactionType | 'all',
  selectedCategory: string,
  startDate?: string,
  endDate?: string,
  onProgress?: (status: string) => void,
  selectedNecessity?: NecessityClass | 'all'
): Promise<TransactionDTO[]> {
  const allTransactions: TransactionDTO[] = [];
  const seenIds = new Set<string>();
  let currentPage = 1;
  let hasMore = true;
  const MAX_PAGES = 200; // Safeguard against server misbehavior

  while (hasMore && currentPage <= MAX_PAGES) {
    onProgress?.(`Fetching transactions (page ${currentPage})…`);

    const response = await fetchTransactions({
      type: selectedType === 'all' ? undefined : selectedType,
      category_id: selectedCategory === 'all' ? undefined : selectedCategory,
      necessity: selectedNecessity && selectedNecessity !== 'all' ? selectedNecessity : undefined,
      start_date: startDate,
      end_date: endDate,
      page: currentPage,
      page_size: 50,
    });

    if (!response || !Array.isArray(response.items)) {
      throw new Error('Invalid response structure received from transaction service');
    }

    for (const item of response.items) {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        allTransactions.push(item);
      }
    }

    if (
      !response.has_more ||
      response.items.length === 0 ||
      allTransactions.length >= response.total_count
    ) {
      hasMore = false;
    } else {
      currentPage++;
    }
  }

  return allTransactions;
}

/**
 * Generates and downloads a redesigned, professional personal financial statement PDF.
 */
export async function exportLedgerToPdf(options: ExportPdfOptions): Promise<{ filename: string; doc: jsPDF }> {
  const {
    selectedType,
    selectedCategory,
    selectedNecessity,
    categories,
    startDate,
    endDate,
    dateRangeLabel,
    userProfile,
    onProgress,
    prefetchedTransactions,
  } = options;

  // 1. Fetch or use complete matching records across all pages
  const transactions =
    prefetchedTransactions !== undefined
      ? prefetchedTransactions
      : await fetchAllMatchingTransactions(
          selectedType,
          selectedCategory,
          startDate,
          endDate,
          onProgress,
          selectedNecessity
        );

  if (transactions.length === 0) {
    throw new Error('No transactions match the selected filter criteria. Export halted.');
  }

  onProgress?.('Preparing document & typography…');

  // 2. Load Unicode fonts (NotoSans for INR symbol support)
  const fonts = await loadFonts();

  // 3. Initialize jsPDF document (A4 portrait)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // Register font in VFS
  doc.addFileToVFS('NotoSans-Regular.ttf', fonts.regular);
  doc.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal');
  doc.addFileToVFS('NotoSans-Bold.ttf', fonts.bold);
  doc.addFont('NotoSans-Bold.ttf', 'NotoSans', 'bold');

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const usableWidth = pageWidth - margin * 2; // 182mm

  // Determine Effective Period Label
  let effectivePeriod = dateRangeLabel;
  if (!effectivePeriod) {
    if (startDate && endDate) {
      effectivePeriod = `${formatDateHuman(startDate)} – ${formatDateHuman(endDate)}`;
    } else if (transactions.length > 0) {
      const dates = transactions.map((t) => t.transaction_date).filter(Boolean);
      dates.sort();
      effectivePeriod = `${formatDateHuman(dates[0])} – ${formatDateHuman(dates[dates.length - 1])}`;
    } else {
      effectivePeriod = 'All Recorded Dates';
    }
  }

  // Determine Scope Labels
  let categoryLabel = 'All Categories';
  if (selectedCategory !== 'all') {
    const foundCat = categories.find((c) => c.id === selectedCategory);
    categoryLabel = foundCat ? foundCat.name : 'Filtered Category';
  }

  const typeLabel =
    selectedType === 'all'
      ? 'Both Income & Expense'
      : selectedType === 'expense'
      ? 'Expense Only'
      : 'Income Only';

  const necessityLabel =
    !selectedNecessity || selectedNecessity === 'all'
      ? 'All Necessities'
      : selectedNecessity === 'essential'
      ? 'Essential'
      : selectedNecessity === 'optional'
      ? 'Optional'
      : 'Luxury';

  const statementRefId = generateStatementReference({
    startDate,
    endDate,
    transactionCount: transactions.length,
  });

  // ---------------------------------------------------------------------------
  // 4. Header Section: Brand, Document Title, Reference & Generation Time
  // ---------------------------------------------------------------------------
  // Arth Emblem (rounded square with centered white 'A')
  doc.setFillColor(24, 24, 27); // #18181B dark slate
  doc.roundedRect(margin, 14, 7.5, 7.5, 1.8, 1.8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('NotoSans', 'bold');
  doc.setFontSize(10.5);
  doc.text('A', margin + 2.3, 19.5);

  // Brand Name
  doc.setTextColor(24, 24, 27);
  doc.setFontSize(15);
  doc.setFont('NotoSans', 'bold');
  doc.text('Arth', margin + 10, 20);

  // Subtle separator line
  doc.setDrawColor(212, 212, 216);
  doc.setLineWidth(0.3);
  doc.line(margin + 23.5, 14.8, margin + 23.5, 21.2);

  // Brand Subtitle
  doc.setTextColor(113, 113, 122);
  doc.setFont('NotoSans', 'normal');
  doc.setFontSize(7.5);
  doc.text('PERSONAL FINANCE', margin + 25.5, 19.5);

  // Document Title
  doc.setFont('NotoSans', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(24, 24, 27);
  doc.text('PERSONAL FINANCIAL STATEMENT', margin, 29);

  // Subtitle Descriptor
  doc.setFont('NotoSans', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(113, 113, 122);
  doc.text('Personal transaction record generated from Arth ledger', margin, 33.5);

  // Top Right: Statement Reference
  doc.setFont('NotoSans', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(113, 113, 122);
  doc.text('STATEMENT REFERENCE', pageWidth - margin, 17, { align: 'right' });

  doc.setFont('NotoSans', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(24, 24, 27);
  doc.text(statementRefId, pageWidth - margin, 21.5, { align: 'right' });

  // Top Right: Generation Timestamp in Asia/Kolkata
  doc.setFont('NotoSans', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(113, 113, 122);
  doc.text(`Generated: ${getTimestampIST()}`, pageWidth - margin, 29, { align: 'right' });

  // Header Divider Rule
  doc.setDrawColor(228, 228, 231);
  doc.setLineWidth(0.35);
  doc.line(margin, 36, pageWidth - margin, 36);

  // ---------------------------------------------------------------------------
  // 5. Account Holder & Statement Scope Cards (Side-by-Side Balance)
  // ---------------------------------------------------------------------------
  const cardY = 39;
  const cardHeight = 26;
  const colGap = 4;
  const cardWidth = (usableWidth - colGap) / 2; // 89mm each

  // A. Left Card: Statement Holder
  doc.setFillColor(250, 250, 249);
  doc.setDrawColor(228, 228, 231);
  doc.setLineWidth(0.25);
  doc.roundedRect(margin, cardY, cardWidth, cardHeight, 2, 2, 'FD');

  doc.setFont('NotoSans', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(113, 113, 122);
  doc.text('STATEMENT HOLDER', margin + 4, cardY + 5.5);

  const rawUsername = userProfile?.username?.trim();
  const rawDisplayName = userProfile?.displayName?.trim();
  const rawEmail = userProfile?.email?.trim();

  const holderDisplayName = rawDisplayName || rawUsername || 'Arth Account Holder';
  const holderUsername = rawUsername ? `@${rawUsername.replace(/^@/, '')}` : null;
  const holderEmail = rawEmail || null;

  // Render identity rows with balanced vertical distribution
  let currentIdentityY = cardY + 11.5;
  doc.setFont('NotoSans', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(24, 24, 27);
  doc.text(holderDisplayName, margin + 4, currentIdentityY);

  if (holderUsername) {
    currentIdentityY += 5;
    doc.setFont('NotoSans', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(75, 85, 99);
    doc.text(holderUsername, margin + 4, currentIdentityY);
  }

  if (holderEmail) {
    currentIdentityY += 4.8;
    doc.setFont('NotoSans', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(113, 113, 122);
    doc.text(holderEmail, margin + 4, currentIdentityY);
  }

  // B. Right Card: Statement Parameters & Scope
  const rightX = margin + cardWidth + colGap;
  doc.setFillColor(250, 250, 249);
  doc.setDrawColor(228, 228, 231);
  doc.setLineWidth(0.25);
  doc.roundedRect(rightX, cardY, cardWidth, cardHeight, 2, 2, 'FD');

  doc.setFont('NotoSans', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(113, 113, 122);
  doc.text('STATEMENT PARAMETERS', rightX + 4, cardY + 5.5);

  doc.setFont('NotoSans', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(24, 24, 27);
  doc.text(`Period: ${effectivePeriod}`, rightX + 4, cardY + 11);

  doc.setFont('NotoSans', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(75, 85, 99);
  doc.text(`Type Scope: ${typeLabel}   •   Category: ${categoryLabel}`, rightX + 4, cardY + 16.5);
  doc.text(`Necessity: ${necessityLabel}   •   Currency: INR (₹) · Paise Precision`, rightX + 4, cardY + 21.5);

  // ---------------------------------------------------------------------------
  // 6. Financial Summary Card (Exact BigInt Paise Precision & Single ₹ Symbol)
  // ---------------------------------------------------------------------------
  let totalIncomePaise = BigInt(0);
  let totalExpensePaise = BigInt(0);

  for (const t of transactions) {
    const p = BigInt(t.amount_paise || 0);
    if (t.type === 'income') {
      totalIncomePaise += p;
    } else {
      totalExpensePaise += p;
    }
  }

  const netCashFlowPaise = totalIncomePaise - totalExpensePaise;
  const isNetPositive = netCashFlowPaise > BigInt(0);
  const isNetNegative = netCashFlowPaise < BigInt(0);

  // Format exactly one ₹ symbol using formatPaiseToINR
  const formattedIncome = `+${formatPaiseToINR(totalIncomePaise)}`;
  const formattedExpense = `-${formatPaiseToINR(totalExpensePaise)}`;
  const formattedNet = `${isNetPositive ? '+' : ''}${formatPaiseToINR(netCashFlowPaise)}`;

  const summaryY = 68;
  const summaryHeight = 20;

  doc.setFont('NotoSans', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(113, 113, 122);
  doc.text('FINANCIAL SUMMARY', margin, summaryY - 2);

  doc.setFillColor(250, 250, 249);
  doc.setDrawColor(228, 228, 231);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, summaryY, usableWidth, summaryHeight, 2, 2, 'FD');

  const metricWidth = usableWidth / 4; // 45.5mm
  const metrics = [
    {
      label: 'TOTAL INCOME',
      value: formattedIncome,
      sub: 'Total period inflows',
      color: [5, 150, 105], // Emerald
    },
    {
      label: 'TOTAL EXPENSES',
      value: formattedExpense,
      sub: 'Total period outflows',
      color: [220, 38, 38], // Rose-600
    },
    {
      label: 'NET CASH FLOW',
      value: formattedNet,
      sub: 'Inflows minus outflows',
      color: isNetPositive
        ? [5, 150, 105]
        : isNetNegative
        ? [220, 38, 38]
        : [24, 24, 27],
    },
    {
      label: 'TRANSACTIONS',
      value: `${transactions.length} ${transactions.length === 1 ? 'record' : 'records'}`,
      sub: 'Matching active filters',
      color: [24, 24, 27],
    },
  ];

  metrics.forEach((m, idx) => {
    const mx = margin + idx * metricWidth + 4;
    doc.setFont('NotoSans', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(113, 113, 122);
    doc.text(m.label, mx, summaryY + 5.5);

    doc.setFont('NotoSans', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(m.color[0], m.color[1], m.color[2]);
    doc.text(m.value, mx, summaryY + 12);

    doc.setFont('NotoSans', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(161, 161, 170);
    doc.text(m.sub, mx, summaryY + 17);

    // Dividers between metrics
    if (idx < 3) {
      doc.setDrawColor(228, 228, 231);
      doc.setLineWidth(0.2);
      doc.line(
        margin + (idx + 1) * metricWidth,
        summaryY + 3,
        margin + (idx + 1) * metricWidth,
        summaryY + summaryHeight - 3
      );
    }
  });

  // Net Cash Flow explanatory footnote
  doc.setFont('NotoSans', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(113, 113, 122);
  doc.text(
    '* Net Cash Flow represents net funds delta across exported transactions. It strictly excludes People Tracker debt / loan balances.',
    margin,
    summaryY + summaryHeight + 4.5
  );

  // ---------------------------------------------------------------------------
  // 7. Transaction Ledger Table (7 Columns, Formatted Values, Dynamic Padding)
  // ---------------------------------------------------------------------------
  const tableStartY = summaryY + summaryHeight + 8;
  doc.setFont('NotoSans', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(113, 113, 122);
  doc.text('TRANSACTION LEDGER', margin, tableStartY);

  doc.setFont('NotoSans', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(113, 113, 122);
  doc.text(`Total Records: ${transactions.length}`, pageWidth - margin, tableStartY, { align: 'right' });

  const tableRows = transactions.map((t) => {
    const isIncome = t.type === 'income';
    const amountStr = isIncome ? `+${t.formatted_inr}` : `-${t.formatted_inr}`;
    const name = t.description?.trim() || t.category_name?.trim() || 'Transaction';
    const category = t.category_name?.trim() || 'Uncategorized';
    const type = isIncome ? 'Income' : 'Expense';
    const method = t.payment_method === 'online' ? 'Online' : 'Cash';

    // Format human-readable necessity tag
    const necessity =
      !t.necessity
        ? '—'
        : t.necessity === 'essential'
        ? 'Essential'
        : t.necessity === 'optional'
        ? 'Optional'
        : t.necessity === 'luxury'
        ? 'Luxury'
        : String(t.necessity);

    return [
      formatDateHuman(t.transaction_date) || t.transaction_date,
      name,
      category,
      type,
      method,
      necessity,
      amountStr,
    ];
  });

  // Balanced padding: slightly more spacious for compact statements (< 15 items)
  const cellPadding = transactions.length <= 15 ? 3.0 : 2.5;

  autoTable(doc, {
    startY: tableStartY + 2,
    margin: { top: 18, left: margin, right: margin, bottom: 24 },
    head: [['Date', 'Transaction Description', 'Category', 'Type', 'Method', 'Necessity', 'Amount (INR)']],
    body: tableRows,
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    styles: {
      font: 'NotoSans',
      fontStyle: 'normal',
      fontSize: 7.5,
      cellPadding,
      textColor: [24, 24, 27],
      lineColor: [228, 228, 231],
      lineWidth: 0.15,
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [24, 24, 27],
      textColor: [255, 255, 255],
      font: 'NotoSans',
      fontStyle: 'bold',
      fontSize: 7.5,
      cellPadding: 3,
    },
    alternateRowStyles: {
      fillColor: [250, 250, 249],
    },
    columnStyles: {
      0: { cellWidth: 23 }, // Date (e.g. 26 Oct 2026 on single line)
      1: { cellWidth: 48 }, // Transaction Description
      2: { cellWidth: 26 }, // Category
      3: { cellWidth: 19 }, // Type (fits 'Expense' and 'Income' without wrap)
      4: { cellWidth: 18 }, // Method ('Online' / 'Cash')
      5: { cellWidth: 22 }, // Necessity ('Essential', 'Optional', 'Luxury')
      6: { cellWidth: 26, halign: 'right', fontStyle: 'bold' }, // Amount (INR)
    },
    didParseCell: (data) => {
      // Color-code amounts for accessible, grayscale-printable distinction
      if (data.section === 'body' && data.column.index === 6) {
        const val = String(data.cell.raw);
        if (val.startsWith('+')) {
          data.cell.styles.textColor = [5, 150, 105]; // Emerald
        } else if (val.startsWith('-')) {
          data.cell.styles.textColor = [190, 18, 60]; // Rose-700
        }
      }
    },
  });

  // End of statement indicator
  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  if (finalY < 265) {
    doc.setFont('NotoSans', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(161, 161, 170);
    doc.text(
      `— End of Personal Financial Statement · Records 1–${transactions.length} of ${transactions.length} —`,
      pageWidth / 2,
      finalY + 8,
      { align: 'center' }
    );
  }

  // ---------------------------------------------------------------------------
  // 8. Fixed Footers on all pages (Disclaimer, Confidentiality & Page Numbering)
  // ---------------------------------------------------------------------------
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    // Hairline rule above footer
    doc.setDrawColor(228, 228, 231);
    doc.setLineWidth(0.25);
    doc.line(margin, 282, pageWidth - margin, 282);

    // Line 1: Full-width disclaimer
    doc.setFont('NotoSans', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(156, 163, 175);
    doc.text(
      'Notice: This statement is generated from records maintained in Arth and may not represent a bank-verified account statement.',
      margin,
      285.5
    );

    // Line 2: Branding (left) | Period (center) | Page X of Y (right)
    doc.setFont('NotoSans', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(113, 113, 122);
    doc.text('Generated by Arth · Private & Confidential', margin, 290);
    doc.text(`Statement Period: ${effectivePeriod}`, pageWidth / 2, 290, { align: 'center' });

    doc.setFont('NotoSans', 'bold');
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, 290, { align: 'right' });
  }

  // ---------------------------------------------------------------------------
  // 9. Save and Trigger Browser Download with Username-Based Filename
  // ---------------------------------------------------------------------------
  const filename = generateStatementFilename({
    username: userProfile?.username,
    startDate,
    endDate,
  });

  doc.save(filename);

  return {
    filename,
    doc,
  };
}
