import { NextRequest, NextResponse } from 'next/server';

const TARGET_ENDPOINT = 'https://api.americanhealthequity.org/api/webhooks/squarespace';
const TOPICS = ['order.create', 'order.update'];

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

  const apiKey = process.env.SQUARESPACE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ success: false, message: 'Squarespace API key is not configured.' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }

  const headers = { Authorization: `Bearer ${apiKey}`, Accept: 'application/json', 'Content-Type': 'application/json' };

  let existing: any = null;
  const listRes = await fetch('https://api.squarespace.com/v2/webhooks/subscriptions', { headers });
  if (listRes.ok) {
    const listJson = await listRes.json() as { result?: any[] };
    existing = (listJson.result ?? []).find((sub) => sub?.endpointUrl === TARGET_ENDPOINT && Array.isArray(sub?.topics) && TOPICS.every((t) => sub.topics.includes(t)));
  }

  let createdSecret: string | undefined;
  let subscription = existing;
  if (!subscription) {
    const createRes = await fetch('https://api.squarespace.com/v2/webhooks/subscriptions', {
      method: 'POST',
      headers,
      body: JSON.stringify({ endpointUrl: TARGET_ENDPOINT, topics: TOPICS })
    });
    if (!createRes.ok) {
      return NextResponse.json({ success: false, message: 'Unable to create Squarespace webhook subscription.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
    }
    const createJson = await createRes.json() as any;
    subscription = createJson;
    createdSecret = createJson?.secret;
  }

  return NextResponse.json({
    success: true,
    webhookSubscriptionId: subscription?.id ?? null,
    endpointUrl: TARGET_ENDPOINT,
    topics: TOPICS,
    webhookSecret: createdSecret,
    secretInstruction: createdSecret ? 'Copy this into Vercel as SQUARESPACE_WEBHOOK_SECRET immediately.' : undefined
  }, { headers: { 'Cache-Control': 'no-store' } });
}
