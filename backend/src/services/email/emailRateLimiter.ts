const userRateMap = new Map<string, { count: number; resetAt: number }>();
const globalRateMap = new Map<string, { count: number; resetAt: number }>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  reason?: string;
}

export class EmailRateLimiter {
  private static readonly DEFAULT_USER_LIMIT = 50; // per hour
  private static readonly DEFAULT_GLOBAL_LIMIT = 500; // per hour
  private static readonly WINDOW_MS = 3600000; // 1 hour

  public static checkUserRate(userId: string): RateLimitResult {
    return this.checkRate(`user:${userId}`, userRateMap, this.DEFAULT_USER_LIMIT);
  }

  public static checkGlobalRate(): RateLimitResult {
    return this.checkRate('global', globalRateMap, this.DEFAULT_GLOBAL_LIMIT);
  }

  public static checkTemplateRate(templateName: string): RateLimitResult {
    return this.checkRate(`template:${templateName}`, globalRateMap, 100);
  }

  private static checkRate(
    key: string,
    map: Map<string, { count: number; resetAt: number }>,
    limit: number
  ): RateLimitResult {
    const now = Date.now();
    const entry = map.get(key);

    if (!entry || now >= entry.resetAt) {
      map.set(key, { count: 1, resetAt: now + this.WINDOW_MS });
      return { allowed: true, remaining: limit - 1, resetAt: now + this.WINDOW_MS };
    }

    if (entry.count >= limit) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: entry.resetAt,
        reason: `Rate limit exceeded. Try again after ${new Date(entry.resetAt).toISOString()}`
      };
    }

    entry.count++;
    return { allowed: true, remaining: limit - entry.count, resetAt: entry.resetAt };
  }

  public static reset() {
    userRateMap.clear();
    globalRateMap.clear();
  }
}
