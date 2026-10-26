import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  sanitizeCSVFormula,
  escapeCSVCell,
  generateTransactionsCSV,
} from '../src/lib/export/csv-export';
import {
  generateBackupJSON,
  type ArthBackupPayload,
} from '../src/lib/export/json-export';
import type { TransactionDTO, CategoryDTO } from '@arth/contracts';

describe('Phase 02: CSV Export & Formula Injection Sanitization', () => {
  test('sanitizeCSVFormula prevents spreadsheet formula injection (CWE-1236)', () => {
    // Dangerous formulas starting with =, +, -, @
    assert.equal(sanitizeCSVFormula('=SUM(A1:A10)'), "'=SUM(A1:A10)");
    assert.equal(sanitizeCSVFormula('+cmd|"/C calc"!A0'), "'+cmd|\"/C calc\"!A0");
    assert.equal(sanitizeCSVFormula('-10+20'), "'-10+20");
    assert.equal(sanitizeCSVFormula('@SUM(B1:B5)'), "'@SUM(B1:B5)");

    // Safe regular values are unaffected
    assert.equal(sanitizeCSVFormula('Lunch with friends'), 'Lunch with friends');
    assert.equal(sanitizeCSVFormula('Electricity Bill 2026'), 'Electricity Bill 2026');
    assert.equal(sanitizeCSVFormula(''), '');
    assert.equal(sanitizeCSVFormula(null), '');
    assert.equal(sanitizeCSVFormula(undefined), '');
  });

  test('escapeCSVCell properly escapes RFC-4180 special characters', () => {
    // Commas
    assert.equal(escapeCSVCell('Milk, Eggs, Bread'), '"Milk, Eggs, Bread"');
    // Quotes (must be escaped as "")
    assert.equal(escapeCSVCell('T-Shirt "Black"'), '"T-Shirt ""Black"""');
    // Newlines
    assert.equal(escapeCSVCell('Line 1\nLine 2'), '"Line 1\nLine 2"');
    // Formula starting with = and containing comma
    assert.equal(escapeCSVCell('=CMD,1,2'), '"\'=CMD,1,2"');
    // Regular text
    assert.equal(escapeCSVCell('Coffee'), 'Coffee');
  });

  test('generateTransactionsCSV outputs complete RFC-4180 CSV with correct headers and paise math', () => {
    const transactions: TransactionDTO[] = [
      {
        id: 'tx-001',
        amount_paise: 35000, // Rs. 350.00
        amount_decimal: '350.00',
        formatted_inr: '₹350.00',
        type: 'expense',
        category_id: 'cat-food',
        transaction_date: '2026-10-25',
        payment_method: 'online',
        necessity: 'essential',
        description: 'Team Lunch',
        notes: 'Lunch at Cafe Bistro',
        created_at: '2026-10-25T13:00:00.000Z',
        updated_at: '2026-10-25T13:00:00.000Z',
      },
      {
        id: 'tx-002',
        amount_paise: 5000000, // Rs. 50,000.00
        amount_decimal: '50000.00',
        formatted_inr: '₹50,000.00',
        type: 'income',
        category_id: 'cat-salary',
        transaction_date: '2026-10-01',
        payment_method: 'online',
        necessity: null,
        description: 'Monthly Salary',
        notes: null,
        created_at: '2026-10-01T09:00:00.000Z',
        updated_at: '2026-10-01T09:00:00.000Z',
      },
    ];

    const categories: CategoryDTO[] = [
      {
        id: 'cat-food',
        name: 'Food & Dining',
        type: 'expense',
        icon: 'utensils',
        color: '#f97316',
        sort_order: 1,
        is_default: true,
        archived_at: null,
      },
      {
        id: 'cat-salary',
        name: 'Salary',
        type: 'income',
        icon: 'briefcase',
        color: '#10b981',
        sort_order: 1,
        is_default: true,
        archived_at: null,
      },
    ];

    const csv = generateTransactionsCSV(transactions, categories);
    const rows = csv.split('\r\n');

    assert.equal(
      rows[0],
      'Date,Name / Description,Category,Type,Amount (INR),Payment Method,Necessity,Notes,Status'
    );
    // Row 1
    assert.ok(rows[1].includes('2026-10-25'));
    assert.ok(rows[1].includes('Team Lunch'));
    assert.ok(rows[1].includes('Food & Dining'));
    assert.ok(rows[1].includes('EXPENSE'));
    assert.ok(rows[1].includes('350.00'));
    assert.ok(rows[1].includes('ESSENTIAL'));
    assert.ok(rows[1].includes('ACTIVE'));

    // Row 2
    assert.ok(rows[2].includes('2026-10-01'));
    assert.ok(rows[2].includes('Monthly Salary'));
    assert.ok(rows[2].includes('Salary'));
    assert.ok(rows[2].includes('INCOME'));
    assert.ok(rows[2].includes('50000.00'));
  });
});

