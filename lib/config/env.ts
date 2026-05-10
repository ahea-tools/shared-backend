import { z } from 'zod';

const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_JWT_SECRET: z.string().min(1),
  UPSTASH_REDIS_REST_URL: z.string().url(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  BACKEND_COOKIE_SECRET: z.string().min(32),
  AUTH_CALLBACK_URL: z.string().url().default('https://api.americanhealthequity.org/api/auth/callback'),
  ALLOWED_ORIGINS: z.string().min(1),
  SQUARESPACE_API_KEY: z.string().default(''),
  SQUARESPACE_OAUTH_CLIENT_ID: z.string().default(''),
  SQUARESPACE_OAUTH_CLIENT_SECRET: z.string().default(''),
  SQUARESPACE_OAUTH_REDIRECT_URI: z.string().url().default('https://api.americanhealthequity.org/api/oauth/squarespace/callback'),
  SQUARESPACE_OAUTH_SCOPES: z.string().default('website.orders.read,website.transactions.read'),
  SQUARESPACE_OAUTH_ACCESS_TOKEN: z.string().default(''),
  SQUARESPACE_OAUTH_REFRESH_TOKEN: z.string().default(''),
  SQUARESPACE_OAUTH_ACCESS_TOKEN_EXPIRES_AT: z.string().default(''),
  SQUARESPACE_WEBHOOK_SECRET: z.string().optional(),
  SQUARESPACE_MEMBERSHIP_MONTHLY_PRODUCT_IDS: z.string().default(''),
  SQUARESPACE_MEMBERSHIP_ANNUAL_PRODUCT_IDS: z.string().default(''),
  SQUARESPACE_MEMBERSHIP_PURCHASE_URL: z.string().url().optional(),
  SQUARESPACE_MEMBERSHIP_MONTHLY_MATCHERS: z.string().default(''),
  SQUARESPACE_MEMBERSHIP_ANNUAL_MATCHERS: z.string().default(''),
  SQUARESPACE_MEMBERSHIP_SHARED_PRODUCT_IDS: z.string().default(''),
  SQUARESPACE_MEMBERSHIP_MONTHLY_PRICE_VALUES: z.string().default(''),
  SQUARESPACE_MEMBERSHIP_ANNUAL_PRICE_VALUES: z.string().default(''),
  SQUARESPACE_MEMBERSHIP_PRICE_CURRENCY: z.string().default('USD'),
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
