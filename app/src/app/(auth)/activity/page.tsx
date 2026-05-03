'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import MotionWrapper from '@/components/ui/MotionWrapper';
import { EditorialCard, CompactEntry, DateHeader } from '@/components/ActivityFeed';
import type { FeedEntry, ActivityApiResponse } from '@/types/activity';

export default function ActivityPage() {
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const [pinnedEntries, setPinnedEntries] = useState<FeedEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/activity?page=${page}&limit=50`);
        if (!res.ok) return;
        const data: ActivityApiResponse = await res.json();

        // Separate pinned entries (only on page 1)
        if (page === 1) {
          setPinnedEntries(data.entries.filter(e => e.pinned));
          setEntries(data.entries.filter(e => !e.pinned));
        } else {
          setPinnedEntries([]); // clear page-1 editorials when paginating away
          setEntries(data.entries);
        }
        setTotal(data.total);
        setPages(data.pages);
      } catch (err) {
        console.error('Failed to load activity feed:', err);
      } finally {
        setLoaded(true);
      }
    }
    load();
  }, [page]);

  // Group entries by date for date headers
  const groupedByDate: [string, FeedEntry[]][] = [];
  let currentDate = '';
  for (const entry of entries) {
    if (entry.date !== currentDate) {
      currentDate = entry.date;
      groupedByDate.push([currentDate, []]);
    }
    groupedByDate[groupedByDate.length - 1][1].push(entry);
  }

  if (!loaded) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream">
      <MotionWrapper className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="font-serif text-3xl text-shield">Activity</h1>
          <p className="text-gray-500 mt-1">What&apos;s happening on the Watson Family Tree</p>
        </div>

        {/* Pinned entries */}
        {pinnedEntries.length > 0 && (
          <div className="space-y-4 mb-8">
            {pinnedEntries.map(entry => (
              <EditorialCard key={entry.id} entry={entry} />
            ))}
          </div>
        )}

        {/* Grouped feed */}
        {entries.length === 0 ? (
          <p className="text-gray-400 text-center py-12">No activity yet.</p>
        ) : (
          <div>
            {groupedByDate.map(([date, dateEntries]) => (
              <div key={date}>
                <DateHeader date={date} />
                <div className="divide-y divide-gray-50">
                  {dateEntries.map(entry =>
                    entry.category === 'editorial' ? (
                      <div key={entry.id} className="py-3">
                        <EditorialCard entry={entry} />
                      </div>
                    ) : (
                      <CompactEntry key={entry.id} entry={entry} />
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-center gap-4 pt-8 mt-8 border-t border-gray-100">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="text-sm text-shield hover:underline disabled:text-gray-300 disabled:no-underline"
            >
              &larr; Newer
            </button>
            <span className="text-sm text-gray-400">
              Page {page} of {pages} ({total} entries)
            </span>
            <button
              onClick={() => setPage(p => Math.min(pages, p + 1))}
              disabled={page === pages}
              className="text-sm text-shield hover:underline disabled:text-gray-300 disabled:no-underline"
            >
              Older &rarr;
            </button>
          </div>
        )}
      </MotionWrapper>
    </div>
  );
}
