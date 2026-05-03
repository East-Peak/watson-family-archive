'use client';

import Link from 'next/link';
import type { FeedEntry } from '@/types/activity';

export function EditorialCard({ entry }: { entry: FeedEntry }) {
  return (
    <div className="bg-amber-50/50 border border-amber-200/50 rounded-lg p-5">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] font-medium px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full uppercase tracking-wide">
          Research Note
        </span>
      </div>
      <h4 className="font-serif text-lg text-shield mb-1">{entry.headline}</h4>
      {entry.body && (
        <p className="text-gray-600 text-sm leading-relaxed mb-2">{entry.body}</p>
      )}
      {entry.people && entry.people.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {entry.people.map(slug => (
            <Link
              key={slug}
              href={`/person/${slug}`}
              className="text-xs px-2 py-0.5 bg-white border border-gray-200 rounded-full text-shield hover:border-shield/30 transition-colors"
            >
              {slug.replace(/_/g, ' ')}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function CompactEntry({ entry }: { entry: FeedEntry }) {
  const icon = categoryIcon(entry.category);

  return (
    <div className="flex items-start gap-3 py-2">
      <span className="text-gray-400 text-sm mt-0.5 flex-shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <span className="text-sm text-gray-900">{entry.headline}</span>
        {entry.people && entry.people.length > 0 && entry.people.length <= 3 && (
          <span className="text-sm text-gray-400 ml-1">
            &mdash;{' '}
            {entry.people.map((slug, i) => (
              <span key={slug}>
                <Link href={`/person/${slug}`} className="text-shield hover:underline">
                  {slug.replace(/_/g, ' ')}
                </Link>
                {i < entry.people!.length - 1 ? ', ' : ''}
              </span>
            ))}
          </span>
        )}
      </div>
    </div>
  );
}

function categoryIcon(category: FeedEntry['category']) {
  switch (category) {
    case 'person': return '\u{1F464}';
    case 'research': return '\u{1F50D}';
    case 'site-update': return '\u2699\uFE0F';
    default: return '\u2022';
  }
}

export function DateHeader({ date }: { date: string }) {
  const formatted = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  return (
    <h3 className="text-sm font-medium text-gray-500 pt-6 pb-2 border-b border-gray-100 first:pt-0">
      {formatted}
    </h3>
  );
}
