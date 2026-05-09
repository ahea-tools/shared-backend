import { NextRequest, NextResponse } from 'next/server';
import { getEnv } from '@/lib/config/env';

const AHEA_PREVIEW_HOST_SUFFIX = '.americanhealthequity-org.vercel.app';

function parseAllowedOrigins(): Set<string> {
  const env = getEnv();
  return new Set(env.ALLOWED_ORIGINS.split(',').map((v) => v.trim()).filter(Boolean));
}

function isAheaVercelPreviewOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.protocol === 'https:' && url.hostname.endsWith(AHEA_PREVIEW_HOST_SUFFIX);
  } catch {
    return false;
  }
}

export function isAllowedOrigin(origin: string | null): origin is string {
  if (!origin) return false;
  const allowedOrigins = parseAllowedOrigins();
  return allowedOrigins.has(origin) || isAheaVercelPreviewOrigin(origin);
}

export function withCors(req: NextRequest, response: NextResponse): NextResponse {
  const origin = req.headers.get('origin');
  if (!isAllowedOrigin(origin)) return response;

  response.headers.set('Access-Control-Allow-Origin', origin);
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  response.headers.set('Vary', 'Origin');
  return response;
}

export function preflightResponse(req: NextRequest): NextResponse {
  const origin = req.headers.get('origin');
  if (!isAllowedOrigin(origin)) {
    return new NextResponse(null, { status: 403 });
  }

  const response = new NextResponse(null, { status: 204 });
  return withCors(req, response);
}
