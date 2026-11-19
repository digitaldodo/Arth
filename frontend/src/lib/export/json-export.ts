import type { TransactionDTO, CategoryDTO } from '@arth/contracts';

export interface ExportUserMetadata {
  id: string;
  email?: string;
  displayName?: string;
  username?: string;
}

export interface ArthBackupPayload {
  version: number;
  app: string;
  exported_at: string;
  user: ExportUserMetadata;
  categories: CategoryDTO[];
  transactions: TransactionDTO[];
  metadata: {
    total_transactions: number;
    total_categories: number;
    currency: string;
    timezone: string;
  };
}

/**
 * Builds the canonical SpendSense JSON backup document.
 */
export function generateBackupJSON(
  transactions: TransactionDTO[],
  categories: CategoryDTO[],
  user: ExportUserMetadata
): string {
  const payload: ArthBackupPayload = {
    version: 1,
    app: 'SpendSense',
    exported_at: new Date().toISOString(),
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      username: user.username,
    },
    categories,
    transactions,
    metadata: {
      total_transactions: transactions.length,
      total_categories: categories.length,
      currency: 'INR',
      timezone: 'Asia/Kolkata',
    },
  };

  return JSON.stringify(payload, null, 2);
}

/**
 * Triggers a browser download of the generated JSON file.
 */
export function downloadJSON(jsonContent: string, filename: string): void {
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
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
