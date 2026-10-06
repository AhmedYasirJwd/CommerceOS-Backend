import 'dotenv/config';
import { z } from 'zod';
import { looksLikePublicKey } from './keys.js';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().positive().default(3001),
    SUPABASE_URL: z.url({ message: 'SUPABASE_URL must be a valid URL' }),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),
    FRONTEND_URL: z.string().default('http://localhost:3000'),
    AUTH_MODE: z.enum(['demo', 'supabase']).default('demo'),
    DEFAULT_STORE_ID: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.guid({ message: 'DEFAULT_STORE_ID must be a UUID' }).optional(),
    ),
  })
  .superRefine((value, ctx) => {
    if (looksLikePublicKey(value.SUPABASE_SERVICE_ROLE_KEY)) {
      ctx.addIssue({
        code: 'custom',
        path: ['SUPABASE_SERVICE_ROLE_KEY'],
        message:
          'This is the public anon/publishable key. Use the secret key (sb_secret_...) or the legacy service_role key from Supabase -> Project Settings -> API Keys',
      });
    }
    if (value.AUTH_MODE === 'demo' && !value.DEFAULT_STORE_ID) {
      ctx.addIssue({
        code: 'custom',
        path: ['DEFAULT_STORE_ID'],
        message: 'DEFAULT_STORE_ID is required when AUTH_MODE=demo (run `npm run seed` to create a demo store)',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return parsed.data;
}

export const env = loadEnv();

export const isProduction = env.NODE_ENV === 'production';

/** Origins allowed by CORS. localhost:3000 is always allowed outside production. */
export const allowedOrigins: string[] = Array.from(
  new Set([
    ...env.FRONTEND_URL.split(',')
      .map((origin) => origin.trim().replace(/\/+$/, ''))
      .filter(Boolean),
    ...(isProduction ? [] : ['http://localhost:3000']),
  ]),
);
