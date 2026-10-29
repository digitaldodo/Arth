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

/**
 * Per-remote-tab state: tracks whether the tab is currently busy and the
 * timestamp of its most recent heartbeat. A tab whose heartbeat is older than
 * HEARTBEAT_EXPIRY_MS is considered stale (crashed / force-closed) and is
 * removed from the busy set so it cannot block updates indefinitely.
 */
interface RemoteTabState {
  isBusy: boolean;
  lastSeen: number; // Date.now() timestamp
}
const remoteTabs = new Map<string, RemoteTabState>();

const HEARTBEAT_INTERVAL_MS = 15_000; // busy tabs broadcast heartbeat every 15 s
const HEARTBEAT_EXPIRY_MS = 90_000;   // tolerate background throttling, then release crashed tabs

const TAB_ID =
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `tab-${Math.random().toString(36).substring(2, 9)}`;

// Heartbeat timer reference (only active while this tab is busy)
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Returns the number of remote tabs that are currently busy and have a
 * recent-enough heartbeat to be considered alive.
 */
function countActiveBusyRemoteTabs(): number {
  let count = 0;
  for (const state of remoteTabs.values()) {
    if (state.isBusy) count++;
  }
  return count;
}

/**
 * Removes remote tabs whose last heartbeat is older than HEARTBEAT_EXPIRY_MS.
 * Called periodically and whenever a message arrives.
 */
function evictStaleTabs(): boolean {
  const cutoff = Date.now() - HEARTBEAT_EXPIRY_MS;
  let evicted = false;
  for (const [id, state] of remoteTabs.entries()) {
    if (state.lastSeen < cutoff) {
      remoteTabs.delete(id);
      if (state.isBusy) evicted = true;
    }
  }
  return evicted;
}

if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  try {
    channel = new BroadcastChannel('arth_pwa_critical_channel');

    channel.onmessage = (event) => {
      const { type, tabId } = event.data || {};
      if (!tabId || tabId === TAB_ID) return;

      const now = Date.now();

      if (type === 'BUSY_START') {
        remoteTabs.set(tabId, { isBusy: true, lastSeen: now });
        notify();
      } else if (type === 'BUSY_END') {
        remoteTabs.delete(tabId);
        notify();
      } else if (type === 'HEARTBEAT') {
        // Update last-seen for the sending tab; preserve its busy state
        const existing = remoteTabs.get(tabId);
        if (existing) {
          existing.lastSeen = now;
        }
        // (If we never saw BUSY_START from this tab, ignore the heartbeat)
      }

      // Opportunistically evict any stale tabs on every incoming message
      if (evictStaleTabs()) {
        notify();
      }
    };

    // Periodic cleanup to evict stale tabs even when no messages arrive
    setInterval(() => {
      if (evictStaleTabs()) {
        notify();
      }
    }, HEARTBEAT_EXPIRY_MS);
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

function startHeartbeat() {
  if (heartbeatTimer || !channel) return;
  heartbeatTimer = setInterval(() => {
    try {
      channel?.postMessage({ type: 'HEARTBEAT', tabId: TAB_ID });
    } catch {
      // Ignore
    }
  }, HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
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
 * Returns true if the current tab OR any other alive tab is in the middle of a critical operation.
 */
export function isCriticalOperationActive(): boolean {
  return localCriticalCount > 0 || countActiveBusyRemoteTabs() > 0;
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
    startHeartbeat();
  }
  notify();

  let unregistered = false;
  return () => {
    if (unregistered) return;
    unregistered = true;
    localCriticalCount = Math.max(0, localCriticalCount - 1);
    if (localCriticalCount === 0) {
      broadcastState(false);
      stopHeartbeat();
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

