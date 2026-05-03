import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { AuthMisconfiguredError, findAllowlistEntry } from '@/lib/auth/allowlist';
import { setPrefilledEmailCookie } from '@/lib/auth/prefill-cookie';
import { magicLinkLimiter, checkRateLimit } from '@/lib/contributions/rate-limit';
import { hashEmail, log } from '@/lib/logger';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' };

function privateJson(body: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...NO_STORE_HEADERS,
      ...(init?.headers ?? {}),
    },
  });
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function hashIp(ip: string): string {
  const secret = process.env.AUTH_SECRET || 'dev';
  return createHash('sha256').update(`${secret}:${ip}`).digest('hex').slice(0, 16);
}

export async function POST(request: NextRequest) {
  let emailHash: string | undefined;

  try {
    const body = await request.json();
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

    if (!email || !isValidEmail(email)) {
      log.warn('auth.prepare_signin_validation_failed', { reason: 'invalid_email' });
      return privateJson({ error: 'A valid email is required.' }, { status: 400 });
    }

    emailHash = hashEmail(email);
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
    const ipHash = hashIp(ip);

    const rate = await checkRateLimit(magicLinkLimiter, ipHash);
    if (!rate.success) {
      log.warn('auth.prepare_signin_rate_limit_hit', { emailHash });
      return privateJson(
        { error: 'Too many sign-in attempts. Please try again later.' },
        { status: 429 }
      );
    }

    const entry = findAllowlistEntry(email);
    if (entry) {
      log.info('auth.prepare_signin_allowlist_hit', { emailHash, role: entry.role });
      return privateJson({ allowed: true });
    }

    log.info('auth.prepare_signin_allowlist_miss', { emailHash });
    const response = privateJson({ allowed: false, redirectTo: '/request-access' });
    setPrefilledEmailCookie(response, email);
    return response;
  } catch (error) {
    if (error instanceof AuthMisconfiguredError) {
      log.error('auth.prepare_signin_misconfigured', {
        ...(emailHash ? { emailHash } : {}),
        reason: error.message,
      });
      return privateJson(
        { error: 'Authentication is temporarily unavailable.', redirectTo: '/signin/error?reason=auth-misconfigured' },
        { status: 503 }
      );
    }

    log.error('auth.prepare_signin_failed', {
      ...(emailHash ? { emailHash } : {}),
      reason: error instanceof Error ? error.message : 'unknown',
    });
    return privateJson(
      { error: 'Failed to prepare sign-in.' },
      { status: 500 }
    );
  }
}
