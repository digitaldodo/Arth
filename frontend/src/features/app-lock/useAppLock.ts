'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { appLockChannelName, newAppLockPreferences, readAppLockPreferences, writeAppLockPreferences, type AppLockPreferences } from './storage';
import { canUsePlatformAuthenticator, registerPlatformCredential, verifyPlatformCredential } from './webauthn-client';
import { InactivityLockController } from './inactivity-lock';

interface AppLockMessage { type?: unknown }

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

  const updatePreferences = useCallback((next: AppLockPreferences) => {
    writeAppLockPreferences(userId, next);
    preferencesRef.current = next;
    setPreferences(next);
  }, [userId]);

  const lockNow = useCallback(() => {
    if (!preferencesRef.current?.enabled) return;
    setIsLocked(true);
    try { channelRef.current?.postMessage({ type: 'LOCK' }); } catch { /* tab coordination is best effort */ }
  }, []);

  const unlockAfterVerification = useCallback(() => {
    setIsLocked(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      let current: AppLockPreferences;
      try {
        current = readAppLockPreferences(userId);
      } catch {
        current = { ...newAppLockPreferences(), enabled: true };
      }
      preferencesRef.current = current;
      setPreferences(current);
      setIsLocked(current.enabled);
      setReadyUserId(userId);
      void canUsePlatformAuthenticator().then((available) => {
        if (!cancelled) {
          setSupportsPlatformAuth(available);
          setIsCheckingPlatformAuth(false);
        }
      }).catch(() => {
        if (!cancelled) {
          setSupportsPlatformAuth(false);
          setIsCheckingPlatformAuth(false);
        }
      });
    });
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    if (!isReady || !preferences) return;
    if (!('BroadcastChannel' in window)) return;
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

  useEffect(() => {
    if (!isReady || !preferences?.enabled || isLocked) return;
    const controller = new InactivityLockController(lockNow);
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
  }, [isReady, isLocked, lockNow, preferences?.enabled]);

  const registerDevice = useCallback(async () => {
    const current = preferencesRef.current;
    if (!current || busyRef.current) throw new Error('Device setup is already in progress.');
    if (!supportsPlatformAuth) throw new Error('A supported platform authenticator is not available in this browser.');
    busyRef.current = true;
    try {
      const pending = { ...current, enabled: false, configured: false };
      updatePreferences(pending);
      await registerPlatformCredential(current.deviceId);
      const configured = { ...pending, enabled: true, configured: true };
      updatePreferences(configured);
      setIsLocked(false);
      try { channelRef.current?.postMessage({ type: 'ENABLED' }); } catch { /* best effort */ }
    } finally {
      busyRef.current = false;
    }
  }, [supportsPlatformAuth, updatePreferences]);

  const verifyDevice = useCallback(async () => {
    const current = preferencesRef.current;
    if (!current?.configured || !current.deviceId) throw new Error('This device does not have an authenticator configured.');
    if (busyRef.current) throw new Error('Verification is already in progress.');
    busyRef.current = true;
    try {
      await verifyPlatformCredential(current.deviceId);
    } finally {
      busyRef.current = false;
    }
  }, []);

  const enableAfterSetup = useCallback(() => {
    const current = preferencesRef.current;
    if (!current?.configured) throw new Error('Set up device verification before enabling App Lock.');
    updatePreferences({ ...current, enabled: true });
    setIsLocked(false);
    try { channelRef.current?.postMessage({ type: 'ENABLED' }); } catch { /* best effort */ }
  }, [updatePreferences]);

  const disableAfterVerification = useCallback(() => {
    const current = preferencesRef.current;
    if (!current) return;
    updatePreferences({ ...current, enabled: false });
    setIsLocked(false);
    try { channelRef.current?.postMessage({ type: 'DISABLED' }); } catch { /* best effort */ }
  }, [updatePreferences]);

  const recoverBySigningIn = useCallback(() => {
    const current = preferencesRef.current;
    if (!current) return;
    updatePreferences({ ...current, enabled: false });
    setIsLocked(true);
    try { channelRef.current?.postMessage({ type: 'LOCK' }); } catch { /* best effort */ }
  }, [updatePreferences]);

  return {
    isReady,
    isLocked,
    isEnabled: preferences?.enabled ?? false,
    isConfigured: preferences?.configured ?? false,
    deviceId: preferences?.deviceId ?? '',
    supportsPlatformAuth,
    isCheckingPlatformAuth,
    registerDevice,
    verifyDevice,
    unlockAfterVerification,
    enableAfterSetup,
    disableAfterVerification,
    recoverBySigningIn,
    lockNow,
  };
}
