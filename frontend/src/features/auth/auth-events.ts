/**
 * Multi-tab authentication events and cross-tab synchronization.
 * Supports both BroadcastChannel ('arth_auth') and localStorage storage events
 * to ensure synchronized logout and session expiry across tabs and windows.
 */

export type AuthStatus =
  | 'INITIALIZING'
  | 'AUTHENTICATED'
  | 'UNAUTHENTICATED'
  | 'SESSION_EXPIRED'
  | 'LOGGING_OUT';

export type AuthSyncMessage =
  | { type: 'LOGOUT'; timestamp: number }
  | { type: 'SESSION_EXPIRED'; timestamp: number }
  | { type: 'LOGIN'; timestamp: number; userId: string };

type AuthEventListener = (message: AuthSyncMessage) => void;

class AuthEventEmitter {
  private listeners = new Set<AuthEventListener>();
  private channel: BroadcastChannel | null = null;
  private storageHandler: ((event: StorageEvent) => void) | null = null;
  private isInitialized = false;

  constructor() {
    this.initCrossTab();
  }

  private initCrossTab(): void {
    if (this.isInitialized) return;
    if (typeof window === 'undefined') return;

    this.isInitialized = true;

    // 1. BroadcastChannel API
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.channel = new BroadcastChannel('arth_auth');
        this.channel.onmessage = (event: MessageEvent<AuthSyncMessage>) => {
          if (event.data && typeof event.data.type === 'string') {
            this.dispatchLocal(event.data);
          }
        };
      } catch {
        this.channel = null;
      }
    }

    // 2. Storage event fallback (for browsers or tabs where BroadcastChannel isn't shared)
    this.storageHandler = (event: StorageEvent) => {
      if (event.key === 'arth_auth_event' && event.newValue) {
        try {
          const parsed = JSON.parse(event.newValue) as AuthSyncMessage;
          if (parsed && typeof parsed.type === 'string') {
            this.dispatchLocal(parsed);
          }
        } catch {
          // Ignore invalid JSON
        }
      }
    };

    window.addEventListener('storage', this.storageHandler);
  }

  private dispatchLocal(message: AuthSyncMessage): void {
    for (const listener of this.listeners) {
      try {
        listener(message);
      } catch (err) {
        console.warn('[AuthEventEmitter] Listener error:', err);
      }
    }
  }

  public subscribe(listener: AuthEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public broadcast(message: AuthSyncMessage): void {
    // Notify local listeners
    this.dispatchLocal(message);

    // Notify other tabs via BroadcastChannel
    if (this.channel) {
      try {
        this.channel.postMessage(message);
      } catch {
        // Channel may be closed
      }
    }

    // Notify other tabs via localStorage
    if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
      try {
        window.localStorage.setItem(
          'arth_auth_event',
          JSON.stringify({ ...message, _seq: Date.now() + Math.random() })
        );
      } catch {
        // LocalStorage may be quota exceeded or disabled in private browsing
      }
    }
  }

  public emitLogout(): void {
    this.broadcast({ type: 'LOGOUT', timestamp: Date.now() });
  }

  public emitSessionExpired(): void {
    this.broadcast({ type: 'SESSION_EXPIRED', timestamp: Date.now() });
  }

  public emitLogin(userId: string): void {
    this.broadcast({ type: 'LOGIN', timestamp: Date.now(), userId });
  }
}

export const authEvents = new AuthEventEmitter();
