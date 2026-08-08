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
- evidence-in-practice

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

Evidence in Practice also requires server-only NCBI E-Utilities configuration:
- `NCBI_TOOL`
- `NCBI_EMAIL`
- `NCBI_API_KEY` (optional but preferred)

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
- `NCBI_TOOL`
- `NCBI_EMAIL`
- `NCBI_API_KEY` (optional but preferred)

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


## Evidence in Practice MVP policy
- Tool ID: `evidence-in-practice`.
- The backend retrieves PubMed metadata and abstracts with NCBI E-Utilities only after request validation, verified backend session/access approval, and rate-limit approval.
- Tests mock NCBI and OpenAI; tests must not call live NCBI or live OpenAI.
- Abstracts are held in memory for the request and are not persisted or logged.
- Evidence retrieval uses bounded internal OpenAI interpretation and batched relevance screening calls; these are part of the request and do not create separate generation events or usage increments.
- If fewer than the configured minimum relevant PubMed abstracts remain after retrieval, the backend returns an `insufficient_evidence` response with a schema-valid `output`, skips final synthesis, and does not increment free-trial usage.
- Vercel project `shared-backend-2` must define `NCBI_TOOL`, `NCBI_EMAIL`, and optionally `NCBI_API_KEY` as server-side environment variables only. Do not expose NCBI or backend secrets to frontend repos.
- Production target remains `https://api.americanhealthequity.org`.

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

## Member calendar-month generation allowance

Active `paid` and `comped` profiles receive **100 completed tool generations per calendar month**, shared globally across every registered AHEA tool. The allowance belongs to the authenticated Supabase user and is not pooled or transferable. Administrators are exempt. Unused generations do not roll over.

A calendar month begins at 12:00 a.m. on its first day in the IANA zone `America/Chicago`; this handles CST/CDT transitions rather than assuming a fixed UTC offset. A generation counts only after the backend has a valid result ready to return. A valid Evidence in Practice `insufficient_evidence` result counts for a member. Validation, authentication, verification, short-window rate-limit, monthly-limit, provider, parsing, structured-output, source-integrity, and other failed requests do not count.

This is separate from the unchanged lifetime trial of two successful generations per verified email. `profiles.generations_used` remains the free-trial counter and was not repurposed. Upstash remains the existing short-window rate limiter; Supabase/Postgres is the durable monthly source of truth.

`202607300001_member_monthly_generation_allowance.sql` creates the backend-only `member_generation_reservations` ledger and the `reserve_member_monthly_generation`, `finalize_member_monthly_generation`, `release_member_monthly_generation`, and `get_member_monthly_generation_usage` RPCs. Reservations expire after 30 minutes and are lazily marked expired. Per-user Postgres advisory transaction locks serialize reservations across tools.

Applicable `/api/me` and `/api/generate` responses include:

```json
"memberMonthlyUsage": {
  "generationsUsed": 27,
  "generationsLimit": 100,
  "remainingGenerations": 73,
  "periodStart": "2026-07-01T05:00:00.000Z",
  "periodEnd": "2026-08-01T05:00:00.000Z",
  "resetsAt": "2026-08-01T05:00:00.000Z"
}
```

Non-applicable free/admin accounts receive `memberMonthlyUsage: null`. `/api/me` also returns `generationAvailable` and `generationBlockReason`. Exhausted members retain `paid`/`comped` access and receive HTTP 403, reason `member_monthly_limit_reached`, a neutral paywall, reset timestamp, and the message “You’ve used your 100 tool generations for this calendar month. Your allowance resets on [reset date]. Your other membership benefits remain available.”

### Migration and deployment

1. Review this branch, validations, PR, and Vercel Preview build. A preview cannot exercise the RPCs against a database where this migration has not been applied; use a separately migrated non-production Supabase project for full preview testing.
2. In the target Supabase dashboard SQL Editor, paste and run the complete contents of `supabase/migrations/202607300001_member_monthly_generation_allowance.sql` once (or run the repository's normal Supabase migration workflow). Confirm the table, four functions, RLS, grants, indexes, and trigger exist. The migration is additive and does not rewrite profiles or history.
3. Apply the migration before production backend code depends on it, merge the PR, then deploy the `shared-backend-2` production project. No new environment variables are required.
4. Verify designated test accounts with Hoppscotch. Complete frontend-repository display work only afterward; frontends must render backend values and must not calculate, reserve, or call usage RPCs.

### Hoppscotch verification

Use `https://api.americanhealthequity.org`, `Content-Type: application/json`, an allowed `Origin`, and the designated account's signed HTTP-only `ahea_session` cookie (obtained through the normal authentication flow). Never paste service-role/provider secrets into Hoppscotch. For POST examples use a valid registered-tool payload, such as `{"toolId":"strategic-messaging","input":{"message":"Example test message long enough for validation","audience":"general public","mode":"standard"}}`.

1. **Paid below limit:** `GET /api/me`; expect 200, active `accessStatus: "paid"`, `memberMonthlyUsage`, `generationAvailable: true`, and no usage change. Confirm completed/reserved rows for only the designated user/current period.
2. **Paid success:** `POST /api/generate` with the headers/cookie/body above; expect 200 and the existing output wrapper plus updated `memberMonthlyUsage`. Compare a subsequent authenticated `GET /api/me`: `generationsUsed` increased by one and `remainingGenerations` decreased by one; the reservation is `completed`.
3. **Limit:** use a designated seeded preview/test account already at 100 (never edit a real member). POST as above; expect 403, `reason: "member_monthly_limit_reached"`, used 100, limit 100, remaining 0, `resetsAt`, active membership, and `paywall.show: false`. Repeat GET; expect `generationAvailable: false` and the same block reason/count. Confirm no additional row/count. Provider non-invocation must be verified through automated mocks or sanitized preview logs; production responses alone cannot prove it.
4. **Comped:** repeat GET then POST with a designated active comped cookie; expect the same 100 allowance and one completed reservation.
5. **Admin:** repeat GET then POST with an admin cookie; expect `memberMonthlyUsage: null`, successful generation, and no reservation row.
6. **Free trial:** repeat with a verified free cookie; expect `memberMonthlyUsage: null`, unchanged lifetime limit 2, and `profiles.generations_used` to increment only on successful trial results.
7. **Expired member:** repeat with a designated expired paid/comped cookie; expect effective `accessStatus: "free"`, `memberMonthlyUsage: null`, and existing free-trial behavior.
8. **Failure cleanup:** in a safe preview/test environment induce a mocked provider failure after reservation; expect 500/502, unchanged monthly usage, and a `released` reservation. Then GET `/api/me`; expect the prior counts. Do not induce failures against live providers.

For every request, retain the same allowed Origin and signed-session authentication state; inspect only sanitized logs and rows belonging to designated test accounts. Successful GET requests never change usage, successful applicable POST requests add exactly one completion, and blocked/failed POST requests add none.
