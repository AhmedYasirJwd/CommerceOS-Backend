import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { isProduction } from '../config/env.js';
import { AppError } from '../utils/errors.js';

interface ErrorBody {
  success: false;
  error: { code: string; message: string; details?: unknown };
}

/** Central error handler: every error leaves the API in the same JSON shape. */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const { status, body } = toErrorResponse(err);

  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl} -> ${status}`, err);
  }

  res.status(status).json(body);
}

function toErrorResponse(err: unknown): { status: number; body: ErrorBody } {
  if (err instanceof ZodError) {
    return {
      status: 400,
      body: {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: err.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
        },
      },
    };
  }

  if (err instanceof AppError) {
    const hideDetails = isProduction && err.statusCode >= 500;
    return {
      status: err.statusCode,
      body: {
        success: false,
        error: {
          code: err.code,
          message: err.message,
          ...(err.details !== undefined && !hideDetails ? { details: err.details } : {}),
        },
      },
    };
  }

  // Malformed JSON bodies and oversized payloads from express.json().
  if (isHttpError(err)) {
    if (err.type === 'entity.parse.failed') {
      return { status: 400, body: { success: false, error: { code: 'INVALID_JSON', message: 'Malformed JSON body' } } };
    }
    if (err.type === 'entity.too.large') {
      return { status: 413, body: { success: false, error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body too large' } } };
    }
    if (err.status >= 400 && err.status < 500) {
      return { status: err.status, body: { success: false, error: { code: 'BAD_REQUEST', message: err.message } } };
    }
  }

  return {
    status: 500,
    body: { success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } },
  };
}

function isHttpError(err: unknown): err is { status: number; type?: string; message: string } {
  return typeof err === 'object' && err !== null && typeof (err as { status?: unknown }).status === 'number';
}
