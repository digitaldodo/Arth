import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { APP_LOCK_TIMEOUT_MS, InactivityClock, InactivityLockController } from '../src/features/app-lock/inactivity-lock.js';
import { getRelyingParty } from '../src/lib/app-lock/relying-party.js';
import { unlockAfterVerification } from '../src/features/app-lock/verification.js';
import fs from 'node:fs';
import path from 'node:path';

class FakeClock {
  monotonic = 0;
  wall = 1_000;
  nextId = 0;
  timers = new Map<number, { due: number; callback: () => void }>();

  readonly clock: InactivityClock = {
    monotonicNow: () => this.monotonic,
    wallNow: () => this.wall,
    schedule: (callback, delay) => {
      const id = ++this.nextId;
      this.timers.set(id, { due: this.wall + delay, callback });
      return id;
    },
    cancel: (id) => { this.timers.delete(Number(id)); },
  };

  advance(ms: number, options: { monoMs?: number; wallMs?: number; runTimers?: boolean } = {}) {
    this.monotonic += options.monoMs ?? ms;
    this.wall += options.wallMs ?? ms;
    if (options.runTimers === false) return;
    let next = [...this.timers.entries()].filter(([, timer]) => timer.due <= this.wall).sort((a, b) => a[1].due - b[1].due)[0];
    while (next) {
      this.timers.delete(next[0]);
      next[1].callback();
      next = [...this.timers.entries()].filter(([, timer]) => timer.due <= this.wall).sort((a, b) => a[1].due - b[1].due)[0];
    }
  }
}

describe('App Lock inactivity timing', () => {
  test('uses the fixed five-minute deadline and does not lock early', () => {
    assert.equal(APP_LOCK_TIMEOUT_MS, 300_000);
    const clock = new FakeClock();
    let locked = 0;
    const controller = new InactivityLockController(() => locked++, clock.clock);
    controller.start();
    clock.advance(299_999);
    assert.equal(locked, 0);
    clock.advance(1);
    assert.equal(locked, 1);
  });

  test('meaningful activity resets the deadline', () => {
    const clock = new FakeClock();
    let locked = 0;
    const controller = new InactivityLockController(() => locked++, clock.clock);
    controller.start();
    clock.advance(299_999);
    controller.activity();
    clock.advance(299_999);
    assert.equal(locked, 0);
    clock.advance(1);
    assert.equal(locked, 1);
  });

  test('background network work does not reset the deadline', () => {
    const clock = new FakeClock();
    let locked = 0;
    const controller = new InactivityLockController(() => locked++, clock.clock);
    controller.start();
    clock.advance(300_000);
    assert.equal(locked, 1);
  });

  test('preserves remaining time after a short background interval', () => {
    const clock = new FakeClock();
    let locked = 0;
    const controller = new InactivityLockController(() => locked++, clock.clock);
    controller.start();
    clock.advance(120_000);
    controller.setVisible(false);
    clock.advance(120_000, { monoMs: 0, wallMs: 120_000, runTimers: false });
    controller.setVisible(true);
    assert.equal(locked, 0);
    clock.advance(59_999);
    assert.equal(locked, 0);
    clock.advance(1);
    assert.equal(locked, 1);
  });

  test('locks on resume after five background minutes even if performance.now paused', () => {
    const clock = new FakeClock();
    let locked = 0;
    const controller = new InactivityLockController(() => locked++, clock.clock);
    controller.start();
    controller.setVisible(false);
    clock.advance(300_000, { monoMs: 0, wallMs: 300_000, runTimers: false });
    controller.setVisible(true);
    assert.equal(locked, 1);
  });

  test('checks elapsed time when a throttled timer finally resumes', () => {
    const clock = new FakeClock();
    let locked = 0;
    const controller = new InactivityLockController(() => locked++, clock.clock);
    controller.start();
    clock.advance(420_000, { runTimers: false });
    controller.checkDeadline();
    assert.equal(locked, 1);
  });
});

