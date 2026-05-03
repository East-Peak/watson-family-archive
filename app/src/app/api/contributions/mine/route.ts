import { NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { listContributionsBySubmitterEmailHash } from '@/lib/contributions/store';
import type { ContributionRecord } from '@/lib/contributions/types';
import { hashEmail, log } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

const OPEN_STATUSES = new Set(['open', 'in_progress']);

function groupContributions(items: ContributionRecord[]): {
  open: ContributionRecord[];
  closed: ContributionRecord[];
} {
  const open: ContributionRecord[] = [];
  const closed: ContributionRecord[] = [];

  for (const item of items) {
    if (OPEN_STATUSES.has(item.status)) {
      open.push(item);
    } else {
      closed.push(item);
    }
  }

  return { open, closed };
}

export async function GET() {
  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase();

  if (!email) {
    return privateJson({ error: 'Authentication required' }, { status: 401 });
  }

  const emailHash = hashEmail(email);

  try {
    const items = await listContributionsBySubmitterEmailHash(emailHash);
    const grouped = groupContributions(items);

    log.info('contribution.mine_loaded', {
      emailHash,
      open: grouped.open.length,
      closed: grouped.closed.length,
    });

    return privateJson(grouped);
  } catch (error) {
    log.error('contribution.mine_failed', {
      emailHash,
      reason: error instanceof Error ? error.message : 'unknown',
    });
    return privateJson({ error: 'Failed to load contributions' }, { status: 503 });
  }
}
