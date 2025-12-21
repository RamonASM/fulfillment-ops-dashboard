import Redis from 'ioredis';

// =============================================================================
// REDIS CLIENT CONFIGURATION
// =============================================================================
// Centralized Redis client for caching, CSRF tokens, rate limiting, and queues

let redisClient: Redis | null = null;

/**
 * Get or create Redis client instance
 * Returns null if REDIS_URL is not configured (graceful degradation)
 */
export function getRedisClient(): Redis | null {
  // If Redis URL not configured, return null (fallback to in-memory)
  if (!process.env.REDIS_URL) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn(
        '⚠️  REDIS_URL not configured. Using in-memory fallback (not suitable for production)'
      );
    }
    return null;
  }

  // Return existing client if already created
  if (redisClient) {
    return redisClient;
  }

  // Create new Redis client
  redisClient = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    retryStrategy(times: number) {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
  });

  // Handle connection events
  redisClient.on('connect', () => {
    console.log('✅ Redis connected');
  });

  redisClient.on('error', (err) => {
    console.error('❌ Redis error:', err);
  });

  redisClient.on('close', () => {
    console.warn('⚠️  Redis connection closed');
  });

  return redisClient;
}

/**
 * Close Redis connection (for graceful shutdown)
 */
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}

// Export a singleton instance
export const redis = getRedisClient();
