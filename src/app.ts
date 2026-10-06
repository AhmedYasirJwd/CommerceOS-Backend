import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { allowedOrigins } from './config/env.js';
import { healthCheck } from './controllers/health.controller.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFound.js';
import { requestLogger } from './middleware/requestLogger.js';
import { apiRouter } from './routes/index.js';
import { AppError } from './utils/errors.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        // Requests without an Origin header (curl, server-to-server, health probes) are allowed.
        if (!origin || allowedOrigins.includes(origin.replace(/\/+$/, ''))) return callback(null, true);
        callback(new AppError(403, 'CORS_ORIGIN_DENIED', `Origin not allowed: ${origin}`));
      },
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Store-Id'],
      maxAge: 86400,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(requestLogger);

  app.get('/', (_req, res) => {
    res.json({ success: true, data: { service: 'commerceos-backend', health: '/health', api: '/api' } });
  });
  app.get('/health', healthCheck);
  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

const app = createApp();
export default app;
