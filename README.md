# AHEA Shared Backend

Centralized Next.js App Router backend for AHEA frontend tools. The browser never decides access; Supabase/Postgres is the source of truth.

## Security model
- Service role key is server-only.
- Frontends must not query sensitive application tables.
- Cookies are signed HTTP-only identifiers, never source-of-truth.
- Rate limiting occurs before OpenAI calls.
- Blocked requests never call OpenAI.
- Full prompts are not logged by default.

## Environment
Use `.env.example` values in Vercel:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_SECRET`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `OPENAI_API_KEY`
- `BACKEND_COOKIE_SECRET`
- `ALLOWED_ORIGINS`
- `NODE_ENV`

## Free trial rule
Each verified email gets exactly **2** free generations across all tools globally.

## API routes
- `POST /api/auth/start`
- `POST /api/auth/verify`
- `GET /api/me`
- `POST /api/generate`
- `POST /api/access-code/redeem`
- `GET /api/health`

## Tool registry
Allowed tool IDs:
- `strategic-messaging`
- `grant-narrative`
- `board-brief`
- `community-update`

Frontend cannot choose arbitrary models.

## Migrations
Apply SQL under `supabase/migrations/*.sql` manually through Supabase CLI or dashboard SQL runner.

## Frontend integration
Frontend repos should:
- Set `NEXT_PUBLIC_AHEA_BACKEND_URL`
- Call `POST /api/generate` with `toolId`
- Render usage/payload from backend responses only
- Remove direct OpenAI usage
- Remove local trial/paywall enforcement

Frontend repos must not contain secrets (`OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `UPSTASH_REDIS_REST_TOKEN`, cookie secrets).

## OpenAI cost controls
- Enforce input limits per tool.
- Enforce `maxOutputTokens` per tool.
- Use centralized model config only.
- Recommend setting an OpenAI project spending cap.

## Testing
Run:
- `npm run typecheck`
- `npm run build`
- `npm test`
