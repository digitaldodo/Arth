'use client';

import { useEffect, useRef } from 'react';

/**
 * Coordinates critical user operations (such as transaction editing, form input,
 * or background outbox synchronization) to guarantee that PWA updates never reload
 * the application while unsaved financial data or active mutations are in flight.
 */

let localCriticalCount = 0;
const changeListeners = new Set<(isBusy: boolean) => void>();

// Multi-tab channel to avoid activating updates when another open tab is typing
let channel: BroadcastChannel | null = null;
const remoteBusyTabs = new Set<string>();
const TAB_ID = typeof crypto !== 'undefined' && crypto.randomUUID
  ? crypto.randomUUID()
  : `tab-${Math.random().toString(36).substring(2, 9)}`;

if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  try {
    channel = new BroadcastChannel('arth_pwa_critical_channel');
    channel.onmessage = (event) => {
      const { type, tabId } = event.data || {};
      if (!tabId || tabId === TAB_ID) return;

      if (type === 'BUSY_START') {
        remoteBusyTabs.add(tabId);
        notify();
      } else if (type === 'BUSY_END') {
        remoteBusyTabs.delete(tabId);
        notify();
      }
    };
  } catch {
    channel = null;
  }
}

function broadcastState(isBusy: boolean) {
  if (!channel) return;
  try {
    channel.postMessage({
      type: isBusy ? 'BUSY_START' : 'BUSY_END',
      tabId: TAB_ID,
    });
  } catch {
    // Graceful fallback if channel fails
  }
}

function notify() {
  const busy = isCriticalOperationActive();
  changeListeners.forEach((listener) => {
    try {
      listener(busy);
    } catch (err) {
      console.warn('[CriticalOperation] Listener error:', err);
    }
  });
}

/**
 * Returns true if the current tab OR any other tab is in the middle of a critical operation.
 */
export function isCriticalOperationActive(): boolean {
  return localCriticalCount > 0 || remoteBusyTabs.size > 0;
}

/**
 * Returns true if ONLY the current tab is in the middle of a critical operation.
 */
export function isLocalCriticalOperationActive(): boolean {
  return localCriticalCount > 0;
}

/**
 * Registers an active critical operation. Returns an unregister function.
 */
export function registerCriticalOperation(): () => void {
  localCriticalCount++;
  if (localCriticalCount === 1) {
    broadcastState(true);
  }
  notify();

  let unregistered = false;
  return () => {
    if (unregistered) return;
    unregistered = true;
    localCriticalCount = Math.max(0, localCriticalCount - 1);
    if (localCriticalCount === 0) {
      broadcastState(false);
    }
    notify();
  };
}

/**
 * Subscribes to changes in critical operation state.
 */
export function onCriticalOperationChange(listener: (isBusy: boolean) => void): () => void {
  changeListeners.add(listener);
  return () => {
    changeListeners.delete(listener);
  };
}

/**
 * React hook that registers a critical operation while isActive is true.
 * Ensures the PWA does not reload while the modal, form, or sync is in flight.
 */
export function useCriticalOperation(isActive: boolean) {
  const unregisterRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (isActive) {
      unregisterRef.current = registerCriticalOperation();
    } else if (unregisterRef.current) {
      unregisterRef.current();
      unregisterRef.current = null;
    }

    return () => {
      if (unregisterRef.current) {
        unregisterRef.current();
        unregisterRef.current = null;
      }
    };
  }, [isActive]);
}

