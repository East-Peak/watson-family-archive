import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';

import type { ActivityFeedFile, ActivityApiResponse } from '@/types/activity';

const FEED_PATH = join(process.cwd(), '..', 'data', 'activity_feed.json');

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rawPage = parseInt(searchParams.get('page') || '1', 10);
  const rawLimit = parseInt(searchParams.get('limit') || '50', 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 50;

  let feed: ActivityFeedFile;
  try {
    const raw = await readFile(FEED_PATH, 'utf-8');
    feed = JSON.parse(raw);
  } catch {
    // No feed file yet — return empty state
    const empty: ActivityApiResponse = {
      entries: [],
      total: 0,
      page: 1,
      pages: 0,
      generatedAt: '',
    };
    return NextResponse.json(empty);
  }

  const total = feed.entries.length;
  const pages = Math.ceil(total / limit);
  const start = (page - 1) * limit;
  const entries = feed.entries.slice(start, start + limit);

  const response: ActivityApiResponse = {
    entries,
    total,
    page,
    pages,
    generatedAt: feed.generatedAt,
  };

  return NextResponse.json(response);
}
