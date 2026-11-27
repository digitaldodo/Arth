interface WindowEntry {
  timestamps: number[];
}

/**
 * Simple sliding-window rate limiter protecting sensitive admin authentication
 * and recovery endpoints from brute-force attempts.
 */
export class AdminRateLimiter {
  private readonly buckets = new Map<string, WindowEntry>();

  checkAndConsume(key: string, maxRequests: number, windowMs: number): { allowed: boolean; retryAfterSec: number } {
    const now = Date.now();
    const cutoff = now - windowMs;
    const entry = this.buckets.get(key) || { timestamps: [] };
    entry.timestamps = entry.timestamps.filter((ts) => ts > cutoff);

    if (entry.timestamps.length >= maxRequests) {
      const oldest = entry.timestamps[0] || now;
      const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
      this.buckets.set(key, entry);
      return { allowed: false, retryAfterSec };
    }

    entry.timestamps.push(now);
    this.buckets.set(key, entry);

    if (this.buckets.size > 2000) {
      for (const [k, v] of this.buckets.entries()) {
        if (v.timestamps.every((t) => t <= cutoff)) {
          this.buckets.delete(k);
        }
      }
    }

    return { allowed: true, retryAfterSec: 0 };
  }
}
