import type { Request, Response, NextFunction } from 'express';
import { config } from '../config/config.js';
import type { ApiResponse } from '../types/index.js';

export function apiKeyAuth(req: Request, res: Response<ApiResponse>, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey || apiKey !== config.apiKey) {
    res.status(401).json({ success: false, message: 'Unauthorized: Invalid or missing API key' });
    return;
  }

  next();
}
