import app from './app.js';
import { allowedOrigins, env } from './config/env.js';

const server = app.listen(env.PORT, () => {
  console.log(`CommerceOS backend listening on http://localhost:${env.PORT}`);
  console.log(`  environment: ${env.NODE_ENV} | auth mode: ${env.AUTH_MODE}`);
  console.log(`  CORS origins: ${allowedOrigins.join(', ') || '(none)'}`);
});

function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
