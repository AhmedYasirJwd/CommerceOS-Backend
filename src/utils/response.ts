import type { Response } from 'express';
import type { Pagination } from './pagination.js';

export function sendSuccess<T>(res: Response, data: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, data });
}

export function sendList<T>(res: Response, data: T[], pagination: Pagination): void {
  res.status(200).json({ success: true, data, pagination });
}