describe('Phase 02: JSON Backup Export Structure & Precision', () => {
  test('generateBackupJSON produces valid versioned schema preserving exact integer paise', () => {
    const transactions: TransactionDTO[] = [
      {
        id: 'tx-001',
        amount_paise: 99999, // Rs. 999.99
        amount_decimal: '999.99',
        formatted_inr: '₹999.99',
        type: 'expense',
        category_id: 'cat-tech',
        transaction_date: '2026-10-25',
        payment_method: 'online',
        necessity: 'optional',
        description: 'Mechanical keyboard switch set',
        notes: null,
        created_at: '2026-10-25T14:00:00.000Z',
        updated_at: '2026-10-25T14:00:00.000Z',
      },
    ];

    const categories: CategoryDTO[] = [
      {
        id: 'cat-tech',
        name: 'Electronics & Tech',
        type: 'expense',
        icon: 'cpu',
        color: '#6366f1',
        sort_order: 1,
        is_default: false,
        archived_at: null,
      },
    ];

    const user = {
      id: 'usr-123',
      email: 'user@example.com',
      displayName: 'Artha User',
      username: 'artha_user',
    };

    const jsonString = generateBackupJSON(transactions, categories, user);
    const parsed: ArthBackupPayload = JSON.parse(jsonString);

    assert.equal(parsed.version, 1);
    assert.equal(parsed.app, 'Arth');
    assert.equal(parsed.user.id, 'usr-123');
    assert.equal(parsed.user.username, 'artha_user');
    assert.equal(parsed.categories.length, 1);
    assert.equal(parsed.transactions.length, 1);
    assert.equal(parsed.transactions[0].amount_paise, 99999);
    assert.equal(parsed.metadata.currency, 'INR');
    assert.equal(parsed.metadata.timezone, 'Asia/Kolkata');
  });
});

describe('Phase 02: UI Cleanup & Brand Consistency Verifications', () => {
  const rootDir = path.resolve(__dirname, '..');

  test('Next.js default favicon is eliminated from app and public directories', () => {
    const appFaviconPath = path.join(rootDir, 'src/app/favicon.ico');
    const publicFaviconPath = path.join(rootDir, 'public/favicon.ico');

    assert.ok(fs.existsSync(appFaviconPath), 'src/app/favicon.ico must exist');
    assert.ok(fs.existsSync(publicFaviconPath), 'public/favicon.ico must exist');

    const appFaviconSize = fs.statSync(appFaviconPath).size;
    // Next.js default favicon was 15,086 bytes. Our multi-resolution Arth favicon is under 12KB.
    assert.notEqual(
      appFaviconSize,
      15086,
      'src/app/favicon.ico must not be the 15,086 byte Next.js default favicon'
    );

    // Root layout metadata references Arth brand icons
    const layoutContent = fs.readFileSync(
      path.join(rootDir, 'src/app/layout.tsx'),
      'utf-8'
    );
    assert.ok(layoutContent.includes('/favicon.ico'));
    assert.ok(layoutContent.includes('/icons/icon-192x192.png'));
    assert.ok(layoutContent.includes('/icons/apple-touch-icon.png'));
    assert.ok(!layoutContent.includes('next.svg'));
  });

  test('DateRangeSelector does not display visible (Asia/Kolkata) label in UI', () => {
    const componentPath = path.join(
      rootDir,
      'src/features/dashboard/DateRangeSelector.tsx'
    );
    const content = fs.readFileSync(componentPath, 'utf-8');
    assert.ok(
      !content.includes('(Asia/Kolkata)'),
      'DateRangeSelector must not display visible (Asia/Kolkata) label'
    );
  });

  test('ExportPdfDialog does not display visible Asia/Kolkata (IST) preset label', () => {
    const dialogPath = path.join(
      rootDir,
      'src/features/transactions/ExportPdfDialog.tsx'
    );
    const content = fs.readFileSync(dialogPath, 'utf-8');
    assert.ok(
      !content.includes('Asia/Kolkata (IST)'),
      'ExportPdfDialog must not render visible Asia/Kolkata (IST) label'
    );
  });

  test('TransactionAppShell removes Set Account Password card and APK download while rendering Offline Support', () => {
    const appShellPath = path.join(
      rootDir,
      'src/features/transactions/TransactionAppShell.tsx'
    );
    const content = fs.readFileSync(appShellPath, 'utf-8');

    // SetPasswordForm must be removed from settings
    assert.ok(
      !content.includes('<SetPasswordForm'),
      'TransactionAppShell must not render SetPasswordForm'
    );
    assert.ok(
      !content.includes('Timezone: Asia/Kolkata (IST)'),
      'TransactionAppShell must not render visible Timezone label in settings'
    );

    // Install APK option must be removed
    assert.ok(
      !content.includes('<AndroidDownloadCard'),
      'TransactionAppShell must not render AndroidDownloadCard'
    );

    // Offline Support (PWA) card must be rendered in settings
    assert.ok(
      content.includes('<InstallPromptCard'),
      'TransactionAppShell must render InstallPromptCard as Offline Support in settings'
    );

    // Google Sheets and Data Export cards must be present
    assert.ok(
      content.includes('<SheetsConnectionCard'),
      'TransactionAppShell must render SheetsConnectionCard'
    );
    assert.ok(
      content.includes('<DataExportCard'),
      'TransactionAppShell must render DataExportCard'
    );
  });
});
