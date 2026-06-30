export class LockManager {
  private static locks: Map<string, { expiresAt: number; holder: string }> = new Map();

  /**
   * Attempts to acquire an exclusive lock for an instance.
   * Responds with true if successful, or false if already locked.
   */
  public static acquire(instanceId: string, holder: string, ttlMs = 5 * 60 * 1000): boolean {
    const now = Date.now();
    const existing = this.locks.get(instanceId);

    // If lock exists and hasn't expired, reject
    if (existing && existing.expiresAt > now) {
      console.warn(`[LockManager] Acquire failed for ${instanceId}. Locked by ${existing.holder}`);
      return false;
    }

    // Set lock
    this.locks.set(instanceId, {
      expiresAt: now + ttlMs,
      holder
    });
    console.log(`[LockManager] Lock acquired on ${instanceId} by ${holder} (Expires in ${ttlMs / 1000}s)`);
    return true;
  }

  /**
   * Releases the lock
   */
  public static release(instanceId: string, holder: string): void {
    const existing = this.locks.get(instanceId);
    if (existing && existing.holder === holder) {
      this.locks.delete(instanceId);
      console.log(`[LockManager] Lock released on ${instanceId} by ${holder}`);
    }
  }

  /**
   * Verifies if a lock is currently active on an instance
   */
  public static isLocked(instanceId: string): boolean {
    const now = Date.now();
    const existing = this.locks.get(instanceId);
    return !!(existing && existing.expiresAt > now);
  }
}