describe('App Lock WebAuthn boundaries', () => {
  test('derives the exact host as the RP ID instead of a shared hosting parent', () => {
    assert.deepEqual(getRelyingParty('https://arth-9h3f.vercel.app'), {
      origin: 'https://arth-9h3f.vercel.app',
      rpID: 'arth-9h3f.vercel.app',
    });
    assert.equal(getRelyingParty('http://localhost:3000').rpID, 'localhost');
    assert.throws(() => getRelyingParty('http://arth.example.com'), /HTTPS/);
  });

  test('server routes require user-verified WebAuthn and atomically consume bound challenges', () => {
    const root = path.resolve(__dirname, '../src');
    const registration = fs.readFileSync(path.join(root, 'app/api/app-lock/registration/verify/route.ts'), 'utf8');
    const authentication = fs.readFileSync(path.join(root, 'app/api/app-lock/authentication/verify/route.ts'), 'utf8');
    const server = fs.readFileSync(path.join(root, 'lib/app-lock/server.ts'), 'utf8');
    assert.match(registration, /expectedChallenge: challenge/);
    assert.match(registration, /expectedOrigin: origin/);
    assert.match(registration, /expectedRPID: rpID/);
    assert.match(registration, /requireUserVerification: true/);
    assert.match(authentication, /expectedChallenge: challenge/);
    assert.match(authentication, /requireUserVerification: true/);
    assert.match(server, /\.eq\('user_id', context\.userId\)/);
    assert.match(server, /\.eq\('device_id', deviceId\)/);
    assert.match(server, /\.gt\('expires_at', now\)/);
    assert.match(server, /\.is\('consumed_at', null\)/);
    assert.match(server, /challenge: null/);
  });

  test('the UI stays locked unless platform or password verification succeeds', () => {
    const root = path.resolve(__dirname, '../src/features/app-lock');
    const screen = fs.readFileSync(path.join(root, 'AppLockScreen.tsx'), 'utf8');
    const shell = fs.readFileSync(path.resolve(__dirname, '../src/features/transactions/TransactionAppShell.tsx'), 'utf8');
    assert.match(screen, /await onUnlock\(\)/);
    assert.match(shell, /unlockAfterVerification\(appLock\.verifyDevice, appLock\.unlockAfterVerification\)/);
    assert.match(shell, /hidden=\{isAppLocked\}/);
    assert.match(shell, /inert=\{isAppLocked\}/);
  });

  test('credential and challenge tables are isolated from browser roles', () => {
    const migration = fs.readFileSync(path.resolve(__dirname, '../../supabase/migrations/0022_app_lock_webauthn.sql'), 'utf8');
    assert.match(migration, /ENABLE ROW LEVEL SECURITY/g);
    assert.match(migration, /REVOKE ALL ON public\.app_lock_credentials FROM anon, authenticated/);
    assert.match(migration, /REVOKE ALL ON public\.app_lock_challenges FROM anon, authenticated/);
    assert.match(migration, /GRANT ALL ON public\.app_lock_credentials TO service_role/);
    assert.match(migration, /GRANT ALL ON public\.app_lock_challenges TO service_role/);
  });

  test('lock code does not mutate IndexedDB or trigger synchronization', () => {
    const root = path.resolve(__dirname, '../src/features/app-lock');
    for (const file of fs.readdirSync(root).filter((name) => name.endsWith('.ts') || name.endsWith('.tsx'))) {
      const source = fs.readFileSync(path.join(root, file), 'utf8');
      assert.doesNotMatch(source, /offline-db|handleSyncNow|removePendingMutation/);
    }
  });

  test('a failed verifier never runs the unlock transition', async () => {
    let unlocks = 0;
    await assert.rejects(unlockAfterVerification(async () => { throw new Error('denied'); }, () => unlocks++));
    assert.equal(unlocks, 0);
    await unlockAfterVerification(async () => {}, () => unlocks++);
    assert.equal(unlocks, 1);
  });
});
