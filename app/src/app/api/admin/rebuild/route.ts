import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Redis } from '@upstash/redis';
import { auth } from '../../../../../auth';

const LOCK_KEY = 'rebuild:lock';
const LOCK_TTL_SECONDS = 10 * 60; // 10 minutes

const LAST_REBUILD_FILE = join(process.cwd(), '.last-rebuild');

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

export async function POST(_request: NextRequest) {
  // --- Auth check ---
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // --- Redis lock check ---
  const redis = getRedis();
  if (!redis) {
    return NextResponse.json(
      { error: 'Rebuild lock backend not configured' },
      { status: 503 },
    );
  }

  const existing = await redis.get<string>(LOCK_KEY);
  if (existing) {
    return NextResponse.json(
      { error: 'Rebuild already in progress', startedAt: existing },
      { status: 409 },
    );
  }

  // --- Acquire lock ---
  const startedAt = new Date().toISOString();
  await redis.set(LOCK_KEY, `in-progress:${startedAt}`, { ex: LOCK_TTL_SECONDS });

  // --- Spawn rebuild (fire-and-forget, same as the original) ---
  const cwd = process.cwd();
  const cmd = `node ${join(cwd, 'scripts', 'rebuild-from-markdown.mjs')} --clear`;

  exec(cmd, { cwd }, async (error, stdout, stderr) => {
    // Release the lock when the rebuild finishes (success or failure)
    try { await redis.del(LOCK_KEY); } catch { /* ignore */ }

    if (error) {
      console.error('Rebuild failed:', stderr);
      return;
    }

    try { writeFileSync(LAST_REBUILD_FILE, new Date().toISOString()); } catch { /* ignore */ }
    console.info('Rebuild complete:', stdout.split('\n').slice(-5).join('\n'));
  });

  return NextResponse.json({ status: 'started', startedAt });
}

function readLastRebuild(): string | null {
  try {
    if (!existsSync(LAST_REBUILD_FILE)) return null;
    const raw = readFileSync(LAST_REBUILD_FILE, 'utf-8');
    return raw.trim() || null;
  } catch {
    // Permission error, IO error, etc. — surface as "unknown" rather than 500.
    return null;
  }
}

export async function GET() {
  const redis = getRedis();

  let status = 'idle';
  let startedAt: string | null = null;

  if (redis) {
    const lock = await redis.get<string>(LOCK_KEY);
    if (lock) {
      status = 'running';
      // lock value is "in-progress:<ISO timestamp>"
      startedAt = lock.replace(/^in-progress:/, '');
    }
  }

  const lastRebuild = readLastRebuild();

  return NextResponse.json({ status, startedAt, lastRebuild });
}
