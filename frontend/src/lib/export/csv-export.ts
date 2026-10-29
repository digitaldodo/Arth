import type { TransactionDTO, CategoryDTO } from '@arth/contracts';

/**
 * Sanitizes a cell value to prevent CSV / Spreadsheet formula injection (CWE-1236).
 * Prepends a single quote if the string begins with `=`, `+`, `-`, or `@`.
 */
export function sanitizeCSVFormula(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = String(val);

  // If starts with dangerous formula character, escape with leading single-quote
  if (/^[=+\-@]/.test(str)) {
    return `'${str}`;
  }

  return str;
}

/**
 * RFC 4180 compliant CSV cell escaper.
 * If the value contains commas, quotes, newlines, or escaped characters, wraps in quotes.
 */
export function escapeCSVCell(val: unknown): string {
  const sanitized = sanitizeCSVFormula(val);
  if (
    sanitized.includes(',') ||
    sanitized.includes('"') ||
    sanitized.includes('\n') ||
    sanitized.includes('\r')
  ) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}

export interface CSVTransactionRecord extends TransactionDTO {
  deleted_at?: string | null;
}

/**
 * Generates an RFC-4180 CSV string from a list of transactions and categories.
 */
export function generateTransactionsCSV(
  transactions: TransactionDTO[],
  categories: CategoryDTO[] = []
): string {
  const categoryMap = new Map<string, string>();
  for (const cat of categories) {
    categoryMap.set(cat.id, cat.name);
  }

  const headers = [
    'Date',
    'Name / Description',
    'Category',
    'Type',
    'Amount (INR)',
    'Payment Method',
    'Necessity',
    'Notes',
    'Status',
  ];

  const lines: string[] = [headers.join(',')];

  for (const tx of transactions) {
    const categoryName = tx.category_name || categoryMap.get(tx.category_id) || '';
    const amountInr = (Number(tx.amount_paise) / 100).toFixed(2);
    const status = (tx as unknown as { deleted_at?: string | null }).deleted_at
      ? 'DELETED'
      : 'ACTIVE';
    const necessity = tx.necessity ? tx.necessity.toUpperCase() : '';

    const row = [
      escapeCSVCell(tx.transaction_date),
      escapeCSVCell(tx.description || ''),
      escapeCSVCell(categoryName),
      escapeCSVCell(tx.type.toUpperCase()),
      escapeCSVCell(amountInr),
      escapeCSVCell(tx.payment_method),
      escapeCSVCell(necessity),
      escapeCSVCell(tx.notes || ''),
      escapeCSVCell(status),
    ];

    lines.push(row.join(','));
  }

  return lines.join('\r\n');
}

/**
 * Triggers a browser download of the generated CSV file.
 */
export function downloadCSV(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Safari and installed PWAs may begin the download after click() returns.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
