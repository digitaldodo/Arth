'use client';

import { useEffect, useRef, useCallback } from 'react';
import {
  isCriticalOperationActive,
  onCriticalOperationChange,
} from './critical-operation';
import { getApplicationRuntimeMode } from '@/lib/platform-mode';

export interface PwaUpdateOptions {
  checkIntervalMs?: number; // Default: 5 minutes (300,000 ms)
  throttleMs?: number; // Minimum time between checks (default: 30,000 ms)
}

/**
 * Hook providing service worker registration and safe, non-disruptive background updates.
 * Supports both mobile and desktop installed PWAs while keeping browser sessions classified
 * separately so offline ledger shells only activate in standalone installed windows.
 */
export function usePwaUpdate(options: PwaUpdateOptions = {}) {
  const {
    checkIntervalMs = 5 * 60 * 1000, // 5 minutes
    throttleMs = 30 * 1000, // 30 seconds
  } = options;

  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const lastCheckTimeRef = useRef<number>(0);
  const currentBuildIdRef = useRef<string | null>(null);
  const waitingWorkerRef = useRef<ServiceWorker | null>(null);
  const activationRequestedRef = useRef<WeakSet<ServiceWorker>>(new WeakSet());
  const pendingReloadRef = useRef<boolean>(false);
  const hasLoadedControllerRef = useRef<boolean>(false);

  const activateWaitingWorker = useCallback((worker: ServiceWorker) => {
    if (!worker) return;
    if (worker.state === 'redundant') return;
    if (activationRequestedRef.current.has(worker)) return;
    activationRequestedRef.current.add(worker);

    if (isCriticalOperationActive()) {
      console.log('[PWA Update] Deferring update activation: critical operation in progress');
      const unsubscribe = onCriticalOperationChange((isBusy) => {
        if (!isBusy) {
          unsubscribe();
          if (worker.state === 'redundant') return;
          console.log('[PWA Update] Critical operation completed. Activating update now.');
          worker.postMessage({ type: 'SKIP_WAITING' });
        }
      });
      return;
    }

    console.log('[PWA Update] Activating new service worker version');
    worker.postMessage({ type: 'SKIP_WAITING' });
  }, []);

  const checkForUpdate = useCallback(async () => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    const now = Date.now();
    if (now - lastCheckTimeRef.current < throttleMs) {
      return;
    }
    lastCheckTimeRef.current = now;

    try {
      // 1. Check /api/version for deployment updates
      try {
        const res = await fetch(`/api/version?_=${now}`, {
          cache: 'no-store',
          headers: { Pragma: 'no-cache' },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.buildId) {
            if (!currentBuildIdRef.current) {
              try {
                currentBuildIdRef.current = localStorage.getItem('arth_build_id');
              } catch {
                currentBuildIdRef.current = null;
              }
            }
            if (!currentBuildIdRef.current) {
              currentBuildIdRef.current = data.buildId;
            } else if (currentBuildIdRef.current !== data.buildId) {
              console.log(
                `[PWA Update] New deployment detected (${currentBuildIdRef.current} → ${data.buildId}). Triggering immediate SW update check.`
              );
              currentBuildIdRef.current = data.buildId;
              try {
                localStorage.setItem('arth_build_id', data.buildId);
              } catch {
                // Persistent comparison is an enhancement; SW checks still work.
              }
              const reg =
                registrationRef.current ?? (await navigator.serviceWorker.getRegistration());
              if (reg) {
                registrationRef.current = reg;
                await reg.update();
              }
              return;
            }
            try {
              localStorage.setItem('arth_build_id', data.buildId);
            } catch {
              // Persistent comparison is an enhancement; SW checks still work.
            }
          }
        }
      } catch {
        // Network failure; proceed with standard SW update check
      }

      // 2. Trigger browser native service worker update
      if (registrationRef.current) {
        await registrationRef.current.update();
      } else {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          registrationRef.current = reg;
          await reg.update();
        }
      }
    } catch (err) {
      console.warn('[PWA Update] Error checking for updates:', err);
    }
  }, [throttleMs]);

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !('serviceWorker' in navigator) ||
      process.env.NODE_ENV === 'test'
    ) {
      return;
    }

    hasLoadedControllerRef.current = Boolean(navigator.serviceWorker.controller);

    const classifyClient = () => {
      const runtimeMode = getApplicationRuntimeMode();
      const message = { type: 'CLASSIFY_CLIENT', runtimeMode };
      navigator.serviceWorker.controller?.postMessage(message);
      registrationRef.current?.active?.postMessage(message);
    };

    let isMounted = true;
    let refreshTriggered = false;

    const executeSafeReload = () => {
      if (refreshTriggered) return;

      const lastReload = Number(sessionStorage.getItem('arth_last_sw_reload') || 0);
      if (Date.now() - lastReload < 10000) {
        console.warn('[PWA Update] Reload suppressed: cooldown active');
        return;
      }

      refreshTriggered = true;
      sessionStorage.setItem('arth_last_sw_reload', String(Date.now()));
      console.log('[PWA Update] Reloading to activate updated version.');
      window.location.reload();
    };

    const handleControllerChange = () => {
      classifyClient();
      if (!hasLoadedControllerRef.current) {
        hasLoadedControllerRef.current = true;
        return;
      }

      if (refreshTriggered) return;

      if (isCriticalOperationActive()) {
        console.log('[PWA Update] Deferring reload: user is currently editing or saving data');
        pendingReloadRef.current = true;

        const unsubscribe = onCriticalOperationChange((isBusy) => {
          if (!isBusy && pendingReloadRef.current && !refreshTriggered) {
            unsubscribe();
            pendingReloadRef.current = false;
            executeSafeReload();
          }
        });
        return;
      }

      executeSafeReload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    // Re-classify client if browser transitions into standalone display mode after installation
    let standaloneQuery: MediaQueryList | null = null;
    try {
      standaloneQuery = window.matchMedia('(display-mode: standalone)');
      standaloneQuery.addEventListener('change', classifyClient);
    } catch {
      standaloneQuery = null;
    }
    window.addEventListener('appinstalled', classifyClient);

    // Register /sw.js across supported origins so PWA installability and precached offline
    // shells are ready for both mobile and Windows/desktop standalone installs.
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        if (!isMounted) return;
        registrationRef.current = reg;
        classifyClient();

        if (reg.waiting) {
          waitingWorkerRef.current = reg.waiting;
          activateWaitingWorker(reg.waiting);
        }

        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('[PWA Update] New service worker installed and waiting.');
              waitingWorkerRef.current = newWorker;
              activateWaitingWorker(newWorker);
            }
          });
        });
      })
      .catch((err) => {
        console.warn('[PWA Update] Service Worker registration failed:', err);
      });

    void checkForUpdate();

    const intervalId = setInterval(() => {
      void checkForUpdate();
    }, checkIntervalMs);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        classifyClient();
        void checkForUpdate();
      }
    };

    const handleFocus = () => {
      void checkForUpdate();
    };

    const handleOnline = () => {
      void checkForUpdate();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      standaloneQuery?.removeEventListener('change', classifyClient);
      window.removeEventListener('appinstalled', classifyClient);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
    };
  }, [activateWaitingWorker, checkForUpdate, checkIntervalMs]);

  return {
    checkForUpdate,
  };
}
