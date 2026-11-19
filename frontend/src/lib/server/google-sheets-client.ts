import { getGoogleSheetsAccessToken } from './google-auth';

export interface TransactionPayload {
  id: string;
  user_id: string;
  amount_paise: number;
  type: 'expense' | 'income';
  category_id?: string | null;
  category_name?: string | null;
  transaction_date: string;
  payment_method?: string | null;
  necessity?: 'need' | 'want' | null;
  description?: string | null;
  notes?: string | null;
  recorded_at?: string;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export const SHEETS_HEADER_ROW = [
  'Transaction ID',
  'Date',
  'Name / Description',
  'Category',
  'Type',
  'Amount (INR)',
  'Payment Method',
  'Necessity',
  'Notes',
  'Status',
  'Created At',
  'Updated At',
];

/**
 * Extracts a Google Spreadsheet ID from either a full URL or a raw ID string.
 */
export function extractSpreadsheetId(input: string): string | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();

  // Pattern: https://docs.google.com/spreadsheets/d/<ID>/...
  const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1];
  }

  // Raw alphanumeric/hyphen/underscore ID (typically 30-50 chars)
  if (/^[a-zA-Z0-9-_]{20,80}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

/**
 * Converts transaction data into Google Sheet row array matching SHEETS_HEADER_ROW.
 */
export function transactionToSheetRow(
  tx: TransactionPayload,
  statusOverride?: 'ACTIVE' | 'DELETED'
): string[] {
  const status =
    statusOverride || (tx.deleted_at ? 'DELETED' : 'ACTIVE');
  const amountInr = (Number(tx.amount_paise || 0) / 100).toFixed(2);
  const typeFormatted = tx.type?.toUpperCase() || 'EXPENSE';
  const necessityFormatted = tx.necessity
    ? tx.necessity.toUpperCase()
    : '';

  return [
    tx.id,
    tx.transaction_date || '',
    tx.description || '',
    tx.category_name || tx.category_id || '',
    typeFormatted,
    amountInr,
    tx.payment_method || '',
    necessityFormatted,
    tx.notes || '',
    status,
    tx.created_at || new Date().toISOString(),
    tx.updated_at || tx.created_at || new Date().toISOString(),
  ];
}

/**
 * Validates that the Google Service Account has Read & Write access to the target sheet,
 * and initializes standard column headers if the sheet is newly created/empty.
 */
export async function verifyAndInitializeSheet(
  spreadsheetId: string,
  preferredSheetName = 'Transactions'
): Promise<{
  spreadsheetTitle: string;
  sheetName: string;
}> {
  const token = await getGoogleSheetsAccessToken();

  // 1. Fetch spreadsheet metadata
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    }
  );

  if (!metaRes.ok) {
    const errorText = await metaRes.text();
    if (metaRes.status === 404) {
      throw new Error(
        'Spreadsheet not found. Please verify the URL or ID, and ensure the sheet is shared with the service account.'
      );
    }
    if (metaRes.status === 403) {
      throw new Error(
        'Permission denied. Please share your Google Sheet with the SpendSense service account email with "Editor" permissions.'
      );
    }
    throw new Error(
      `Unable to access Google Sheet (${metaRes.status}): ${errorText}`
    );
  }

  const metaData = await metaRes.json();
  const spreadsheetTitle: string =
    metaData.properties?.title || 'Personal Finance Ledger';

  // Check existing sheet names
  const sheets: Array<{ properties: { title: string } }> =
    metaData.sheets || [];
  let targetSheetName = preferredSheetName;

  // If preferredSheetName does not exist, use the first sheet in the workbook
  const exactMatch = sheets.find(
    (s) => s.properties?.title?.toLowerCase() === preferredSheetName.toLowerCase()
  );
  if (exactMatch) {
    targetSheetName = exactMatch.properties.title;
  } else if (sheets.length > 0 && sheets[0].properties?.title) {
    targetSheetName = sheets[0].properties.title;
  }

  // 2. Check if sheet has headers
  const valuesRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(targetSheetName)}!A1:L1`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    }
  );

  if (valuesRes.ok) {
    const valuesData = await valuesRes.json();
    const rows: string[][] = valuesData.values || [];

    // If empty or first cell does not match 'Transaction ID', write standard headers
    if (rows.length === 0 || rows[0][0] !== 'Transaction ID') {
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
          spreadsheetId
        )}/values/${encodeURIComponent(
          targetSheetName
        )}!A1:L1?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            range: `${targetSheetName}!A1:L1`,
            majorDimension: 'ROWS',
            values: [SHEETS_HEADER_ROW],
          }),
        }
      );
    }
  }

  return {
    spreadsheetTitle,
    sheetName: targetSheetName,
  };
}

/**
 * Idempotently synchronizes a single transaction outbox mutation into the user's Google Sheet.
 */
export async function syncTransactionToSheet(
  spreadsheetId: string,
  sheetName: string,
  eventType: string,
  tx: TransactionPayload
): Promise<{ success: boolean; action: 'inserted' | 'updated' }> {
  const token = await getGoogleSheetsAccessToken();

  // 1. Fetch Column A (Transaction IDs) to locate existing row
  const colRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(sheetName)}!A:A`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    }
  );

  if (!colRes.ok) {
    const err = await colRes.text();
    throw new Error(`Failed to query Google Sheet rows: ${err}`);
  }

  const colData = await colRes.json();
  const idRows: string[][] = colData.values || [];

  // Find 1-based row index (Header is row 1)
  let foundRowIndex = -1;
  for (let i = 0; i < idRows.length; i++) {
    if (idRows[i][0] === tx.id) {
      foundRowIndex = i + 1; // 1-based index
      break;
    }
  }

  const targetStatus =
    eventType === 'transaction.deleted'
      ? 'DELETED'
      : eventType === 'transaction.restored'
      ? 'ACTIVE'
      : undefined;

  const rowData = transactionToSheetRow(tx, targetStatus);

  if (foundRowIndex > 0) {
    // Row exists -> Update in place
    const updateRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}/values/${encodeURIComponent(
        sheetName
      )}!A${foundRowIndex}:L${foundRowIndex}?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          range: `${sheetName}!A${foundRowIndex}:L${foundRowIndex}`,
          majorDimension: 'ROWS',
          values: [rowData],
        }),
      }
    );

    if (!updateRes.ok) {
      const err = await updateRes.text();
      throw new Error(`Failed to update row ${foundRowIndex} in Sheet: ${err}`);
    }

    return { success: true, action: 'updated' };
  } else {
    // Row does not exist -> Append new row
    const appendRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}/values/${encodeURIComponent(
        sheetName
      )}!A:L:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          range: `${sheetName}!A:L`,
          majorDimension: 'ROWS',
          values: [rowData],
        }),
      }
    );

    if (!appendRes.ok) {
      const err = await appendRes.text();
      throw new Error(`Failed to append transaction row to Sheet: ${err}`);
    }

    return { success: true, action: 'inserted' };
  }
}

