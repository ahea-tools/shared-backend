import crypto from 'node:crypto';

export type VerifyResult = { ok: true } | { ok: false; reason: 'missing_header' | 'missing_secret' | 'invalid_hex_secret' | 'signature_mismatch' };

export function verifySquarespaceWebhook(rawBody: string | Buffer, signatureHeader: string | null, secretHex: string): VerifyResult {
  if (!signatureHeader) return { ok: false, reason: 'missing_header' };
  if (!secretHex?.trim()) return { ok: false, reason: 'missing_secret' };
  const normalizedSecret = secretHex.trim().toLowerCase();
  if (!/^[0-9a-f]+$/i.test(normalizedSecret) || normalizedSecret.length % 2 !== 0) return { ok: false, reason: 'invalid_hex_secret' };

  const key = Buffer.from(normalizedSecret, 'hex');
  const expectedHex = crypto.createHmac('sha256', key).update(rawBody).digest('hex');
  const receivedHex = signatureHeader.trim().toLowerCase();
  if (receivedHex.length !== expectedHex.length) return { ok: false, reason: 'signature_mismatch' };
  try {
    const equal = crypto.timingSafeEqual(Buffer.from(receivedHex, 'hex'), Buffer.from(expectedHex, 'hex'));
    return equal ? { ok: true } : { ok: false, reason: 'signature_mismatch' };
  } catch {
    return { ok: false, reason: 'signature_mismatch' };
  }
}
