import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sanitizeUserFacingError } from '../src/lib/error-utils';

describe('Frontend Design, UX & Responsive Layout Refinement Test Suite', () => {
  const projectRoot = path.resolve(__dirname, '..');

  describe('1. Error Sanitization & Developer-Facing Error Masking', () => {
    test('sanitizes raw PostgreSQL, PostgREST, and SQL syntax errors into respectful default message', () => {
      const sqlError = 'PGRST116: JSON object requested, multiple (or no) rows returned';
      assert.equal(
        sanitizeUserFacingError(sqlError),
        'An unexpected error occurred. Please try again.'
      );

      const dbError = 'duplicate key value violates unique constraint "users_email_key"';
      assert.equal(
        sanitizeUserFacingError(dbError),
        'An unexpected error occurred. Please try again.'
      );

      const schemaError = 'Could not find the function public.fn_account_balances without parameters in the schema cache';
      assert.equal(
        sanitizeUserFacingError(schemaError),
        'An unexpected error occurred. Please try again.'
      );
    });

    test('sanitizes network failure and connection refusal errors cleanly', () => {
      const fetchError = new Error('fetch failed: connect ECONNREFUSED 127.0.0.1:54321');
      assert.equal(
        sanitizeUserFacingError(fetchError),
        'Unable to connect to the server. Please check your internet connection and try again.'
      );
    });

    test('translates authentication credentials errors into actionable guidance', () => {
      const credError = 'Invalid login credentials';
      assert.equal(
        sanitizeUserFacingError(credError),
        'The email, username, or password you entered is incorrect. Please verify your credentials and try again.'
      );

      const alreadyExists = 'User already registered';
      assert.equal(
        sanitizeUserFacingError(alreadyExists),
        'An account with this email address already exists. Please sign in or reset your password.'
      );
    });

    test('preserves genuine user-facing validation errors without redaction', () => {
      const validationMsg = 'Category name cannot exceed 50 characters.';
      assert.equal(sanitizeUserFacingError(validationMsg), validationMsg);

      const passwordLength = 'Password must be at least 8 characters in length.';
      assert.equal(sanitizeUserFacingError(passwordLength), passwordLength);
    });
  });

  describe('2. Desktop Container Width & Multi-Column Layout Architecture', () => {
    test('UnauthenticatedHome utilizes spacious widescreen container width (max-w-7xl / 1440px)', () => {
      const homePath = path.join(projectRoot, 'src', 'app', 'UnauthenticatedHome.tsx');
      const content = fs.readFileSync(homePath, 'utf8');

      assert.ok(
        content.includes('max-w-7xl') || content.includes('1440px'),
        'UnauthenticatedHome must expand container to max-w-7xl / 1440px'
      );
      assert.ok(
        content.includes('grid-cols-1 lg:grid-cols-12'),
        'UnauthenticatedHome hero must use a 12-column desktop grid composition'
      );
      assert.ok(
        content.includes('Track personal finances with clarity and precision.'),
        'Hero must display canonical headline'
      );
      assert.ok(
        content.includes(
          'An intentional personal ledger for recording transactions, understanding spending and maintaining accurate financial records.'
        ),
        'Hero must display canonical supporting copy'
      );
      assert.ok(
        content.includes('grid-cols-1 md:grid-cols-2 lg:grid-cols-4'),
        'Core value pillars must use a 4-column balanced grid'
      );
    });

    test('LoginPage utilizes spacious widescreen container width and removes fake financial numbers', () => {
      const loginPath = path.join(projectRoot, 'src', 'app', 'login', 'page.tsx');
      const content = fs.readFileSync(loginPath, 'utf8');

      assert.ok(
        content.includes('max-w-7xl') || content.includes('1440px'),
        'LoginPage must expand container to max-w-7xl / 1440px'
      );
      assert.ok(
        content.includes('grid grid-cols-1 lg:grid-cols-12'),
        'LoginPage must use balanced 2-column desktop composition'
      );
      assert.ok(
        !content.includes('1,25,000.00'),
        'LoginPage must not contain fake salary financial numbers (1,25,000.00)'
      );
      assert.ok(
        !content.includes('Salary / Consulting'),
        'LoginPage must not contain invented mock transaction categories'
      );
      assert.ok(
        content.includes('Ledger Accounting Invariants') || content.includes('Invariant Specification'),
        'LoginPage must display genuine architectural invariants'
      );
    });

    test('TransactionAppShell uses widescreen container and removes obsolete desktop Android marketing', () => {
      const shellPath = path.join(projectRoot, 'src', 'features', 'transactions', 'TransactionAppShell.tsx');
      const content = fs.readFileSync(shellPath, 'utf8');

      assert.ok(
        content.includes('max-w-7xl 2xl:max-w-[1440px]'),
        'TransactionAppShell must expand header and main content container to 1440px'
      );
      assert.ok(
        !content.includes('title="Download Native Android App"'),
        'Top desktop header must not contain obsolete Download Native Android App marketing link'
      );
    });

    test('TransactionLedger provides desktop column header and responsive tabular alignment', () => {
      const ledgerPath = path.join(projectRoot, 'src', 'features', 'transactions', 'TransactionLedger.tsx');
      const content = fs.readFileSync(ledgerPath, 'utf8');

      assert.ok(
        content.includes('Desktop Column Alignment Header'),
        'TransactionLedger must provide desktop column alignment header'
      );
      assert.ok(
        content.includes('hidden md:grid grid-cols-12'),
        'TransactionLedger must render tabular 12-column grid layout on desktop screens'
      );
    });
  });
});
