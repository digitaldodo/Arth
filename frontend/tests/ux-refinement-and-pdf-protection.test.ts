import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  getDefaultCategoryIcon,
  resolveCategoryIcon,
  PRESET_CATEGORY_ICONS,
} from '../src/features/categories/category-icons';

describe('Arth UX Refinements & PDF Protection Test Suite', () => {
  describe('1. Category Icons & Semantic Defaults', () => {
    test('getDefaultCategoryIcon provides sensible defaults for expense categories', () => {
      assert.equal(getDefaultCategoryIcon('Groceries', 'expense'), '🍽️');
      assert.equal(getDefaultCategoryIcon('Dining Out & Cafe', 'expense'), '🍽️');
      assert.equal(getDefaultCategoryIcon('Metro & Bus Travel', 'expense'), '🚗');
      assert.equal(getDefaultCategoryIcon('House Rent', 'expense'), '🏠');
      assert.equal(getDefaultCategoryIcon('Electricity Bill', 'expense'), '🏠');
      assert.equal(getDefaultCategoryIcon('Amazon Shopping', 'expense'), '🛍️');
      assert.equal(getDefaultCategoryIcon('Pharmacy & Medicine', 'expense'), '💊');
      assert.equal(getDefaultCategoryIcon('Tuition & Books', 'expense'), '📚');
      assert.equal(getDefaultCategoryIcon('Cinema & Movies', 'expense'), '🎬');
      assert.equal(getDefaultCategoryIcon('Gifts for friends', 'expense'), '🎁');
      assert.equal(getDefaultCategoryIcon('Mutual Fund Investment', 'expense'), '📈');
      assert.equal(getDefaultCategoryIcon('Hair Salon', 'expense'), '✂️');
      assert.equal(getDefaultCategoryIcon('Miscellaneous', 'expense'), '🏷️');
    });

    test('getDefaultCategoryIcon provides sensible defaults for income categories', () => {
      assert.equal(getDefaultCategoryIcon('Monthly Salary', 'income'), '💼');
      assert.equal(getDefaultCategoryIcon('Freelance Project', 'income'), '💻');
      assert.equal(getDefaultCategoryIcon('Stock Dividend', 'income'), '📈');
      assert.equal(getDefaultCategoryIcon('Apartment Rental Income', 'income'), '🏠');
      assert.equal(getDefaultCategoryIcon('Reimbursement', 'income'), '💵');
      assert.equal(getDefaultCategoryIcon('Other Inflow', 'income'), '💰');
    });

    test('resolveCategoryIcon prioritizes explicit user icon over default', () => {
      assert.equal(resolveCategoryIcon('🍕', 'Groceries', 'expense'), '🍕');
      assert.equal(resolveCategoryIcon('✈️', 'Flight Travel', 'expense'), '✈️');
      assert.equal(resolveCategoryIcon(null, 'Groceries', 'expense'), '🍽️');
      assert.equal(resolveCategoryIcon('', 'Groceries', 'expense'), '🍽️');
      assert.equal(resolveCategoryIcon('   ', 'Monthly Salary', 'income'), '💼');
    });

    test('PRESET_CATEGORY_ICONS contains curated universal icons', () => {
      assert.ok(PRESET_CATEGORY_ICONS.length >= 20);
      assert.ok(PRESET_CATEGORY_ICONS.includes('🍽️'));
      assert.ok(PRESET_CATEGORY_ICONS.includes('🚗'));
      assert.ok(PRESET_CATEGORY_ICONS.includes('🏠'));
      assert.ok(PRESET_CATEGORY_ICONS.includes('💼'));
    });
  });

  describe('2. Light Theme Contrast & Balance Card Polish', () => {
    test('BalanceCard utilizes standard semantic Badge components', () => {
      const balanceCardPath = path.resolve(
        __dirname,
        '../src/features/dashboard/BalanceCard.tsx'
      );
      const content = fs.readFileSync(balanceCardPath, 'utf8');

      assert.ok(
        content.includes('<Badge variant="warning" size="xs">'),
        'Not Configured status must use Badge variant="warning"'
      );
      assert.ok(
        content.includes('<Badge variant="cash" size="xs">'),
        'Cash Balance chip must use Badge variant="cash"'
      );
      assert.ok(
        content.includes('<Badge variant="online" size="xs">'),
        'Online Balance chip must use Badge variant="online"'
      );
    });

    test('Starting Balances banner uses high-contrast text and accessible button', () => {
      const balanceCardPath = path.resolve(
        __dirname,
        '../src/features/dashboard/BalanceCard.tsx'
      );
      const content = fs.readFileSync(balanceCardPath, 'utf8');

      // Check banner styling
      assert.ok(
        content.includes('bg-[var(--status-warning-bg)]'),
        'Must use semantic status-warning-bg'
      );
      assert.ok(
        content.includes('border-[var(--status-warning-border)]'),
        'Must use semantic status-warning-border'
      );
      assert.ok(
        content.includes('text-[var(--text-primary)]'),
        'Heading must use accessible primary charcoal text'
      );
      assert.ok(
        content.includes('text-[var(--text-secondary)]'),
        'Body must use accessible secondary text'
      );
      assert.ok(
        content.includes('bg-[var(--action-primary-bg)]'),
        'CTA button must use high-contrast action-primary-bg'
      );
    });

    test('DashboardPage uses local ledger data without a misleading server error banner', () => {
      const dashboardPath = path.resolve(
        __dirname,
        '../src/features/dashboard/DashboardPage.tsx'
      );
      const content = fs.readFileSync(dashboardPath, 'utf8');

      assert.ok(content.includes('getCachedTransactions(userId)'));
      assert.doesNotMatch(content, /Unable to refresh from server/);
    });
  });

  describe('3. Account Password Status & Security Actions', () => {
    test('changePasswordAction and setAccountPasswordAction persist has_password metadata', () => {
      const actionsPath = path.resolve(__dirname, '../src/app/login/actions.ts');
      const content = fs.readFileSync(actionsPath, 'utf8');

      assert.ok(
        content.includes('has_password: true'),
        'Auth update must persist has_password: true metadata'
      );
      assert.ok(
        content.includes('password_set_at'),
        'Auth update must record password_set_at timestamp'
      );
    });

    test('verifyCurrentPasswordAction is implemented for server-side reauthentication', () => {
      const actionsPath = path.resolve(__dirname, '../src/app/login/actions.ts');
      const content = fs.readFileSync(actionsPath, 'utf8');

      assert.ok(
        content.includes('export async function verifyCurrentPasswordAction'),
        'Must export verifyCurrentPasswordAction'
      );
      assert.ok(
        content.includes('signInWithPassword'),
        'Must verify password against Supabase auth'
      );
      assert.ok(
        content.includes('valid: true'),
        'Must return valid: true on success'
      );
      assert.ok(
        content.includes('valid: false'),
        'Must return valid: false on incorrect password'
      );
    });

    test('TransactionAppShell keeps configured, unconfigured, and unknown password states distinct', () => {
      const shellPath = path.resolve(
        __dirname,
        '../src/features/transactions/TransactionAppShell.tsx'
      );
      const content = fs.readFileSync(shellPath, 'utf8');

      assert.ok(
        content.includes("useState<PasswordStatus>(user?.passwordStatus ?? 'unknown')"),
        'Must preserve unknown password status in AppShell'
      );
      assert.ok(
        content.includes("setPasswordStatus('configured')"),
        'Must update status after password set/change/verification success'
      );
      assert.ok(
        content.includes("'Password Settings'"),
        'Unknown password state must use a neutral Settings action'
      );
    });
  });

  describe('4. Simplified & Secure Password-Protected PDF Export', () => {
    test('ExportPdfDialog offers two clear download buttons', () => {
      const dialogPath = path.resolve(
        __dirname,
        '../src/features/transactions/ExportPdfDialog.tsx'
      );
      const content = fs.readFileSync(dialogPath, 'utf8');

      assert.ok(
        content.includes('Download Standard PDF'),
        'Must have Download Standard PDF button'
      );
      assert.ok(
        content.includes('Download Password-Protected PDF'),
        'Must have Download Password-Protected PDF button'
      );
    });

    test('ExportPdfDialog provides both Arth account password and separate PDF password options', () => {
      const dialogPath = path.resolve(
        __dirname,
        '../src/features/transactions/ExportPdfDialog.tsx'
      );
      const content = fs.readFileSync(dialogPath, 'utf8');

      assert.ok(
        content.includes('Use my Arth account password'),
        'Must provide Arth account password option'
      );
      assert.ok(
        content.includes('Use a separate PDF password'),
        'Must provide separate PDF password option'
      );
      assert.ok(
        content.includes('Anyone who knows your Arth account password may also be able to access your Arth account'),
        'Must display security warning for account password usage'
      );
      assert.ok(
        content.includes('verifyCurrentPasswordAction'),
        'Must import and verify current account password via server action'
      );
    });

    test('ExportPdfDialog handles passwordless accounts with guidance', () => {
      const dialogPath = path.resolve(
        __dirname,
        '../src/features/transactions/ExportPdfDialog.tsx'
      );
      const content = fs.readFileSync(dialogPath, 'utf8');

      assert.ok(
        content.includes('Enter your existing Arth password. If you do not have one'),
        'Must allow real verification even when status metadata is missing'
      );
    });

    test('CategoryManager supports custom emoji/icon selection and inline renaming', () => {
      const managerPath = path.resolve(
        __dirname,
        '../src/features/categories/CategoryManager.tsx'
      );
      const content = fs.readFileSync(managerPath, 'utf8');

      assert.ok(
        content.includes('PRESET_CATEGORY_ICONS'),
        'Must import and render preset category icons'
      );
      assert.ok(
        content.includes('resolveCategoryIcon'),
        'Must resolve icons using resolveCategoryIcon'
      );
      assert.ok(
        content.includes('startEditing(cat)') && content.includes('updateCategory(cat.id'),
        'Must allow renaming and editing categories'
      );
      assert.ok(
        content.includes('updateCategory(cat.id'),
        'Must update existing category preserving UUID'
      );
    });
  });
});
