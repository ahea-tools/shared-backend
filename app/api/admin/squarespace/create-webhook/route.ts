import { NextRequest, NextResponse } from 'next/server';

const TARGET_ENDPOINT = 'https://api.americanhealthequity.org/api/webhooks/squarespace';
const TOPICS = ['order.create', 'order.update'];
const WEBHOOK_SUBSCRIPTIONS_URL = 'https://api.squarespace.com/1.0/webhook_subscriptions';

// Temporary setup endpoint for one-time webhook provisioning/verification.
// Disable ADMIN_SETUP_ENABLED once Squarespace webhook setup is complete.
export async function POST(req: NextRequest) {
  const setupEnabled = process.env.ADMIN_SETUP_ENABLED === 'true';
  if (!setupEnabled) {
    return NextResponse.json({ success: false }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }

  const adminSecret = process.env.SQUARESPACE_SYNC_ADMIN_SECRET;
  const provided = req.headers.get('x-admin-secret');
  if (!adminSecret || !provided || provided !== adminSecret) {
    return NextResponse.json({ success: false }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }

  const oauthAccessToken = process.env.SQUARESPACE_OAUTH_ACCESS_TOKEN;
  if (!oauthAccessToken) {
    return NextResponse.json({ success: false, message: 'SQUARESPACE_OAUTH_ACCESS_TOKEN is required to create Squarespace webhook subscriptions.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }

  const headers = {
    Authorization: `Bearer ${oauthAccessToken}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': 'AHEA Shared Backend'
  };

  let existing: any = null;
  let listRes: Response;
  try {
    listRes = await fetch(WEBHOOK_SUBSCRIPTIONS_URL, { headers });
  } catch {
    return NextResponse.json({ success: false, step: 'list-existing-subscriptions', message: 'Unable to reach Squarespace API.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }

  if (!listRes.ok) {
    let squarespaceMessage = '';
    try { squarespaceMessage = JSON.stringify(await listRes.json()); } catch {}
    return NextResponse.json({ success: false, step: 'list-existing-subscriptions', message: 'Squarespace list subscriptions request failed.', squarespaceStatus: listRes.status, squarespaceMessage }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }

  const listJson = await listRes.json() as { result?: any[]; webhookSubscriptions?: any[] };
  const subs = listJson.result ?? listJson.webhookSubscriptions ?? [];
  existing = subs.find((sub) => sub?.endpointUrl === TARGET_ENDPOINT && Array.isArray(sub?.topics) && TOPICS.every((t) => sub.topics.includes(t)));

  let createdSecret: string | undefined;
  let subscription = existing;
  if (!subscription) {
    let createRes: Response;
    try {
      createRes = await fetch(WEBHOOK_SUBSCRIPTIONS_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({ endpointUrl: TARGET_ENDPOINT, topics: TOPICS })
      });
    } catch {
      return NextResponse.json({ success: false, step: 'create-subscription', message: 'Unable to reach Squarespace API.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
    }

    if (!createRes.ok) {
      let squarespaceMessage = '';
      try { squarespaceMessage = JSON.stringify(await createRes.json()); } catch {}
      return NextResponse.json({ success: false, step: 'create-subscription', message: 'Squarespace create subscription request failed.', squarespaceStatus: createRes.status, squarespaceMessage }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
    }

    const createJson = await createRes.json() as any;
    subscription = createJson?.webhookSubscription ?? createJson;
    createdSecret = createJson?.secret;
  }

  return NextResponse.json({ success: true, webhookSubscriptionId: subscription?.id ?? null, endpointUrl: TARGET_ENDPOINT, topics: TOPICS, webhookSecret: createdSecret, secretInstruction: createdSecret ? 'Copy this into Vercel as SQUARESPACE_WEBHOOK_SECRET immediately.' : undefined }, { headers: { 'Cache-Control': 'no-store' } });
}
