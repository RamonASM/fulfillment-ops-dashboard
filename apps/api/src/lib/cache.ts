// =============================================================================
// CACHE UTILITY LIBRARY (Phase 11)
// In-memory cache with TTL support for analytics data
// =============================================================================

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class InMemoryCache {
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * Get a value from cache
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Set a value in cache with TTL in milliseconds
   */
  set<T>(key: string, data: T, ttlMs: number): void {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
    });
  }

  /**
   * Delete a specific key
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Delete all keys matching a pattern (prefix)
   */
  deletePattern(pattern: string): number {
    let deleted = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith(pattern)) {
        this.cache.delete(key);
        deleted++;
      }
    }
    return deleted;
  }

  /**
   * Check if a key exists and is not expired
   */
  has(key: string): boolean {
    return this.get(key) !== null;
  }

  /**
   * Get or set a value with a factory function
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttlMs: number
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) return cached;

    const data = await factory();
    this.set(key, data, ttlMs);
    return data;
  }

  /**
   * Clear all expired entries
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  stats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }

  /**
   * Destroy the cache and cleanup interval
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.cache.clear();
  }
}

// Singleton instance
export const cache = new InMemoryCache();

// Cache TTL constants (in milliseconds)
export const CacheTTL = {
  RISK_SCORES: 24 * 60 * 60 * 1000,      // 24 hours
  USAGE_METRICS: 6 * 60 * 60 * 1000,      // 6 hours
  CLIENT_AGGREGATES: 60 * 60 * 1000,      // 1 hour
  SEASONAL_PATTERNS: 7 * 24 * 60 * 60 * 1000, // 7 days
  DASHBOARD_WIDGETS: 5 * 60 * 1000,       // 5 minutes
  ALERT_TRENDS: 15 * 60 * 1000,           // 15 minutes
} as const;

// Cache key generators
export const CacheKeys = {
  riskScore: (productId: string) => `risk:${productId}`,
  usageMetrics: (productId: string, period: string) => `usage:${productId}:${period}`,
  clientAggregates: (clientId: string) => `client:${clientId}:aggregates`,
  seasonalPattern: (productId: string) => `seasonal:${productId}`,
  dashboardWidget: (userId: string, widget: string) => `dashboard:${userId}:${widget}`,
  alertTrends: (clientId: string) => `alerts:${clientId}:trends`,
  portfolioRisk: (clientId: string) => `portfolio:${clientId}:risk`,
  inventoryHealth: () => 'inventory:health:global',
} as const;

export default cache;
