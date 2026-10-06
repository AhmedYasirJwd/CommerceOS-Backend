import type { Request, Response } from 'express';
import { env } from '../config/env.js';
import { storeRepository } from '../repositories/store.repository.js';

const startedAt = new Date();

/** Liveness + database connectivity. Never includes secrets or connection details. */
export async function healthCheck(_req: Request, res: Response) {
  const started = Date.now();
  let database: { status: 'ok' | 'error'; latencyMs: number; error?: string };
  let storeFound: boolean | null = null;

  try {
    ({ storeFound } = await storeRepository.ping(env.AUTH_MODE === 'demo' ? env.DEFAULT_STORE_ID : undefined));
    database = { status: 'ok', latencyMs: Date.now() - started };
  } catch (err) {
    database = {
      status: 'error',
      latencyMs: Date.now() - started,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }

  const healthy = database.status === 'ok';
  res.status(healthy ? 200 : 503).json({
    success: healthy,
    status: healthy ? 'ok' : 'degraded',
    service: 'commerceos-backend',
    version: process.env.npm_package_version ?? '1.0.0',
    environment: env.NODE_ENV,
    authMode: env.AUTH_MODE,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round((Date.now() - startedAt.getTime()) / 1000),
    database,
    ...(env.AUTH_MODE === 'demo' && { defaultStore: { configured: Boolean(env.DEFAULT_STORE_ID), found: storeFound } }),
  });
}
