import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type {
  TransactionDTO,
  CategoryDTO,
  TransactionType,
} from '@arth/contracts';
import { formatPaiseToINR, formatDateHuman, getTodayIST } from '@/lib/format';
import { fetchTransactions } from '@/lib/api-client';

export interface ExportPdfOptions {
  selectedType: TransactionType | 'all';
  selectedCategory: string; // 'all' or category ID
  categories: CategoryDTO[];
  startDate?: string;
  endDate?: string;
  dateRangeLabel?: string;
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

async function loadFonts(): Promise<{ regular: string; bold: string }> {
  if (cachedFonts) {
    return cachedFonts;
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
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  };
  return new Intl.DateTimeFormat('en-IN', options).format(now) + ' IST';
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
  onProgress?: (status: string) => void
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
 * Generates and downloads a production-grade PDF export of the user's filtered transaction ledger.
 */
export async function exportLedgerToPdf(options: ExportPdfOptions): Promise<void> {
  const {
    selectedType,
    selectedCategory,
    categories,
    startDate,
    endDate,
    dateRangeLabel,
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
          onProgress
        );

  if (transactions.length === 0) {
    throw new Error('No transactions match the selected filter criteria. Export halted.');
  }

  onProgress?.('Preparing document & typography…');

  // 2. Load Unicode fonts
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

  // 4. Header: Arth Emblem & Wordmark (Vector drawing using exact monochrome logo design)
  doc.setFillColor(28, 25, 23); // #1C1917
  doc.roundedRect(margin, 14, 7, 7, 1.5, 1.5, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('NotoSans', 'bold');
  doc.setFontSize(10);
  doc.text('A', margin + 2.1, 19.1);

  doc.setTextColor(28, 25, 23);
  doc.setFontSize(15);
  doc.text('Arth', margin + 9.5, 19.5);

  doc.setDrawColor(214, 211, 209);
  doc.setLineWidth(0.3);
  doc.line(margin + 22, 14.5, margin + 22, 20.5);

  doc.setTextColor(120, 113, 108);
  doc.setFont('NotoSans', 'normal');
  doc.setFontSize(7.5);
  doc.text('LEDGER', margin + 24, 19);

  // Right-aligned Generation Timestamp in Asia/Kolkata
  doc.setFontSize(8);
  doc.setTextColor(120, 113, 108);
  const generatedTimeText = `Generated: ${getTimestampIST()}`;
  doc.text(generatedTimeText, pageWidth - margin, 18, { align: 'right' });

  // 5. Title & Filter Metadata Subtitle
  doc.setFont('NotoSans', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(28, 25, 23);
  doc.text('Transaction Statement', margin, 29);

  // Determine Category Name
  let categoryLabel = 'All Categories';
  if (selectedCategory !== 'all') {
    const foundCat = categories.find((c) => c.id === selectedCategory);
    categoryLabel = foundCat ? foundCat.name : 'Filtered Category';
  }

  // Determine Type Label
  const typeLabel =
    selectedType === 'all'
      ? 'Both Income & Expense'
      : selectedType === 'expense'
      ? 'Expense Only'
      : 'Income Only';

  // Determine Date Range Label
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

  doc.setFont('NotoSans', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(87, 83, 78);
  doc.text(
    `Period: ${effectivePeriod}   |   Type: ${typeLabel}   |   Category: ${categoryLabel}`,
    margin,
    34
  );

  // 6. Calculate Financial Summary (Exact BigInt Paise)
  let totalIncomePaise = BigInt(0);
  let totalExpensePaise = BigInt(0);

  for (const t of transactions) {
    const p = BigInt(t.amount_paise);
    if (t.type === 'income') {
      totalIncomePaise += p;
    } else {
      totalExpensePaise += p;
    }
  }

  const netCashFlowPaise = totalIncomePaise - totalExpensePaise;
  const isNetPositive = netCashFlowPaise > BigInt(0);
  const isNetNegative = netCashFlowPaise < BigInt(0);

  const formattedIncome = `+${formatPaiseToINR(totalIncomePaise)}`;
  const formattedExpense = `-${formatPaiseToINR(totalExpensePaise)}`;
  const formattedNet = `${isNetPositive ? '+' : ''}${formatPaiseToINR(netCashFlowPaise)}`;

  // Summary Metrics Box
  const summaryY = 38;
  const summaryHeight = 16;
  doc.setFillColor(251, 251, 249);
  doc.setDrawColor(231, 229, 228);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, summaryY, pageWidth - margin * 2, summaryHeight, 2, 2, 'FD');

  const boxWidth = (pageWidth - margin * 2) / 4;
  const kpis = [
    {
      label: 'TOTAL INCOME',
      value: formattedIncome,
      color: [16, 185, 129], // Emerald
    },
    {
      label: 'TOTAL EXPENSES',
      value: formattedExpense,
      color: [220, 38, 38], // Red
    },
    {
      label: 'NET CASH FLOW',
      value: formattedNet,
      color: isNetPositive
        ? [16, 185, 129]
        : isNetNegative
        ? [220, 38, 38]
        : [28, 25, 23],
    },
    {
      label: 'TOTAL TRANSACTIONS',
      value: `${transactions.length} ${transactions.length === 1 ? 'record' : 'records'}`,
      color: [28, 25, 23],
    },
  ];

  kpis.forEach((kpi, idx) => {
    const x = margin + idx * boxWidth + 4;
    doc.setFontSize(6.5);
    doc.setTextColor(120, 113, 108);
    doc.setFont('NotoSans', 'bold');
    doc.text(kpi.label, x, summaryY + 5);

    doc.setFontSize(9);
    doc.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
    doc.setFont('NotoSans', 'bold');
    doc.text(kpi.value, x, summaryY + 11.5);

    if (idx < 3) {
      doc.setDrawColor(231, 229, 228);
      doc.setLineWidth(0.2);
      doc.line(
        margin + (idx + 1) * boxWidth,
        summaryY + 2.5,
        margin + (idx + 1) * boxWidth,
        summaryY + summaryHeight - 2.5
      );
    }
  });

  // Footnote below KPI box
  doc.setFont('NotoSans', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(168, 162, 158);
  doc.text(
    '* Net Cash Flow is computed as Total Income minus Total Expenses from the exported records. It strictly excludes People Tracker balances.',
    margin,
    57
  );

  // 7. Prepare Table Rows (Columns: Date, Transaction Name, Type, Category, Payment Method, Amount)
  const tableRows = transactions.map((t) => {
    const isIncome = t.type === 'income';
    const amountStr = isIncome ? `+${t.formatted_inr}` : `-${t.formatted_inr}`;
    const name = t.description?.trim() || t.category_name?.trim() || 'Transaction';
    const category = t.category_name?.trim() || 'Uncategorized';
    const type = isIncome ? 'Income' : 'Expense';
    const method = t.payment_method === 'online' ? 'Online' : 'Cash';

    return [
      t.transaction_date,
      name,
      type,
      category,
      method,
      amountStr,
    ];
  });

  // Empty state row if no transactions match
  if (tableRows.length === 0) {
    tableRows.push([
      '—',
      'No transactions found for the selected period',
      '—',
      '—',
      '—',
      '₹0.00',
    ]);
  }

  // 8. Render Table with repeated headers and auto-pagination
  autoTable(doc, {
    startY: 60,
    margin: { left: margin, right: margin, bottom: 16 },
    head: [
      [
        'Date',
        'Transaction Name',
        'Type',
        'Category',
        'Payment Method',
        'Amount',
      ],
    ],
    body: tableRows,
    styles: {
      font: 'NotoSans',
      fontStyle: 'normal',
      fontSize: 7.5,
      cellPadding: 2.2,
      textColor: [28, 25, 23],
      lineColor: [231, 229, 228],
      lineWidth: 0.15,
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [28, 25, 23],
      textColor: [255, 255, 255],
      font: 'NotoSans',
      fontStyle: 'bold',
      fontSize: 7.5,
      cellPadding: 2.5,
    },
    alternateRowStyles: {
      fillColor: [251, 251, 249],
    },
    columnStyles: {
      0: { cellWidth: 20 }, // Date
      1: { cellWidth: 'auto' }, // Transaction Name (flexible wrap)
      2: { cellWidth: 18 }, // Type
      3: { cellWidth: 28 }, // Category
      4: { cellWidth: 22 }, // Payment Method
      5: { cellWidth: 26, halign: 'right', fontStyle: 'bold' }, // Amount
    },
  });

  // 9. Footers on all pages (with statement date range, note, and accurate total page count)
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('NotoSans', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(168, 162, 158);

    // Hairline divider above footer
    doc.setDrawColor(231, 229, 228);
    doc.setLineWidth(0.2);
    doc.line(margin, 287, pageWidth - margin, 287);

    doc.text(
      `Statement Period: ${effectivePeriod}   •   Generated from Arth · Private & Confidential`,
      margin,
      291
    );
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, 291, {
      align: 'right',
    });
  }

  // 10. Save and Trigger Browser Download
  const filename = `Arth-Statement-${startDate || 'all'}-to-${endDate || getTodayIST()}.pdf`;
  doc.save(filename);
}
