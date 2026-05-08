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

## Squarespace webhook subscription auth requirement
- `SQUARESPACE_API_KEY` alone is **not sufficient** for creating webhook subscriptions.
- Squarespace Webhook Subscriptions API requires OAuth authentication.
- Set `SQUARESPACE_OAUTH_ACCESS_TOKEN` before calling `POST /api/admin/squarespace/create-webhook`.
- The site owner must obtain a Squarespace OAuth access token with Commerce Orders permission before using the temporary setup endpoint.

## Squarespace OAuth + webhook setup
1. Keep `ADMIN_SETUP_ENABLED=false` by default.
2. Add OAuth client credentials in Vercel: `SQUARESPACE_OAUTH_CLIENT_ID`, `SQUARESPACE_OAUTH_CLIENT_SECRET`, `SQUARESPACE_OAUTH_REDIRECT_URI`, `SQUARESPACE_OAUTH_SCOPES`.
3. Temporarily set `ADMIN_SETUP_ENABLED=true`.
4. Redeploy.
5. Open: `https://api.americanhealthequity.org/api/oauth/squarespace/start?admin_secret=YOUR_SQUARESPACE_SYNC_ADMIN_SECRET`.
6. Approve OAuth in Squarespace.
7. Copy returned `SQUARESPACE_OAUTH_ACCESS_TOKEN` into Vercel.
8. Copy returned `SQUARESPACE_OAUTH_REFRESH_TOKEN` if shown.
9. Copy `SQUARESPACE_OAUTH_ACCESS_TOKEN_EXPIRES_AT` if shown.
10. Redeploy quickly because access token is short-lived.
11. Call `POST https://api.americanhealthequity.org/api/admin/squarespace/create-webhook` with `x-admin-secret`.
12. Copy returned webhook secret into `SQUARESPACE_WEBHOOK_SECRET`.
13. Redeploy.
14. Set `ADMIN_SETUP_ENABLED=false`.
15. Redeploy.
16. Make a test monthly membership purchase.
17. Inspect `webhook_events` and `membership_entitlements`.
18. Configure monthly/annual product IDs or matcher env vars.
19. Test annual membership purchase.
20. Confirm paid access unlocks all tools.

Warnings:
- OAuth access token is short-lived.
- Refresh token is single-use and rotates.
- If refresh persistence is not implemented, rerun setup when needed.
- Routine incoming webhook receipt uses `SQUARESPACE_WEBHOOK_SECRET`, not OAuth.

## How to find Squarespace membership matchers
1. Make one monthly and one annual test purchase.
2. Open `webhook_events` in Supabase.
3. Inspect `metadata.descriptorFields`, `metadata.productIds`, `metadata.variantIds`, `metadata.skus`, `metadata.lineItemNames`, `metadata.planNames`, and `metadata.membershipAreaNames`.
4. Put exact monthly/annual values into `SQUARESPACE_MEMBERSHIP_MONTHLY_MATCHERS` and `SQUARESPACE_MEMBERSHIP_ANNUAL_MATCHERS`, or use product/variant ID env vars.
5. Redeploy and retest.
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