/**
 * Performs full weekly reconciliation: ensures every active transaction in the DB
 * is mirrored in the sheet, correcting drift or missing events.
 */
export async function reconcileSheetWithTransactions(
  spreadsheetId: string,
  sheetName: string,
  dbTransactions: TransactionPayload[]
): Promise<{ total: number; inserted: number; updated: number }> {
  const token = await getGoogleSheetsAccessToken();

  // Read Column A
  const colRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(sheetName)}!A:A`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    }
  );

  if (!colRes.ok) {
    const err = await colRes.text();
    throw new Error(`Failed to read sheet for reconciliation: ${err}`);
  }

  const colData = await colRes.json();
  const idRows: string[][] = colData.values || [];
  const idMap = new Map<string, number>();

  for (let i = 0; i < idRows.length; i++) {
    const id = idRows[i][0];
    if (id && id !== 'Transaction ID') {
      idMap.set(id, i + 1); // 1-based
    }
  }

  let insertedCount = 0;
  let updatedCount = 0;
  const rowsToAppend: string[][] = [];

  for (const tx of dbTransactions) {
    const existingRowIndex = idMap.get(tx.id);
    const rowValues = transactionToSheetRow(tx);

    if (existingRowIndex) {
      // Update in place
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
          spreadsheetId
        )}/values/${encodeURIComponent(
          sheetName
        )}!A${existingRowIndex}:L${existingRowIndex}?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            range: `${sheetName}!A${existingRowIndex}:L${existingRowIndex}`,
            majorDimension: 'ROWS',
            values: [rowValues],
          }),
        }
      );
      updatedCount++;
    } else {
      rowsToAppend.push(rowValues);
      insertedCount++;
    }
  }

  if (rowsToAppend.length > 0) {
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}/values/${encodeURIComponent(
        sheetName
      )}!A:L:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          range: `${sheetName}!A:L`,
          majorDimension: 'ROWS',
          values: rowsToAppend,
        }),
      }
    );
  }

  return {
    total: dbTransactions.length,
    inserted: insertedCount,
    updated: updatedCount,
  };
}
