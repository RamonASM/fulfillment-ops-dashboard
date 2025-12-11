import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger.js';

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const { method, originalUrl } = req;
    const { statusCode } = res;

    const statusColor = statusCode >= 500 ? '\x1b[31m' : // Red
                        statusCode >= 400 ? '\x1b[33m' : // Yellow
                        statusCode >= 300 ? '\x1b[36m' : // Cyan
                        '\x1b[32m'; // Green

    logger.debug(`${method} ${originalUrl} ${statusCode} ${duration}ms`);
  });

  next();
}
