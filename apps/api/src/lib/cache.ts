// =============================================================================
// CACHE UTILITY LIBRARY
// Redis-backed cache with in-memory fallback for analytics data
// Supports distributed invalidation across PM2 instances
// =============================================================================

import { getRedisClient } from './redis';
import { logger } from './logger';

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

interface CacheInterface {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, data: T, ttlMs: number): Promise<void>;
  delete(key: string): Promise<boolean>;
  deletePattern(pattern: string): Promise<number>;
  has(key: string): Promise<boolean>;
  getOrSet<T>(key: string, factory: () => Promise<T>, ttlMs: number): Promise<T>;
  clear(): Promise<void>;
  stats(): Promise<{ size: number; keys: string[] }>;
}

/**
 * In-memory cache for development/fallback
 */
class InMemoryCache implements CacheInterface {
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  async set<T>(key: string, data: T, ttlMs: number): Promise<void> {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
    });
  }

  async delete(key: string): Promise<boolean> {
    return this.cache.delete(key);
  }

  async deletePattern(pattern: string): Promise<number> {
    let deleted = 0;
    const keys = Array.from(this.cache.keys());
    for (const key of keys) {
      if (key.startsWith(pattern)) {
        this.cache.delete(key);
        deleted++;
      }
    }
    return deleted;
  }

  async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== null;
  }

  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttlMs: number,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const data = await factory();
    await this.set(key, data, ttlMs);
    return data;
  }

  cleanup(): void {
    const now = Date.now();
    const entries = Array.from(this.cache.entries());
    for (const [key, entry] of entries) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }

  async stats(): Promise<{ size: number; keys: string[] }> {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.cache.clear();
  }
}

/**
 * Redis-backed cache for production (distributed across PM2 instances)
 */
class RedisCache implements CacheInterface {
  private prefix = 'cache:';
  private redis = getRedisClient()!;

  async get<T>(key: string): Promise<T | null> {
    try {
      const data = await this.redis.get(this.prefix + key);
      if (!data) return null;
      return JSON.parse(data) as T;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error(`Redis cache get error for key: ${key}`, error);
      return null;
    }
  }

  async set<T>(key: string, data: T, ttlMs: number): Promise<void> {
    try {
      const ttlSeconds = Math.ceil(ttlMs / 1000);
      await this.redis.setex(
        this.prefix + key,
        ttlSeconds,
        JSON.stringify(data)
      );
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error(`Redis cache set error for key: ${key}`, error);
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      const result = await this.redis.del(this.prefix + key);
      return result > 0;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error(`Redis cache delete error for key: ${key}`, error);
      return false;
    }
  }

  async deletePattern(pattern: string): Promise<number> {
    try {
      const keys = await this.redis.keys(this.prefix + pattern + '*');
      if (keys.length === 0) return 0;
      return await this.redis.del(...keys);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error(`Redis cache deletePattern error for pattern: ${pattern}`, error);
      return 0;
    }
  }

  async has(key: string): Promise<boolean> {
    try {
      const exists = await this.redis.exists(this.prefix + key);
      return exists === 1;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error(`Redis cache has error for key: ${key}`, error);
      return false;
    }
  }

  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttlMs: number,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const data = await factory();
    await this.set(key, data, ttlMs);
    return data;
  }

  async clear(): Promise<void> {
    try {
      const keys = await this.redis.keys(this.prefix + '*');
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Redis cache clear error', error);
    }
  }

  async stats(): Promise<{ size: number; keys: string[] }> {
    try {
      const keys = await this.redis.keys(this.prefix + '*');
      return {
        size: keys.length,
        keys: keys.map(k => k.replace(this.prefix, '')),
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Redis cache stats error', error);
      return { size: 0, keys: [] };
    }
  }
}

/**
 * Create the appropriate cache instance based on Redis availability
 */
function createCache(): CacheInterface {
  const redis = getRedisClient();
  if (redis) {
    logger.info('Using Redis-backed cache for distributed caching');
    return new RedisCache();
  }
  logger.warn('Redis not available, using in-memory cache (not distributed)');
  return new InMemoryCache();
}

// Singleton instance
export const cache = createCache();

// Cache TTL constants (in milliseconds)
export const CacheTTL = {
  RISK_SCORES: 24 * 60 * 60 * 1000, // 24 hours
  USAGE_METRICS: 6 * 60 * 60 * 1000, // 6 hours
  CLIENT_AGGREGATES: 60 * 60 * 1000, // 1 hour
  SEASONAL_PATTERNS: 7 * 24 * 60 * 60 * 1000, // 7 days
  DASHBOARD_WIDGETS: 5 * 60 * 1000, // 5 minutes
  ALERT_TRENDS: 15 * 60 * 1000, // 15 minutes
  ML_FORECAST: 6 * 60 * 60 * 1000, // 6 hours
  ML_STOCKOUT: 4 * 60 * 60 * 1000, // 4 hours
  ML_HEALTH: 2 * 60 * 1000, // 2 minutes
} as const;

// Cache key generators
export const CacheKeys = {
  riskScore: (productId: string) => `risk:${productId}`,
  usageMetrics: (productId: string, period: string) =>
    `usage:${productId}:${period}`,
  clientAggregates: (clientId: string) => `client:${clientId}:aggregates`,
  seasonalPattern: (productId: string) => `seasonal:${productId}`,
  dashboardWidget: (userId: string, widget: string) =>
    `dashboard:${userId}:${widget}`,
  alertTrends: (clientId: string) => `alerts:${clientId}:trends`,
  portfolioRisk: (clientId: string) => `portfolio:${clientId}:risk`,
  inventoryHealth: () => "inventory:health:global",
  mlForecast: (productId: string, horizon: number) =>
    `ml:forecast:${productId}:${horizon}`,
  mlStockout: (productId: string, horizon: number) =>
    `ml:stockout:${productId}:${horizon}`,
  mlHealth: () => "ml:health",
} as const;

export default cache;
