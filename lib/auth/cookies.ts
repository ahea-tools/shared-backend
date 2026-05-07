import crypto from 'node:crypto';

export function signSessionValue(value: string, secret: string) {
  const sig = crypto.createHmac('sha256', secret).update(value).digest('hex');
  return `${value}.${sig}`;
}
export function verifySessionValue(signed: string, secret: string) {
  const [value, sig] = signed.split('.');
  if (!value || !sig) return null;
  const expected = crypto.createHmac('sha256', secret).update(value).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)) ? value : null;
}
export function hashCode(code: string, secret: string) {
  return crypto.createHash('sha256').update(`${secret}:${code}`).digest('hex');
}
