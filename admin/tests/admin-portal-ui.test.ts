import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sanitizeAdminBackendPayload } from '../src/app/api/admin/[...segments]/route.js';

describe('Admin Portal UI & BFF Security Verification', () => {
  test('BFF payload sanitizer strips bearer sessionToken before browser response', () => {
    const { safePayload, sessionToken } = sanitizeAdminBackendPayload({
      authenticated: true,
      requiresActivation: false,
      identity: { username: 'Ansh', isOwner: true },
      sessionToken: 'secret-jwt-token-value',
    });

    assert.equal(sessionToken, 'secret-jwt-token-value');
    assert.deepEqual(safePayload, {
      authenticated: true,
      requiresActivation: false,
      identity: { username: 'Ansh', isOwner: true },
    });
    assert.equal('sessionToken' in (safePayload as Record<string, unknown>), false);
  });

  test('Admin client bundle contains zero pre-filled passwords, roll numbers, or service keys', () => {
    const adminSrcDir = path.resolve(process.cwd(), 'src');
    const forbidden = [
      String(2315000000 + 536),
      String(2315000000 + 441),
      String(2315000000 + 330),
      String(2315000000 + 205),
      String(2315000000 + 708),
      'SUPABASE_SERVICE_ROLE_KEY',
      'RESEND_API_KEY',
    ];

    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx|css)$/.test(entry.name)) files.push(full);
      }
    };
    walk(adminSrcDir);

    assert.ok(files.length >= 12, 'Expected full admin portal source tree');
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      for (const token of forbidden) {
        assert.equal(
          content.includes(token),
          false,
          `Forbidden secret/credential ${token} found in admin/${path.relative(adminSrcDir, file)}`
        );
      }
    }
  });

  test('Admin shell hides Owner-only links from non-owner roles and matches Ledger Minimal tokens', () => {
    const shellSource = fs.readFileSync(path.resolve(process.cwd(), 'src/components/AdminShell.tsx'), 'utf8');
    assert.ok(shellSource.includes("href: '/audit', label: 'Audit Logs', ownerOnly: true"));
    assert.ok(shellSource.includes("href: '/access', label: 'Admin Access', ownerOnly: true"));
    assert.ok(shellSource.includes('identity.isOwner && identity.role === \'OWNER_ADMIN\''));

    const cssSource = fs.readFileSync(path.resolve(process.cwd(), 'src/app/globals.css'), 'utf8');
    assert.ok(cssSource.includes('--bg-canvas: #F8F8F6'));
    assert.ok(cssSource.includes('--bg-canvas: #0C0A09'));
  });
});
