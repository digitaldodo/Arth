import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractSpreadsheetId,
  transactionToSheetRow,
  SHEETS_HEADER_ROW,
  type TransactionPayload,
} from '../src/lib/server/google-sheets-client';
import {
  isGoogleServiceAccountConfigured,
  getServiceAccountEmail,
} from '../src/lib/server/google-auth';

describe('Phase 02: Google Sheets URL Extraction & Data Formatting', () => {
  test('extractSpreadsheetId correctly extracts ID from various Google Sheet URL formats', () => {
    // 1. Standard browser edit URL
    const url1 =
      'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=0';
    assert.equal(
      extractSpreadsheetId(url1),
      '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'
    );

    // 2. Short edit URL without hash
    const url2 =
      'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit';
    assert.equal(
      extractSpreadsheetId(url2),
      '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'
    );

    // 3. Raw spreadsheet ID string
    const rawId = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';
    assert.equal(extractSpreadsheetId(rawId), rawId);

    // 4. URL with whitespace
    const urlWithSpaces =
      '  https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit  ';
    assert.equal(
      extractSpreadsheetId(urlWithSpaces),
      '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'
    );

    // 5. Invalid inputs return null
    assert.equal(extractSpreadsheetId(''), null);
    assert.equal(extractSpreadsheetId('https://google.com'), null);
    assert.equal(extractSpreadsheetId('invalid-short-id'), null);
  });

  test('transactionToSheetRow maps all columns matching SHEETS_HEADER_ROW', () => {
    const tx: TransactionPayload = {
      id: '0192e456-789a-7bc1-8def-123456789000',
      user_id: '0192e456-789a-7bc1-8def-111111111111',
      amount_paise: 25050, // Rs. 250.50
      type: 'expense',
      category_id: 'cat-food',
      category_name: 'Food & Dining',
      transaction_date: '2026-10-25',
      payment_method: 'online',
      necessity: 'need',
      description: 'Groceries at Nature Basket',
      notes: 'Weekly fresh vegetables',
      created_at: '2026-10-25T10:00:00.000Z',
      updated_at: '2026-10-25T10:00:00.000Z',
      deleted_at: null,
    };

    const row = transactionToSheetRow(tx);
    assert.equal(row.length, SHEETS_HEADER_ROW.length);
    assert.equal(row[0], '0192e456-789a-7bc1-8def-123456789000'); // Transaction ID
    assert.equal(row[1], '2026-10-25'); // Date
    assert.equal(row[2], 'Groceries at Nature Basket'); // Name / Description
    assert.equal(row[3], 'Food & Dining'); // Category
    assert.equal(row[4], 'EXPENSE'); // Type
    assert.equal(row[5], '250.50'); // Amount (INR)
    assert.equal(row[6], 'online'); // Payment Method
    assert.equal(row[7], 'NEED'); // Necessity
    assert.equal(row[8], 'Weekly fresh vegetables'); // Notes
    assert.equal(row[9], 'ACTIVE'); // Status
  });

  test('transactionToSheetRow marks soft-deleted transactions with DELETED status', () => {
    const tx: TransactionPayload = {
      id: '0192e456-789a-7bc1-8def-123456789001',
      user_id: '0192e456-789a-7bc1-8def-111111111111',
      amount_paise: 100000,
      type: 'income',
      transaction_date: '2026-10-25',
      deleted_at: '2026-10-25T12:00:00.000Z',
    };

    const row = transactionToSheetRow(tx);
    assert.equal(row[9], 'DELETED');
    assert.equal(row[4], 'INCOME');
    assert.equal(row[5], '1000.00');
  });

  test('transactionToSheetRow respects statusOverride argument', () => {
    const tx: TransactionPayload = {
      id: '0192e456-789a-7bc1-8def-123456789002',
      user_id: '0192e456-789a-7bc1-8def-111111111111',
      amount_paise: 5000,
      type: 'expense',
      transaction_date: '2026-10-25',
      deleted_at: null,
    };

    const rowDeleted = transactionToSheetRow(tx, 'DELETED');
    assert.equal(rowDeleted[9], 'DELETED');

    const rowActive = transactionToSheetRow(
      { ...tx, deleted_at: '2026-10-25T12:00:00.000Z' },
      'ACTIVE'
    );
    assert.equal(rowActive[9], 'ACTIVE');
  });
});

describe('Phase 02: Service Account Credentials & Authorization', () => {
  const originalEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const originalKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  afterEach(() => {
    if (originalEmail !== undefined) {
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = originalEmail;
    } else {
      delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    }
    if (originalKey !== undefined) {
      process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = originalKey;
    } else {
      delete process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
    }
  });

  test('isGoogleServiceAccountConfigured returns false when credentials are unset', () => {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    delete process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
    assert.equal(isGoogleServiceAccountConfigured(), false);
    assert.equal(getServiceAccountEmail(), null);
  });

  test('isGoogleServiceAccountConfigured returns true when both credentials are set', () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'arth-sync@test.iam.gserviceaccount.com';
    process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nMIIEvg...';
    assert.equal(isGoogleServiceAccountConfigured(), true);
    assert.equal(
      getServiceAccountEmail(),
      'arth-sync@test.iam.gserviceaccount.com'
    );
  });
});

describe('Phase 02: Cron Endpoints & CRON_SECRET Security', () => {
  const originalCronSecret = process.env.CRON_SECRET;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.CRON_SECRET = 'super-secret-cron-token-123';
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
  });

  afterEach(() => {
    if (originalCronSecret !== undefined) {
      process.env.CRON_SECRET = originalCronSecret;
    } else {
      delete process.env.CRON_SECRET;
    }
    (process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv;
  });

  test('GET /api/sync/sheets rejects unauthorized requests with 401 when CRON_SECRET is missing', async () => {
    const { GET } = await import('../src/app/api/sync/sheets/route');
    const { NextRequest } = await import('next/server');

    const req = new NextRequest('http://localhost:3000/api/sync/sheets');
    const res = await GET(req);
    assert.equal(res.status, 401);

    const body = await res.json();
    assert.equal(body.error, 'Unauthorized');
  });

  test('POST /api/sync/sheets rejects requests with incorrect CRON_SECRET with 401', async () => {
    const { POST } = await import('../src/app/api/sync/sheets/route');
    const { NextRequest } = await import('next/server');

    const req = new NextRequest('http://localhost:3000/api/sync/sheets', {
      method: 'POST',
      headers: {
        authorization: 'Bearer wrong-secret',
      },
    });
    const res = await POST(req);
    assert.equal(res.status, 401);
  });

  test('POST /api/sync/reconcile rejects unauthorized requests with 401', async () => {
    const { POST } = await import('../src/app/api/sync/reconcile/route');
    const { NextRequest } = await import('next/server');

    const req = new NextRequest('http://localhost:3000/api/sync/reconcile', {
      method: 'POST',
      headers: {
        authorization: 'Bearer invalid-token',
      },
    });
    const res = await POST(req);
    assert.equal(res.status, 401);
  });
});
