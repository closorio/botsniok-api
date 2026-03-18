import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import type { ApiResponse } from '../types/index.js';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response<ApiResponse>,
  _next: NextFunction,
): void {
  logger.error({ err }, 'Unhandled error');

  res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message,
  });
}
