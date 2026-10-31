import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Starting Balances Authentication & Data Integrity Test Suite', () => {
  const projectRoot = path.resolve(__dirname, '..');
  const modalPath = path.join(
    projectRoot,
    'src',
    'features',
    'dashboard',
    'ConfigureStartingBalancesModal.tsx'
  );
  const balanceCardPath = path.join(
    projectRoot,
    'src',
    'features',
    'dashboard',
    'BalanceCard.tsx'
  );
  const dashboardPath = path.join(
    projectRoot,
    'src',
    'features',
    'dashboard',
    'DashboardPage.tsx'
  );
  const appShellPath = path.join(
    projectRoot,
    'src',
    'features',
    'transactions',
    'TransactionAppShell.tsx'
  );

  describe('1. Authentication Flow & Hydration State Protection', () => {
    test('DashboardPage passes userId prop down to BalanceCard', () => {
      assert.ok(fs.existsSync(dashboardPath), 'DashboardPage.tsx must exist');
      const content = fs.readFileSync(dashboardPath, 'utf8');

      assert.ok(
        content.includes('<BalanceCard') && content.includes('userId={userId}'),
        'DashboardPage must pass userId down to BalanceCard'
      );
    });

    test('BalanceCard accepts userId prop and forwards it to ConfigureStartingBalancesModal', () => {
      assert.ok(fs.existsSync(balanceCardPath), 'BalanceCard.tsx must exist');
      const content = fs.readFileSync(balanceCardPath, 'utf8');

      assert.ok(
        content.includes('userId?: string;'),
        'BalanceCardProps must include userId'
      );
      assert.ok(
        content.includes('userId={userId}'),
        'BalanceCard must forward userId to ConfigureStartingBalancesModal'
      );
    });

    test('TransactionAppShell forwards authenticated user id to ConfigureStartingBalancesModal and DashboardPage', () => {
      assert.ok(fs.existsSync(appShellPath), 'TransactionAppShell.tsx must exist');
      const content = fs.readFileSync(appShellPath, 'utf8');

      assert.ok(
        content.includes('userId={user.id}'),
        'TransactionAppShell must pass user.id to DashboardPage'
      );
      assert.ok(
        content.includes('userId={user?.id}'),
        'TransactionAppShell must pass user?.id to ConfigureStartingBalancesModal'
      );
    });

    test('ConfigureStartingBalancesModal displays loading state while auth is resolving without premature warning', () => {
      assert.ok(fs.existsSync(modalPath), 'ConfigureStartingBalancesModal.tsx must exist');
      const content = fs.readFileSync(modalPath, 'utf8');

      assert.ok(
        content.includes('isResolvingAuth'),
        'Modal must track isResolvingAuth state'
      );
      assert.ok(
        content.includes('Checking authentication…'),
        'Modal must show a checking authentication loader instead of false unauthenticated banner'
      );
      assert.ok(
        content.includes('fetchCurrentUser'),
        'Modal must resolve session with fetchCurrentUser if userId prop is initially absent'
      );
    });

    test('Genuinely unauthenticated or expired session shows clear Authentication Required state with Sign In link', () => {
      const content = fs.readFileSync(modalPath, 'utf8');

      assert.ok(
        content.includes('Authentication Required'),
        'Modal must display Authentication Required title for expired sessions'
      );
      assert.ok(
        content.includes('href="/login"'),
        'Modal must provide a direct Sign In action when unauthenticated'
      );
      assert.ok(
        content.includes('Active session required. Please sign in to save starting balances.'),
        'Submit guard must require active session'
      );
    });

    test('Session expiration on save transitions to expired state with clear notice', () => {
      const content = fs.readFileSync(modalPath, 'utf8');

      assert.ok(
        content.includes('Your session has expired. Please sign in again.'),
        'Must detect 401 or session expiration error and inform user clearly'
      );
      assert.ok(
        content.includes('setAuthExpired(true)'),
        'Must update authExpired state on 401 error'
      );
    });
  });

  describe('2. Starting Balance Defaults & Elimination of Arbitrary Values', () => {
    test('Unconfigured or new accounts initialize strictly to 0.00 cash and 0.00 online (Total ₹0.00)', () => {
      const content = fs.readFileSync(modalPath, 'utf8');

      assert.ok(
        content.includes("setCashStr('0.00');") &&
        content.includes("setOnlineStr('0.00');"),
        'Modal must reset to exact 0.00 cash and 0.00 online when balances are unconfigured'
      );
    });

    test('Configured accounts load the user actual saved balances from activeBalances', () => {
      const content = fs.readFileSync(modalPath, 'utf8');

      assert.ok(
        content.includes('activeBalances?.balances_configured'),
        'Modal must check activeBalances.balances_configured flag'
      );
      assert.ok(
        content.includes('(activeBalances.starting_cash_paise / 100).toFixed(2)'),
        'Must convert integer paise to INR string for cash'
      );
      assert.ok(
        content.includes('(activeBalances.starting_online_paise / 100).toFixed(2)'),
        'Must convert integer paise to INR string for online'
      );
    });

    test('Reopening modal synchronizes inputs with latest saved balances via useEffect', () => {
      const content = fs.readFileSync(modalPath, 'utf8');

      assert.ok(
        content.includes('useEffect(() => {') &&
        content.includes('[isOpen, activeBalances]'),
        'Modal must re-sync input values whenever isOpen changes'
      );
    });

    test('Input fields specify autoComplete="off" and disable browser autofill/restoration', () => {
      const content = fs.readFileSync(modalPath, 'utf8');

      const cashInputMatch = content.includes('id="starting-cash"');
      const onlineInputMatch = content.includes('id="starting-online"');
      assert.ok(cashInputMatch && onlineInputMatch, 'Both inputs must exist');

      assert.ok(
        content.includes('autoComplete="off"'),
        'Inputs must specify autoComplete="off" to prevent stale browser form restoration'
      );
    });

    test('No arbitrary sample balances exist in production codebase', () => {
      const content = fs.readFileSync(modalPath, 'utf8');

      assert.ok(
        !content.includes('641'),
        'Modal must not contain arbitrary 641 placeholder'
      );
    });
  });

  describe('3. Save Operation & Client/Server Contracts', () => {
    test('When online, modal calls apiConfigureStartingBalances and waits for server response', () => {
      const content = fs.readFileSync(modalPath, 'utf8');

      assert.ok(
        content.includes('apiConfigureStartingBalances(payload)'),
        'Online save must await authoritative server response'
      );
      assert.ok(
        content.includes('await setCachedBalances(updated, effectiveUserId)'),
        'Local cache must be updated only after server responds'
      );
    });

    test('When offline, modal uses syncEngine.configureStartingBalancesLocalFirst for durable PWA outbox', () => {
      const content = fs.readFileSync(modalPath, 'utf8');

      assert.ok(
        content.includes('syncEngine.configureStartingBalancesLocalFirst'),
        'PWA offline mode must enqueue mutation to durable outbox'
      );
    });

    test('Modal prevents duplicate submissions and displays Saving state', () => {
      const content = fs.readFileSync(modalPath, 'utf8');

      assert.ok(
        content.includes('setIsSubmitting(true)'),
        'Modal must set isSubmitting on submit'
      );
      assert.ok(
        content.includes("isSubmitting ? 'Saving…' : 'Save Starting Balances'"),
        'Submit button must show Saving state'
      );
      assert.ok(
        content.includes('disabled={isSubmitting}'),
        'Submit and cancel buttons must be disabled while saving'
      );
    });

    test('Failed server request displays actual error message without claiming unauthenticated', () => {
      const content = fs.readFileSync(modalPath, 'utf8');

      assert.ok(
        content.includes("err instanceof Error ? err.message : 'Failed to save starting balances'"),
        'Must display real API error message'
      );
    });
  });
});
