/**
 * Health Check Routes
 *
 * Provides health endpoints for monitoring and load balancer probes.
 *
 * Endpoints:
 * - GET /health - Full system health status
 * - GET /health/live - Liveness probe (is the process running?)
 * - GET /health/ready - Readiness probe (can accept traffic?)
 * - GET /health/db - Database health only
 * - GET /health/redis - Redis health only
 */

import { Router, Request, Response } from 'express';
import {
  getHealthStatus,
  getLivenessStatus,
  getReadinessStatus,
  checkDatabase,
  checkRedis,
  checkDisk,
  checkEmail,
  checkPythonServices,
} from '../services/health.service.js';

const router = Router();

/**
 * GET /health
 * Full system health status
 */
router.get('/', async (_req: Request, res: Response) => {
  const health = await getHealthStatus();

  const statusCode = health.status === 'healthy' ? 200 :
                     health.status === 'degraded' ? 200 : 503;

  res.status(statusCode).json(health);
});

/**
 * GET /health/live
 * Kubernetes liveness probe
 * Returns 200 if the process is running
 */
router.get('/live', (_req: Request, res: Response) => {
  const status = getLivenessStatus();
  res.json(status);
});

/**
 * GET /health/ready
 * Kubernetes readiness probe
 * Returns 200 if the service can accept traffic
 */
router.get('/ready', async (_req: Request, res: Response) => {
  const status = await getReadinessStatus();

  if (status.ready) {
    res.json({ status: 'ready' });
  } else {
    res.status(503).json({
      status: 'not ready',
      reason: status.reason,
    });
  }
});

/**
 * GET /health/db
 * Database health check
 */
router.get('/db', async (_req: Request, res: Response) => {
  const health = await checkDatabase();

  const statusCode = health.status === 'up' ? 200 : 503;
  res.status(statusCode).json(health);
});

/**
 * GET /health/redis
 * Redis health check
 */
router.get('/redis', async (_req: Request, res: Response) => {
  const health = await checkRedis();

  const statusCode = health.status === 'up' ? 200 :
                     health.status === 'degraded' ? 200 : 503;
  res.status(statusCode).json(health);
});

/**
 * GET /health/disk
 * Disk/storage health check
 */
router.get('/disk', async (_req: Request, res: Response) => {
  const health = await checkDisk();

  const statusCode = health.status === 'up' ? 200 : 503;
  res.status(statusCode).json(health);
});

/**
 * GET /health/email
 * Email service health check
 */
router.get('/email', (_req: Request, res: Response) => {
  const health = checkEmail();

  const statusCode = health.status === 'up' ? 200 :
                     health.status === 'degraded' ? 200 : 503;
  res.status(statusCode).json(health);
});

/**
 * GET /health/services
 * Python services health check
 */
router.get('/services', async (_req: Request, res: Response) => {
  const health = await checkPythonServices();

  const statusCode = health.status === 'up' ? 200 :
                     health.status === 'degraded' ? 200 : 503;
  res.status(statusCode).json(health);
});

export default router;
