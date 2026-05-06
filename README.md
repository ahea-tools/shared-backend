# AHEA Shared Backend

Backend domain: `https://api.americanhealthequity.org`.
Squarespace tools page: `https://www.americanhealthequity.org/tools`.

## Architecture
- Squarespace sells memberships.
- Frontends are separate Vercel UI projects.
- This shared backend is the source of truth for AI access decisions.
- Browser never decides access.

## Official toolIds
- strategic-messaging
- career-positioning
- opportunity-finder
- funding-narrative

## Global free trial
Each verified email gets 2 generations total across all tools.

## Squarespace membership access model
- Webhook endpoint: `https://api.americanhealthequity.org/api/webhooks/squarespace`
- Webhooks are treated as external commerce signals; ingestion is idempotent in `webhook_events`.
- Paid access only granted for configured product/variant ID allowlist.
- `membership_entitlements` is backend source of truth for paid membership access.
- Sync/repair route: `POST /api/membership/sync-squarespace` using admin secret only.
- Monthly/annual lifecycle data must be validated with real purchases before production reliance.

## Frontend domain allowlist
Set `ALLOWED_ORIGINS` to include:
- https://strategic-messaging.americanhealthequity.org
- https://career-positioning.americanhealthequity.org
- https://opportunity-finder.americanhealthequity.org
- https://funding-narrative.americanhealthequity.org

## Environment variables
See `.env.example`, including Squarespace vars:
- `SQUARESPACE_API_KEY`
- `SQUARESPACE_WEBHOOK_SECRET`
- `SQUARESPACE_MEMBERSHIP_MONTHLY_PRODUCT_IDS`
- `SQUARESPACE_MEMBERSHIP_ANNUAL_PRODUCT_IDS`
- `SQUARESPACE_MEMBERSHIP_PURCHASE_URL`
- `SQUARESPACE_SYNC_ADMIN_SECRET`

## Migrations
Apply `supabase/migrations/*.sql` manually via Supabase CLI or SQL editor.

## Manual test checklist
1. Verify email.
2. Use 2 free generations.
3. Confirm third generation blocked.
4. Buy monthly membership.
5. Confirm entitlement row created.
6. Confirm generation allowed.
7. Repeat with annual membership.
8. Confirm unrelated Squarespace products do not grant access.
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
- `career-positioning`
- `opportunity-finder`
- `funding-narrative`

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
