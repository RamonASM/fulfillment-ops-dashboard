import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../lib/logger.js';
import { errorResponse, ERROR_CODES } from '../lib/api-response.js';

export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public isOperational: boolean;

  constructor(message: string, statusCode: number = 500, code: string = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  // Get request ID for tracing
  const requestId = req.requestId;

  // Log error with structured context
  if (err instanceof AppError && err.isOperational) {
    logger.warn('Operational error', {
      code: err.code,
      statusCode: err.statusCode,
      message: err.message,
    });
  } else {
    logger.error('Unhandled error', err, {
      path: req.path,
      method: req.method,
    });
  }

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    return res.status(400).json(
      errorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'Invalid request data',
        err.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }))
      )
    );
  }

  // Handle AppError
  if (err instanceof AppError) {
    return res.status(err.statusCode).json(
      errorResponse(err.code, err.message)
    );
  }

  // Handle Prisma errors
  if (err.name === 'PrismaClientKnownRequestError') {
    const prismaError = err as unknown as { code: string; meta?: { target?: string[] } };

    if (prismaError.code === 'P2002') {
      return res.status(409).json(
        errorResponse(
          ERROR_CODES.DUPLICATE_ENTRY,
          `Duplicate entry for ${prismaError.meta?.target?.join(', ') || 'field'}`
        )
      );
    }

    if (prismaError.code === 'P2025') {
      return res.status(404).json(
        errorResponse(ERROR_CODES.NOT_FOUND, 'Record not found')
      );
    }
  }

  // Default error response
  return res.status(500).json(
    errorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred'
        : err.message
    )
  );
}
