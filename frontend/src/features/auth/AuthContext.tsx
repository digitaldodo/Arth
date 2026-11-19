'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { clearCachedPwaUserContext } from '@/lib/offline-db';
import { syncEngine } from '@/features/sync/sync-engine';
import { authEvents, type AuthStatus, type AuthSyncMessage } from './auth-events';

export interface AuthUser {
  id: string;
  email?: string;
  displayName?: string;
  username?: string;
  providers?: string[];
  passwordStatus?: 'configured' | 'not_configured' | 'unknown';
}

export interface AuthContextType {
  status: AuthStatus;
  user: AuthUser | null;
  signOut: () => Promise<void>;
  notifySessionExpired: () => void;
  recoverSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  user: AuthUser | null;
  children: ReactNode;
}

export function AuthProvider({ user: initialUser, children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(initialUser);
  const [status, setStatus] = useState<AuthStatus>(
    initialUser ? 'AUTHENTICATED' : 'UNAUTHENTICATED'
  );
  const isLoggingOutRef = useRef(false);

  // Synchronize internal state if initialUser changes
  useEffect(() => {
    if (isLoggingOutRef.current) return;
    setUser(initialUser);
    if (initialUser) {
      // This effect synchronizes provider state with the server-session prop when it changes.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus('AUTHENTICATED');
    } else {
      setStatus('UNAUTHENTICATED');
    }
  }, [initialUser]);

  const signOut = useCallback(async () => {
    if (isLoggingOutRef.current) return;
    isLoggingOutRef.current = true;
    setStatus('LOGGING_OUT');

    try {
      // 1. Immediately halt background sync operations for this user
      syncEngine.setUserId(null);

      // 2. Notify service worker that user has signed out
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        try {
          navigator.serviceWorker.controller?.postMessage({ type: 'PWA_SIGNED_OUT' });
        } catch {
          // Ignore service worker messaging errors
        }
      }

      // 3. Clear active account pointer from IndexedDB (preserves financial outbox)
      try {
        await clearCachedPwaUserContext();
      } catch {
        // Best effort
      }

      // 4. Notify all other open tabs about the sign-out
      try {
        authEvents.broadcast({ type: 'LOGOUT', timestamp: Date.now() });
      } catch {
        // Best effort
      }

      // 5. Invalidate server session and clear HttpOnly cookies
      try {
        await fetch('/auth/logout', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
          },
          cache: 'no-store',
        });
      } catch {
        // If offline or network fails, proceed to clean unauthenticated state locally
      }
    } finally {
      setStatus('UNAUTHENTICATED');
      setUser(null);
      if (typeof window !== 'undefined') {
        window.location.replace('/login');
      }
    }
  }, []);

  const notifySessionExpired = useCallback(() => {
    if (isLoggingOutRef.current) return;
    setStatus((prev) => {
      if (prev === 'LOGGING_OUT' || prev === 'UNAUTHENTICATED') return prev;
      return 'SESSION_EXPIRED';
    });

    // Notify sync engine to halt active retries
    syncEngine.notifyAuthSessionExpired();

    // Broadcast session expiry to other tabs
    try {
      authEvents.broadcast({ type: 'SESSION_EXPIRED', timestamp: Date.now() });
    } catch {
      // Best effort
    }
  }, []);

  const recoverSession = useCallback(async () => {
    // Clear stale cached user context so login form does not auto-redirect back to /
    try {
      await clearCachedPwaUserContext();
    } catch {
      // Best effort
    }

    if (typeof window !== 'undefined') {
      window.location.replace('/login?error=expired_session');
    }
  }, []);

  // Multi-tab cross-synchronization listener
  useEffect(() => {
    const unsubscribe = authEvents.subscribe((message: AuthSyncMessage) => {
      if (message.type === 'LOGOUT') {
        if (!isLoggingOutRef.current) {
          isLoggingOutRef.current = true;
          setStatus('UNAUTHENTICATED');
          setUser(null);
          syncEngine.setUserId(null);
          void clearCachedPwaUserContext().then(() => {
            if (typeof window !== 'undefined') {
              window.location.replace('/login');
            }
          });
        }
      } else if (message.type === 'SESSION_EXPIRED') {
        if (!isLoggingOutRef.current) {
          setStatus('SESSION_EXPIRED');
          syncEngine.notifyAuthSessionExpired();
        }
      }
    });

    return unsubscribe;
  }, []);

  return (
    <AuthContext.Provider
      value={{
        status,
        user,
        signOut,
        notifySessionExpired,
        recoverSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function useOptionalAuth(): AuthContextType | null {
  return useContext(AuthContext) ?? null;
}
