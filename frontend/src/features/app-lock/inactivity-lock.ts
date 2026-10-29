export const APP_LOCK_TIMEOUT_MS = 300_000;

export interface InactivityClock {
  monotonicNow: () => number;
  wallNow: () => number;
  schedule: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout> | number;
  cancel: (timer: ReturnType<typeof setTimeout> | number) => void;
}

const browserClock: InactivityClock = {
  monotonicNow: () => performance.now(),
  wallNow: () => Date.now(),
  schedule: (callback, delayMs) => setTimeout(callback, delayMs),
  cancel: (timer) => clearTimeout(timer),
};

/** Central idle deadline. Wall time complements the monotonic clock on mobile devices
 * where performance.now() can pause while the browser process is suspended. */
export class InactivityLockController {
  private lastActivityMono = 0;
  private lastActivityWall = 0;
  private timer: ReturnType<typeof setTimeout> | number | null = null;
  private active = false;
  private visible = true;

  constructor(
    private readonly lock: () => void,
    private readonly clock: InactivityClock = browserClock,
    private readonly timeoutMs = APP_LOCK_TIMEOUT_MS,
  ) {}

  start(): void {
    this.active = true;
    this.lastActivityMono = this.clock.monotonicNow();
    this.lastActivityWall = this.clock.wallNow();
    this.checkDeadline();
  }

  activity(): void {
    if (!this.active || !this.visible) return;
    this.lastActivityMono = this.clock.monotonicNow();
    this.lastActivityWall = this.clock.wallNow();
    this.schedule();
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    if (!visible) {
      this.cancelTimer();
      return;
    }
    this.checkDeadline();
  }

  checkDeadline(): void {
    if (!this.active || !this.visible) return;
    if (this.elapsedMs() >= this.timeoutMs) {
      this.active = false;
      this.cancelTimer();
      this.lock();
      return;
    }
    this.schedule();
  }

  stop(): void {
    this.active = false;
    this.cancelTimer();
  }

  private elapsedMs(): number {
    return Math.max(
      this.clock.monotonicNow() - this.lastActivityMono,
      this.clock.wallNow() - this.lastActivityWall,
    );
  }

  private schedule(): void {
    this.cancelTimer();
    if (!this.active || !this.visible) return;
    const remaining = Math.max(0, this.timeoutMs - this.elapsedMs());
    this.timer = this.clock.schedule(() => this.checkDeadline(), remaining);
  }

  private cancelTimer(): void {
    if (this.timer !== null) this.clock.cancel(this.timer);
    this.timer = null;
  }
}
