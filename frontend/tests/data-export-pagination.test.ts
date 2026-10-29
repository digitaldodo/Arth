import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { CategoryListResponse, TransactionDTO, TransactionListResponse } from '@arth/contracts';
import { fetchAllExportData } from '../src/lib/export/export-data';
import { generateTransactionsCSV } from '../src/lib/export/csv-export';
import { generateBackupJSON } from '../src/lib/export/json-export';
import { downloadCSV } from '../src/lib/export/csv-export';
import { downloadJSON } from '../src/lib/export/json-export';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function tx(id: string, amountPaise: number): TransactionDTO {
  return {
    id,
    amount_paise: amountPaise,
    amount_decimal: `${(amountPaise / 100).toFixed(2)}`,
    formatted_inr: `₹${(amountPaise / 100).toFixed(2)}`,
    type: 'expense',
    category_id: 'food',
    transaction_date: '2026-10-01',
    payment_method: 'cash',
    necessity: 'essential',
    description: '=unsafe formula',
    notes: 'memo, with comma',
    created_at: '2026-10-01T10:00:00.000Z',
    updated_at: '2026-10-01T10:00:00.000Z',
  };
}

const categories: CategoryListResponse = {
  categories: [{
    id: 'food', name: 'Food, Dining', type: 'expense', icon: null, color: null,
    sort_order: 1, is_default: true, archived_at: null,
  }],
};

function list(items: TransactionDTO[], page: number, total: number): TransactionListResponse {
  return { items, page, page_size: 100, total_count: total, has_more: page * 100 < total };
}

describe('complete CSV and JSON export fetch', () => {
  it('reads the canonical items contract using page_size and fetches all pages without duplicates', async () => {
    const records = Array.from({ length: 205 }, (_, i) => tx(`tx-${i}`, i * 101 + 99));
    const urls: URL[] = [];
    globalThis.fetch = async (input) => {
      const url = new URL(input.toString(), 'http://localhost');
      urls.push(url);
      if (url.pathname.endsWith('/categories')) return Response.json(categories);
      const page = Number(url.searchParams.get('page'));
      const start = (page - 1) * 100;
      return Response.json(list(records.slice(start, start + 100), page, records.length));
    };

    const result = await fetchAllExportData();
    assert.equal(result.transactions.length, 205);
    assert.equal(new Set(result.transactions.map((item) => item.id)).size, 205);
    assert.deepEqual(urls.filter((url) => url.pathname.endsWith('/transactions')).map((url) => url.searchParams.get('page')), ['1', '2', '3']);
    for (const url of urls.filter((item) => item.pathname.endsWith('/transactions'))) {
      assert.equal(url.searchParams.get('page_size'), '100');
      assert.equal(url.searchParams.has('limit'), false);
    }

    const csv = generateTransactionsCSV(result.transactions, result.categories);
    assert.equal(csv.split('\r\n').length, 206);
    assert.ok(csv.includes("'=unsafe formula"));
    assert.ok(csv.includes('"Food, Dining"'));
    assert.ok(csv.includes('"memo, with comma"'));
    const backup = JSON.parse(generateBackupJSON(result.transactions, result.categories, { id: 'user-1' }));
    assert.equal(backup.transactions.length, 205);
    assert.equal(backup.transactions[204].amount_paise, records[204].amount_paise);
    assert.equal(backup.categories[0].id, 'food');
  });

  it('initiates downloads through a browser anchor and revokes object URLs after a safe delay', () => {
    const originalDocument = globalThis.document;
    const originalWindow = globalThis.window;
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    const clicks: string[] = [];
    const revoked: string[] = [];
    const scheduled: Array<{ callback: () => void; delay: number }> = [];
    const attrs: Record<string, string> = {};
    const anchor = {
      setAttribute: (key: string, value: string) => { attrs[key] = value; },
      click: () => { clicks.push(attrs.download); },
    };
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: () => 'blob:export' });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: (url: string) => revoked.push(url) });
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { createElement: () => anchor, body: { appendChild() {}, removeChild() {} } },
    });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { setTimeout: (callback: () => void, delay: number) => scheduled.push({ callback, delay }) },
    });
    try {
      downloadCSV('Date,Description\r\n2026-10-01,Coffee', 'ledger.csv');
      downloadJSON('{"transactions":[]}', 'backup.json');
      assert.deepEqual(clicks, ['ledger.csv', 'backup.json']);
      assert.deepEqual(revoked, []);
      assert.deepEqual(scheduled.map((item) => item.delay), [60_000, 60_000]);
      scheduled.forEach(({ callback }) => callback());
      assert.deepEqual(revoked, ['blob:export', 'blob:export']);
    } finally {
      Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: originalCreate });
      Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: originalRevoke });
      if (originalDocument) Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument });
      else delete (globalThis as { document?: Document }).document;
      if (originalWindow) Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
      else delete (globalThis as { window?: Window }).window;
    }
  });

  it('accepts a genuine empty ledger and produces valid header-only CSV and JSON', async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(input.toString(), 'http://localhost');
      return url.pathname.endsWith('/categories')
        ? Response.json(categories)
        : Response.json(list([], 1, 0));
    };
    const result = await fetchAllExportData();
    assert.deepEqual(result.transactions, []);
    assert.equal(generateTransactionsCSV(result.transactions, result.categories).split('\r\n').length, 1);
    assert.equal(JSON.parse(generateBackupJSON(result.transactions, result.categories, { id: 'user-1' })).metadata.total_transactions, 0);
  });

  it('fails on authentication errors, unexpected response shapes, and later-page failures', async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(input.toString(), 'http://localhost');
      if (url.pathname.endsWith('/categories')) return Response.json(categories);
      if (url.searchParams.get('page') === '2') return Response.json({ message: 'session expired' }, { status: 401 });
      return Response.json(list(Array.from({ length: 100 }, (_, i) => tx(`tx-${i}`, i)), 1, 101));
    };
    await assert.rejects(fetchAllExportData(), /session expired/i);

    globalThis.fetch = async (input) => {
      const url = new URL(input.toString(), 'http://localhost');
      return url.pathname.endsWith('/categories')
        ? Response.json(categories)
        : Response.json({ transactions: [], pagination: { hasMore: false } });
    };
    await assert.rejects(fetchAllExportData(), /unexpected response/i);
  });
});
