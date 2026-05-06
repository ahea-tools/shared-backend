import { z } from 'zod';

const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_JWT_SECRET: z.string().min(1),
  UPSTASH_REDIS_REST_URL: z.string().url(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  BACKEND_COOKIE_SECRET: z.string().min(32),
  ALLOWED_ORIGINS: z.string().min(1),
  SQUARESPACE_API_KEY: z.string().default(''),
  SQUARESPACE_WEBHOOK_SECRET: z.string().optional(),
  SQUARESPACE_MEMBERSHIP_MONTHLY_PRODUCT_IDS: z.string().default(''),
  SQUARESPACE_MEMBERSHIP_ANNUAL_PRODUCT_IDS: z.string().default(''),
  SQUARESPACE_MEMBERSHIP_PURCHASE_URL: z.string().url().optional(),
  SQUARESPACE_SYNC_ADMIN_SECRET: z.string().default(''),
  ADMIN_SETUP_ENABLED: z.enum(['true','false']).default('false'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development')
});

export type Env = z.infer<typeof envSchema>;
let parsedEnv: Env | null = null;
export function getEnv(): Env {
  if (!parsedEnv) parsedEnv = envSchema.parse(process.env);
  return parsedEnv;
}
