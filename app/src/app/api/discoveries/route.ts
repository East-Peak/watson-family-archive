import { NextRequest, NextResponse } from 'next/server';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import matter from 'gray-matter';

const VERIFIED_NODES_DIR = join(process.cwd(), '..', 'data', 'verified_nodes');

interface Discovery {
  slug: string;
  name: string;
  lastUpdated: string;
  sources: string[];
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '7', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    const files = await readdir(VERIFIED_NODES_DIR);
    const mdFiles = files.filter(
      (f) => f.endsWith('.md') && !f.startsWith('_'),
    );

    const discoveries: Discovery[] = [];

    for (const file of mdFiles) {
      const content = await readFile(join(VERIFIED_NODES_DIR, file), 'utf-8');
      const { data: fm } = matter(content);

      const lastUpdated = fm.last_updated;
      if (!lastUpdated || lastUpdated < cutoffStr) continue;

      // Extract recently added sources from frontmatter sources array (preferred)
      // or fall back to body text parsing
      const fmSources = fm.sources as
        | Array<{ added?: string; collection?: string }>
        | undefined;
      let recentSourceNames: string[];

      if (Array.isArray(fmSources) && fmSources.length > 0) {
        recentSourceNames = fmSources
          .filter(
            (s: { added?: string; collection?: string }) =>
              s.added && s.added >= cutoffStr,
          )
          .map((s: { collection?: string }) => s.collection || 'Unknown');
      } else {
        // Fallback: parse body text for auto-promoted sources
        const sourceMatches =
          content.match(
            /Added: (\d{4}-\d{2}-\d{2}) \(auto-promoted from staging\)/g,
          ) || [];
        const recentBodySources = sourceMatches.filter((m) => {
          const dateMatch = m.match(/(\d{4}-\d{2}-\d{2})/);
          return dateMatch && dateMatch[1] >= cutoffStr;
        });

        if (recentBodySources.length === 0) continue;

        recentSourceNames = [];
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes('auto-promoted from staging')) {
            for (let j = i - 1; j >= Math.max(0, i - 10); j--) {
              const titleMatch = lines[j].match(/^\d+\.\s+\*\*(.+?)\*\*/);
              if (titleMatch) {
                recentSourceNames.push(titleMatch[1]);
                break;
              }
            }
          }
        }

        if (recentSourceNames.length === 0) {
          recentSourceNames = [`${recentBodySources.length} new record(s)`];
        }
      }

      if (recentSourceNames.length === 0) continue;

      discoveries.push({
        slug: file.replace('.md', ''),
        name: fm.name?.full || file.replace('.md', '').replace(/_/g, ' '),
        lastUpdated,
        sources: recentSourceNames,
      });

      if (discoveries.length >= limit) break;
    }

    // Sort by lastUpdated descending
    discoveries.sort((a, b) => b.lastUpdated.localeCompare(a.lastUpdated));

    return NextResponse.json({
      count: discoveries.length,
      since: cutoffStr,
      discoveries,
    });
  } catch (error) {
    console.error('Error fetching discoveries:', error);
    return NextResponse.json(
      { error: 'Failed to fetch discoveries' },
      { status: 500 },
    );
  }
}
