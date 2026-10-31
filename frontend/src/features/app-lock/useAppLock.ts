'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  appLockChannelName,
  newAppLockPreferences,
  readAppLockPreferences,
  writeAppLockPreferences,
  type AppLockPreferences,
  type AutoLockTimeout,
} from './storage';
import {
  derivePasscodeHash,
  verifyPasscode,
} from './passcode-crypto';
import {
  canUsePlatformAuthenticator,
  registerPlatformCredential,
  verifyPlatformCredential,
} from './webauthn-client';
import { InactivityLockController, timeoutToMs } from './inactivity-lock';

interface AppLockMessage {
  type?: unknown;
}

export function useAppLock(userId: string) {
  const [preferences, setPreferences] = useState<AppLockPreferences | null>(null);
  const [readyUserId, setReadyUserId] = useState<string | null>(null);
  const isReady = readyUserId === userId;
  const [isLocked, setIsLocked] = useState(true);
  const [supportsPlatformAuth, setSupportsPlatformAuth] = useState(false);
  const [isCheckingPlatformAuth, setIsCheckingPlatformAuth] = useState(true);
  const preferencesRef = useRef<AppLockPreferences | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const busyRef = useRef(false);

  const updatePreferences = useCallback(
    (next: AppLockPreferences) => {
      writeAppLockPreferences(userId, next);
      preferencesRef.current = next;
      setPreferences(next);
    },
    [userId]
  );

  const lockNow = useCallback(() => {
    if (!preferencesRef.current?.enabled) return;
    setIsLocked(true);
    try {
      channelRef.current?.postMessage({ type: 'LOCK' });
    } catch {
      /* tab coordination is best effort */
    }
  }, []);

  const unlockAfterVerification = useCallback(() => {
    setIsLocked(false);
  }, []);

  // Initialize preferences and platform auth availability
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      let current: AppLockPreferences;
      try {
        current = readAppLockPreferences(userId);
      } catch {
        current = newAppLockPreferences();
      }
      preferencesRef.current = current;
      setPreferences(current);
      // Lock if enabled
      setIsLocked(current.enabled);
      setReadyUserId(userId);

      void canUsePlatformAuthenticator()
        .then((available) => {
          if (!cancelled) {
            setSupportsPlatformAuth(available);
            setIsCheckingPlatformAuth(false);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setSupportsPlatformAuth(false);
            setIsCheckingPlatformAuth(false);
          }
        });
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Cross-tab synchronization via BroadcastChannel
  useEffect(() => {
    if (!isReady || !preferences) return;
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;
    const channel = new BroadcastChannel(appLockChannelName(userId));
    channelRef.current = channel;
    channel.onmessage = (event: MessageEvent<AppLockMessage>) => {
      if (event.data?.type === 'LOCK') {
        if (preferencesRef.current?.enabled) setIsLocked(true);
      } else if (event.data?.type === 'ENABLED') {
        const latest = readAppLockPreferences(userId);
        preferencesRef.current = latest;
        setPreferences(latest);
        if (latest.enabled) setIsLocked(true);
      } else if (event.data?.type === 'DISABLED') {
        const latest = readAppLockPreferences(userId);
        preferencesRef.current = latest;
        setPreferences(latest);
        if (!latest.enabled) setIsLocked(false);
      }
    };
    return () => {
      channel.close();
      if (channelRef.current === channel) channelRef.current = null;
    };
  }, [isReady, preferences, userId]);

  // Inactivity & background auto-locking controller
  useEffect(() => {
    if (!isReady || !preferences?.enabled || isLocked) return;

    const timeoutMs = timeoutToMs(preferences.autoLockTimeout);
    const lockOnBg = preferences.lockOnBackground !== false;

    const controller = new InactivityLockController(
      lockNow,
      undefined,
      timeoutMs,
      lockOnBg
    );
    controller.setVisible(document.visibilityState === 'visible');
    controller.start();

    const onActivity = (event: Event) => {
      if (document.visibilityState !== 'visible') return;
      const target = event.target;
      if (target instanceof Element && target.closest('[data-app-lock-screen]')) return;
      controller.activity();
    };

    const onVisibilityChange = () => {
      controller.setVisible(document.visibilityState === 'visible');
    };

    const onResume = () => controller.checkDeadline();

    document.addEventListener('pointerdown', onActivity, true);
    document.addEventListener('touchstart', onActivity, { capture: true, passive: true });
    document.addEventListener('keydown', onActivity, true);
    document.addEventListener('input', onActivity, true);
    document.addEventListener('change', onActivity, true);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onResume);
    window.addEventListener('pageshow', onResume);

    return () => {
      controller.stop();
      document.removeEventListener('pointerdown', onActivity, true);
      document.removeEventListener('touchstart', onActivity, true);
      document.removeEventListener('keydown', onActivity, true);
      document.removeEventListener('input', onActivity, true);
      document.removeEventListener('change', onActivity, true);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onResume);
      window.removeEventListener('pageshow', onResume);
    };
  }, [isReady, isLocked, lockNow, preferences?.enabled, preferences?.autoLockTimeout, preferences?.lockOnBackground]);

  // 1. Set / Configure Passcode (Works 100% Offline)
  const setPasscode = useCallback(
    async (passcode: string) => {
      if (passcode.length < 4) {
        throw new Error('App passcode must be at least 4 digits or characters.');
      }
      const current = preferencesRef.current || newAppLockPreferences();
      const { saltHex, hashHex } = await derivePasscodeHash(passcode);

      const updated: AppLockPreferences = {
        ...current,
        enabled: true,
        configured: true,
        passcodeSalt: saltHex,
        passcodeHash: hashHex,
      };

      updatePreferences(updated);
      setIsLocked(false);
      try {
        channelRef.current?.postMessage({ type: 'ENABLED' });
      } catch {
        /* best effort */
      }
    },
    [updatePreferences]
  );

  // 2. Change Passcode (Requires current passcode)
  const changePasscode = useCallback(
    async (currentPasscode: string, newPasscode: string) => {
      const current = preferencesRef.current;
      if (!current?.passcodeHash || !current?.passcodeSalt) {
        throw new Error('No existing passcode configured on this device.');
      }
      const isValid = await verifyPasscode(
        currentPasscode,
        current.passcodeSalt,
        current.passcodeHash
      );
      if (!isValid) {
        throw new Error('Incorrect current passcode. Please try again.');
      }
      await setPasscode(newPasscode);
    },
    [setPasscode]
  );

  // 3. Verify Passcode for Unlock (100% Offline)
  const verifyPasscodeUnlock = useCallback(
    async (enteredPasscode: string): Promise<boolean> => {
      const current = preferencesRef.current;
      if (!current?.passcodeHash || !current?.passcodeSalt) {
        throw new Error('No passcode configured on this device.');
      }
      const isValid = await verifyPasscode(
        enteredPasscode,
        current.passcodeSalt,
        current.passcodeHash
      );
      if (isValid) {
        setIsLocked(false);
        return true;
      }
      return false;
    },
    []
  );

  // 4. Update Auto-Lock Settings
  const updateAutoLockSettings = useCallback(
    (timeout: AutoLockTimeout, lockOnBackground: boolean) => {
      const current = preferencesRef.current || newAppLockPreferences();
      const updated: AppLockPreferences = {
        ...current,
        autoLockTimeout: timeout,
        lockOnBackground,
      };
      updatePreferences(updated);
    },
    [updatePreferences]
  );

  // 5. Update Biometrics Enabled
  const updateBiometricsEnabled = useCallback(
    (enabled: boolean) => {
      const current = preferencesRef.current || newAppLockPreferences();
      const updated: AppLockPreferences = {
        ...current,
        biometricsEnabled: enabled,
      };
      updatePreferences(updated);
    },
    [updatePreferences]
  );

  // 6. Disable App Lock after authentication
  const disableAfterVerification = useCallback(() => {
    const current = preferencesRef.current;
    if (!current) return;
    const updated: AppLockPreferences = {
      ...current,
      enabled: false,
    };
    updatePreferences(updated);
    setIsLocked(false);
    try {
      channelRef.current?.postMessage({ type: 'DISABLED' });
    } catch {
      /* best effort */
    }
  }, [updatePreferences]);

  // 7. Reset / Recover App Lock (After reauthentication)
  const resetAppLock = useCallback(() => {
    const current = preferencesRef.current || newAppLockPreferences();
    const updated: AppLockPreferences = {
      ...current,
      enabled: false,
      configured: false,
      passcodeSalt: undefined,
      passcodeHash: undefined,
      biometricsEnabled: false,
    };
    updatePreferences(updated);
    setIsLocked(false);
    try {
      channelRef.current?.postMessage({ type: 'DISABLED' });
    } catch {
      /* best effort */
    }
  }, [updatePreferences]);

  // Optional WebAuthn Platform Authenticator Registration
  const registerDevice = useCallback(async () => {
    const current = preferencesRef.current;
    if (!current || busyRef.current) throw new Error('Device setup is already in progress.');
    if (!supportsPlatformAuth) {
      throw new Error('A supported platform authenticator is not available in this browser.');
    }
    busyRef.current = true;
    try {
      await registerPlatformCredential(current.deviceId);
      const configured: AppLockPreferences = {
        ...current,
        biometricsEnabled: true,
      };
      updatePreferences(configured);
    } finally {
      busyRef.current = false;
    }
  }, [supportsPlatformAuth, updatePreferences]);

  // Optional WebAuthn Platform Authenticator Verification
  const verifyDevice = useCallback(async () => {
    const current = preferencesRef.current;
    if (!current?.deviceId) throw new Error('This device is not configured for biometric verification.');
    if (busyRef.current) throw new Error('Verification is already in progress.');
    busyRef.current = true;
    try {
      await verifyPlatformCredential(current.deviceId);
      setIsLocked(false);
    } finally {
      busyRef.current = false;
    }
  }, []);

  return {
    isReady,
    isLocked,
    isEnabled: preferences?.enabled ?? false,
    isConfigured: preferences?.configured ?? false,
    hasLocalPasscode: Boolean(preferences?.passcodeHash),
    autoLockTimeout: preferences?.autoLockTimeout ?? '5m',
    lockOnBackground: preferences?.lockOnBackground !== false,
    biometricsEnabled: preferences?.biometricsEnabled === true,
    deviceId: preferences?.deviceId ?? '',
    supportsPlatformAuth,
    isCheckingPlatformAuth,
    setPasscode,
    changePasscode,
    verifyPasscodeUnlock,
    updateAutoLockSettings,
    updateBiometricsEnabled,
    registerDevice,
    verifyDevice,
    unlockAfterVerification,
    disableAfterVerification,
    resetAppLock,
    lockNow,
  };
}
