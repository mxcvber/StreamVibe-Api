import { setTimeout as sleep } from 'node:timers/promises';

/**
 * Paces requests at a fixed interval (1000 / rps ms apart) with no burst
 * allowance — a token bucket would let an idle worker pool fire a burst that
 * looks exactly like the thing TMDB asks clients not to do.
 *
 * `pause()` is the 429 hook: it puts a barrier in front of every caller,
 * including the ones already sleeping toward a slot they were handed before
 * the 429 arrived.
 */
export class RateLimiter {
  private readonly intervalMs: number;
  private nextSlotAt = 0;
  private pausedUntil = 0;

  constructor(requestsPerSecond: number) {
    this.intervalMs = 1000 / requestsPerSecond;
  }

  /** Resolves when the caller may start its request. */
  async acquire(): Promise<void> {
    for (;;) {
      const now = Date.now();
      const slot = Math.max(now, this.nextSlotAt, this.pausedUntil);
      this.nextSlotAt = slot + this.intervalMs;
      if (slot > now) {
        await sleep(slot - now);
      }
      // A pause() may have landed while this caller slept; take a new slot
      // behind the barrier instead of firing into the window TMDB closed.
      if (Date.now() >= this.pausedUntil) {
        return;
      }
    }
  }

  /** Holds every caller back for at least `ms` from now. */
  pause(ms: number): void {
    this.pausedUntil = Math.max(this.pausedUntil, Date.now() + ms);
  }
}
