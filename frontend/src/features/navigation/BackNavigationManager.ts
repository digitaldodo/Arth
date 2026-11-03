/**
 * Arth Centralized Back Navigation Manager
 * 
 * Coordinates hierarchical Android PWA back gestures, browser history,
 * nested overlays, modals, settings drill-downs, and native exit boundary.
 * 
 * Priority Hierarchy:
 * 1. Open dialog or confirmation ('dialog')
 * 2. Open modal, drawer, editor, or nested screen ('modal' | 'subscreen')
 * 3. Main navigation tab ('tab') -> returns to Dashboard
 * 4. Root Dashboard -> allows native PWA exit/minimization
 */

export type BackHandlerPriority = 'dialog' | 'modal' | 'subscreen' | 'tab';

export type BackHandlerResult = boolean | 'prevented';

export interface BackHandlerRegistration {
  id: string;
  priority: BackHandlerPriority;
  order: number;
  onBack: () => BackHandlerResult;
}

const PRIORITY_WEIGHTS: Record<BackHandlerPriority, number> = {
  dialog: 10,
  modal: 20,
  subscreen: 30,
  tab: 40,
};

class BackNavigationManager {
  private handlers: BackHandlerRegistration[] = [];
  private orderCounter = 0;
  private bufferActive = false;
  private isProgrammaticPop = false;
  private initialized = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.init();
    }
  }

  public init(): void {
    if (this.initialized || typeof window === 'undefined') return;
    this.initialized = true;

    // Tag the root base entry if not already tagged
    try {
      const state = window.history.state as Record<string, unknown> | null;
      if (!state || !state.__arth_base) {
        window.history.replaceState(
          { ...state, __arth: true, __arth_base: true },
          '',
          window.location.href
        );
      }
    } catch {
      // Ignore security errors in restricted environments
    }

    // Listen to popstate (Android system back button / back swipe gesture / browser back)
    window.addEventListener('popstate', this.handlePopState);

    // Listen to pageshow (BFCache restoration)
    window.addEventListener('pageshow', this.handlePageShow);
  }

  public destroy(): void {
    if (typeof window === 'undefined') return;
    window.removeEventListener('popstate', this.handlePopState);
    window.removeEventListener('pageshow', this.handlePageShow);
    this.handlers = [];
    this.bufferActive = false;
    this.isProgrammaticPop = false;
    this.initialized = false;
  }

  /**
   * Registers a back handler. Returns an unregister function.
   */
  public registerHandler(
    id: string,
    priority: BackHandlerPriority,
    onBack: () => BackHandlerResult
  ): () => void {
    this.orderCounter += 1;
    const registration: BackHandlerRegistration = {
      id,
      priority,
      order: this.orderCounter,
      onBack,
    };

    // Replace if same ID already exists, or append
    const existingIndex = this.handlers.findIndex((h) => h.id === id);
    if (existingIndex >= 0) {
      this.handlers[existingIndex] = registration;
    } else {
      this.handlers.push(registration);
    }

    // If we have active handlers, ensure history buffer exists so Android Back doesn't immediately exit
    this.ensureBuffer();

    return () => {
      this.unregisterHandler(id);
    };
  }

  /**
   * Unregisters a back handler by ID.
   */
  public unregisterHandler(id: string): void {
    const prevCount = this.handlers.length;
    this.handlers = this.handlers.filter((h) => h.id !== id);

    // If all handlers are now gone, remove the history buffer so Dashboard can exit cleanly
    if (prevCount > 0 && this.handlers.length === 0) {
      this.removeBuffer();
    }
  }

  /**
   * Returns the currently registered handlers sorted by priority (highest priority first).
   */
  public getSortedHandlers(): BackHandlerRegistration[] {
    return [...this.handlers].sort((a, b) => {
      const weightA = PRIORITY_WEIGHTS[a.priority];
      const weightB = PRIORITY_WEIGHTS[b.priority];
      if (weightA !== weightB) {
        return weightA - weightB; // Lower number = higher priority
      }
      return b.order - a.order; // LIFO: most recently registered first
    });
  }

  /**
   * Triggers back programmatically (e.g., from an on-screen back button).
   */
  public triggerBack(): BackHandlerResult {
    const sorted = this.getSortedHandlers();
    if (sorted.length === 0) {
      return false;
    }

    const top = sorted[0];
    const result = top.onBack();

    if (result === true) {
      // Handler handled and closed. If no more handlers, remove buffer
      if (this.handlers.length === 0) {
        this.removeBuffer();
      }
      return true;
    }

    return result;
  }

  /**
   * Ensures that a single buffer entry exists in browser history ahead of the base entry.
   */
  private ensureBuffer(): void {
    if (typeof window === 'undefined') return;
    if (this.bufferActive) return;

    try {
      window.history.pushState(
        { __arth: true, __arth_buffer: true },
        '',
        window.location.href
      );
      this.bufferActive = true;
    } catch {
      // Ignore history errors
    }
  }

  /**
   * Removes the buffer entry if active by navigating back once.
   */
  private removeBuffer(): void {
    if (typeof window === 'undefined') return;
    if (!this.bufferActive) return;

    try {
      this.isProgrammaticPop = true;
      this.bufferActive = false;
      window.history.back();
    } catch {
      this.bufferActive = false;
    }
  }

  /**
   * Handles browser popstate events triggered by Android Back gesture or browser back.
   */
  private handlePopState = (): void => {
    // If this pop was triggered by our own removeBuffer() call, ignore it
    if (this.isProgrammaticPop) {
      this.isProgrammaticPop = false;
      return;
    }

    // The browser has already popped the buffer entry
    this.bufferActive = false;

    const sorted = this.getSortedHandlers();
    if (sorted.length === 0) {
      // No active overlays or tabs above Dashboard.
      // Allow browser and Android to perform natural exit.
      return;
    }

    // Call the highest priority active back handler
    const top = sorted[0];
    const result = top.onBack();

    if (result === 'prevented') {
      // The handler intercepted the back action (e.g. unsaved changes dialog shown)
      // The screen is STILL open, so we must restore the history buffer immediately!
      this.ensureBuffer();
      return;
    }

    if (result === true) {
      // The top handler was closed.
      // Check if there are still handlers remaining (e.g. we closed a modal, but parent tab or screen is still open)
      // We filter out the handled item from our check in case React unregistration hasn't run yet
      const remaining = this.handlers.filter((h) => h.id !== top.id);
      if (remaining.length > 0) {
        // Re-push buffer so the next back gesture will close the parent layer instead of exiting the PWA
        this.ensureBuffer();
      }
      return;
    }

    // If handler returned false (didn't handle), check if any remaining handler wants it
    for (let i = 1; i < sorted.length; i++) {
      const next = sorted[i];
      const nextResult = next.onBack();
      if (nextResult === 'prevented') {
        this.ensureBuffer();
        return;
      }
      if (nextResult === true) {
        const remaining = this.handlers.filter((h) => h.id !== next.id);
        if (remaining.length > 0) {
          this.ensureBuffer();
        }
        return;
      }
    }
  };

  /**
   * Handles BFCache page restoration.
   */
  private handlePageShow = (event: PageTransitionEvent): void => {
    if (event.persisted) {
      this.isProgrammaticPop = false;
      // If we have active handlers upon restoration, ensure buffer is present
      if (this.handlers.length > 0 && !this.bufferActive) {
        this.ensureBuffer();
      }
    }
  };
}

// Global singleton instance
export const backNavigationManager = new BackNavigationManager();
