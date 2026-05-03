import { NextRequest, NextResponse } from 'next/server';
import { createHash, randomBytes } from 'node:crypto';
import {
  ACCESS_REQUESTS_PRIVATE_TARGET,
  writeContributionMarkdown,
} from '@/lib/contributions/github-writer';
import { sendAdminNotification } from '@/lib/auth/email';
import { requestAccessLimiter, checkRateLimit } from '@/lib/contributions/rate-limit';
import { log, hashEmail } from '@/lib/logger';

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

function hashIp(ip: string): string {
  const secret = process.env.AUTH_SECRET || 'dev';
  return createHash('sha256').update(`${secret}:${ip}`).digest('hex').slice(0, 16);
}

function generateRequestId(): string {
  return randomBytes(4).toString('hex');
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request: NextRequest) {
  let emailHash: string | undefined;
  try {
    const body = await request.json();
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const relationship = typeof body.relationship === 'string' ? body.relationship.trim() : '';
    const message = typeof body.message === 'string' ? body.message.trim() : '';

    if (!name) {
      log.warn('contribution.access_request_validation_failed', { reason: 'missing_name' });
      return privateJson({ error: 'Name is required' }, { status: 400 });
    }
    if (!email || !isValidEmail(email)) {
      log.warn('contribution.access_request_validation_failed', { reason: 'invalid_email' });
      return privateJson({ error: 'A valid email is required' }, { status: 400 });
    }

    emailHash = hashEmail(email);

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
    const ipHash = hashIp(ip);

    const rate = await checkRateLimit(requestAccessLimiter, ipHash);
    if (!rate.success) {
      log.warn('contribution.rate_limit_hit', { endpoint: 'request-access', emailHash });
      return privateJson(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const requestId = generateRequestId();
    const path = `access-requests/${dateStr}_${requestId}.md`;

    const content = `---
request_id: ${requestId}
name: ${name}
email: ${email}
relationship: ${relationship || ''}
submitted_at: ${now.toISOString()}
submitted_from_ip: ${ipHash}
status: pending
---

${message}
`;

    await writeContributionMarkdown({
      path,
      content,
      commitMessage: `access request: ${requestId}`,
      target: ACCESS_REQUESTS_PRIVATE_TARGET,
    });

    await sendAdminNotification({
      subject: `[access-request] ${requestId}`,
      body: `${name} (${email}) has requested access.\n\nRelationship: ${relationship || '(not specified)'}\n\nMessage:\n${message || '(none)'}\n\nReview at: https://github.com/${ACCESS_REQUESTS_PRIVATE_TARGET.owner}/${ACCESS_REQUESTS_PRIVATE_TARGET.repo}/blob/${ACCESS_REQUESTS_PRIVATE_TARGET.branch}/${path}`,
    });

    log.info('contribution.access_request_submitted', { emailHash });

    // Development-only: append a summary to Tammy's workspace NOTES.md
    // Gated on an explicit env var so it never runs on Vercel.
    if (process.env.NOTIFY_TAMMY_WORKSPACE === 'true' && process.env.NODE_ENV === 'development') {
      try {
        const { appendFile } = await import('node:fs/promises');
        const notesPath = `${process.env.HOME}/.openclaw/workspace/NOTES.md`;
        const entry = `\n## Access request — ${now.toISOString()}\n- Name: ${name}\n- Email: ${email}\n- Relationship: ${relationship || '(not specified)'}\n- Status: pending\n\n${message || ''}\n`;
        await appendFile(notesPath, entry, 'utf-8');
      } catch (err) {
        // Best-effort: don't fail the request if the workspace notes append fails
        console.warn('Failed to append to Tammy NOTES.md (dev-only):', err);
      }
    }

    return privateJson({ status: 'received' });
  } catch (err) {
    log.error('contribution.access_request_failed', {
      ...(emailHash ? { emailHash } : {}),
      reason: err instanceof Error ? err.message : 'unknown',
    });
    return privateJson(
      { error: 'Failed to submit request' },
      { status: 500 }
    );
  }
}
