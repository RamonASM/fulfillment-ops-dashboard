/**
 * Health Check Service
 *
 * Provides health status for all system dependencies.
 */

import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { isEmailServiceHealthy } from './email.service.js';
import { getRedisClient } from '../lib/redis.js';
import fs from 'fs';
import path from 'path';

// =============================================================================
// TYPES
// =============================================================================

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  checks: {
    database: ComponentHealth;
    redis?: ComponentHealth;
    disk: ComponentHealth;
    email: ComponentHealth;
    pythonServices?: ComponentHealth;
  };
}

export interface ComponentHealth {
  status: 'up' | 'down' | 'degraded';
  latency?: number;
  message?: string;
  details?: Record<string, unknown>;
}

// =============================================================================
// HEALTH CHECK FUNCTIONS
// =============================================================================

/**
 * Check database connectivity
 */
export async function checkDatabase(): Promise<ComponentHealth> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const latency = Date.now() - start;

    // Also get some basic stats
    const [productCount, clientCount] = await Promise.all([
      prisma.product.count(),
      prisma.client.count(),
    ]);

    return {
      status: 'up',
      latency,
      details: {
        products: productCount,
        clients: clientCount,
      },
    };
  } catch (error) {
    const latency = Date.now() - start;
    logger.error('Database health check failed', error as Error);
    return {
      status: 'down',
      latency,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check Redis connectivity (if configured)
 */
export async function checkRedis(): Promise<ComponentHealth> {
  const redisClient = getRedisClient();

  if (!redisClient) {
    return {
      status: 'up',
      message: 'Redis not configured, using in-memory rate limiting',
    };
  }

  const start = Date.now();
  try {
    await redisClient.ping();
    const latency = Date.now() - start;

    const info = await redisClient.info('memory');
    const usedMemory = info.match(/used_memory:(\d+)/)?.[1];

    return {
      status: 'up',
      latency,
      details: {
        usedMemoryBytes: usedMemory ? parseInt(usedMemory, 10) : undefined,
      },
    };
  } catch (error) {
    const latency = Date.now() - start;
    logger.warn('Redis health check failed', { error: (error as Error).message });
    return {
      status: 'degraded',
      latency,
      message: 'Redis unavailable, using in-memory fallback',
    };
  }
}

/**
 * Check disk space for uploads directory
 */
export async function checkDisk(): Promise<ComponentHealth> {
  try {
    // Check uploads directory exists and is writable
    const uploadsDir = path.resolve(process.cwd(), 'uploads');

    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // Test write capability
    const testFile = path.join(uploadsDir, '.health-check');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);

    // Get directory size (count files)
    const files = fs.readdirSync(uploadsDir);
    const uploadFileCount = files.filter(f => !f.startsWith('.')).length;

    return {
      status: 'up',
      details: {
        uploadsPath: uploadsDir,
        fileCount: uploadFileCount,
        writable: true,
      },
    };
  } catch (error) {
    logger.error('Disk health check failed', error as Error);
    return {
      status: 'down',
      message: error instanceof Error ? error.message : 'Disk check failed',
    };
  }
}

/**
 * Check email service status
 */
export function checkEmail(): ComponentHealth {
  const healthy = isEmailServiceHealthy();

  return {
    status: healthy ? 'up' : 'degraded',
    message: healthy ? 'Email service initialized' : 'Email service not configured, emails will be logged',
  };
}

/**
 * Check Python services (DS Analytics, ML Analytics)
 */
export async function checkPythonServices(): Promise<ComponentHealth> {
  const dsAnalyticsUrl = process.env.DS_ANALYTICS_URL || 'http://localhost:8001';
  const mlAnalyticsUrl = process.env.ML_ANALYTICS_URL || 'http://localhost:8002';

  const services: Record<string, { status: 'up' | 'down'; latency?: number }> = {};
  let allUp = true;
  let anyUp = false;

  // Check DS Analytics
  try {
    const start = Date.now();
    const response = await fetch(`${dsAnalyticsUrl}/health`, {
      signal: AbortSignal.timeout(5000)
    });
    services.dsAnalytics = {
      status: response.ok ? 'up' : 'down',
      latency: Date.now() - start,
    };
    if (response.ok) anyUp = true;
    else allUp = false;
  } catch {
    services.dsAnalytics = { status: 'down' };
    allUp = false;
  }

  // Check ML Analytics
  try {
    const start = Date.now();
    const response = await fetch(`${mlAnalyticsUrl}/health`, {
      signal: AbortSignal.timeout(5000)
    });
    services.mlAnalytics = {
      status: response.ok ? 'up' : 'down',
      latency: Date.now() - start,
    };
    if (response.ok) anyUp = true;
    else allUp = false;
  } catch {
    services.mlAnalytics = { status: 'down' };
    allUp = false;
  }

  return {
    status: allUp ? 'up' : anyUp ? 'degraded' : 'down',
    details: services,
    message: allUp ? 'All Python services healthy' :
             anyUp ? 'Some Python services unavailable' :
             'Python services unavailable',
  };
}

// =============================================================================
// AGGREGATE HEALTH CHECK
// =============================================================================

/**
 * Get overall system health status
 */
export async function getHealthStatus(): Promise<HealthStatus> {
  const startTime = process.hrtime.bigint();

  // Run checks in parallel
  const [database, redis, disk, pythonServices] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkDisk(),
    checkPythonServices(),
  ]);

  const email = checkEmail();

  // Determine overall status
  const criticalDown = database.status === 'down' || disk.status === 'down';
  const anyDegraded = [database, redis, disk, email, pythonServices].some(
    c => c.status === 'degraded'
  );

  const overallStatus: 'healthy' | 'degraded' | 'unhealthy' =
    criticalDown ? 'unhealthy' : anyDegraded ? 'degraded' : 'healthy';

  return {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
    checks: {
      database,
      redis,
      disk,
      email,
      pythonServices,
    },
  };
}

/**
 * Simple liveness check (for kubernetes/load balancer probes)
 */
export function getLivenessStatus(): { status: 'ok'; uptime: number } {
  return {
    status: 'ok',
    uptime: process.uptime(),
  };
}

/**
 * Readiness check (can accept traffic?)
 */
export async function getReadinessStatus(): Promise<{ ready: boolean; reason?: string }> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ready: true };
  } catch (error) {
    return {
      ready: false,
      reason: 'Database unavailable'
    };
  }
}
