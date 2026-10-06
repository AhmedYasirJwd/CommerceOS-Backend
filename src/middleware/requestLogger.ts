import type { NextFunction, Request, Response } from 'express';

/** Minimal access log. Logs method, path (no query string) and timing only — never headers or bodies. */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    console.log(`${req.method} ${req.path} ${res.statusCode} ${ms.toFixed(1)}ms`);
  });
  next();
}
