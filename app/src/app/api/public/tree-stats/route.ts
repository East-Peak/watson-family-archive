import { NextResponse } from 'next/server';
import { getTreeStats } from '@/lib/tree-stats';

// Public endpoint — NOT behind auth. Explicitly excluded from middleware
// by the /api/public/* matcher exception in middleware.ts.
//
// Returns live counts pulled from the source-of-truth markdown files so
// external consumers (and the signin page) can show up-to-date tree
// statistics without needing a session. Cached briefly at the edge since
// the numbers only change after a research pipeline run.
export const revalidate = 3600; // re-read the filesystem at most once per hour

export async function GET() {
  const stats = getTreeStats();
  return NextResponse.json(stats, {
    headers: {
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
