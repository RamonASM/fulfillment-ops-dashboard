import Redis from 'ioredis';
import { logger } from './logger.js';

// =============================================================================
// REDIS CLIENT CONFIGURATION
// =============================================================================
// Centralized Redis client for caching, CSRF tokens, rate limiting, and queues
// Uses promise-based singleton pattern to prevent race conditions

let redisClient: Redis | null = null;
let initializationPromise: Promise<Redis | null> | null = null;

/**
 * Initialize Redis client (internal)
 * This is called once and cached in the initialization promise
 */
async function initializeRedis(): Promise<Redis | null> {
  // If Redis URL not configured, return null (fallback to in-memory)
  if (!process.env.REDIS_URL) {
    if (process.env.NODE_ENV !== 'test') {
      logger.warn('REDIS_URL not configured, using in-memory fallback');
    }
    return null;
  }

  const client = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: true, // Don't connect immediately, wait for first command
    retryStrategy(times: number) {
      if (times > 10) {
        logger.error('Redis max retries exceeded, giving up');
        return null; // Stop retrying
      }
      const delay = Math.min(times * 100, 3000);
      return delay;
    },
    reconnectOnError(err: Error) {
      // Reconnect on specific errors
      const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
      return targetErrors.some(e => err.message.includes(e));
    },
  });

  // Handle connection events
  client.on('connect', () => {
    logger.info('Redis connected');
  });

  client.on('ready', () => {
    logger.info('Redis ready for commands');
  });

  client.on('error', (err) => {
    logger.error('Redis error', err);
  });

  client.on('close', () => {
    logger.warn('Redis connection closed');
  });

  client.on('reconnecting', () => {
    logger.info('Redis reconnecting...');
  });

  // Attempt to connect
  try {
    await client.connect();
    return client;
  } catch (err) {
    logger.error('Failed to connect to Redis', err as Error);
    // Return null to fall back to in-memory
    return null;
  }
}

/**
 * Get or create Redis client instance
 * Uses promise-based singleton to prevent race conditions when called concurrently
 * Returns null if REDIS_URL is not configured (graceful degradation)
 */
export async function getRedisClientAsync(): Promise<Redis | null> {
  // If already initialized, return the client
  if (redisClient !== null) {
    return redisClient;
  }

  // If initialization is in progress, wait for it
  if (initializationPromise !== null) {
    return initializationPromise;
  }

  // Start initialization
  initializationPromise = initializeRedis();

  try {
    redisClient = await initializationPromise;
    return redisClient;
  } catch (err) {
    logger.error('Redis initialization failed', err as Error);
    initializationPromise = null;
    return null;
  }
}

/**
 * Get Redis client synchronously (for backwards compatibility)
 * Note: This may return null if client hasn't been initialized yet
 * Prefer using getRedisClientAsync() when possible
 */
export function getRedisClient(): Redis | null {
  // If already initialized, return it
  if (redisClient !== null) {
    return redisClient;
  }

  // If Redis URL not configured, return null immediately
  if (!process.env.REDIS_URL) {
    if (process.env.NODE_ENV !== 'test') {
      logger.warn('REDIS_URL not configured, using in-memory fallback');
    }
    return null;
  }

  // Trigger async initialization but don't wait
  // Next synchronous call will get the client
  getRedisClientAsync().catch((err) => {
    logger.error('Background Redis initialization failed', err);
  });

  return null;
}

/**
 * Check if Redis is connected and ready
 */
export function isRedisReady(): boolean {
  return redisClient !== null && redisClient.status === 'ready';
}

/**
 * Close Redis connection (for graceful shutdown)
 */
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit();
    } catch (err) {
      logger.error('Error closing Redis connection', err as Error);
      // Force disconnect if quit fails
      redisClient.disconnect();
    }
    redisClient = null;
    initializationPromise = null;
  }
}

// Export synchronous getter for backwards compatibility
// Note: May return null on first call while async initialization happens
export const redis = getRedisClient();
