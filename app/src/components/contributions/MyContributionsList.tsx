'use client';

import { useState } from 'react';
import type { ContributionRecord, ContributionStatus } from '@/lib/contributions/types';

interface MyContributionsListProps {
  items: ContributionRecord[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

const KIND_ICONS: Record<string, string> = {
  error: '⚠️',
  knowledge: '💡',
  memory: '📖',
  question: '❓',
};

function isOpen(status: ContributionStatus): boolean {
  return status === 'open' || status === 'in_progress';
}

function statusBadge(item: ContributionRecord): { label: string; className: string } {
  switch (item.status) {
    case 'open':
      return { label: 'Open', className: 'bg-sky-100 text-sky-800 border-sky-200' };
    case 'in_progress':
      return { label: 'In progress', className: 'bg-amber-100 text-amber-900 border-amber-200' };
    case 'accepted':
      return item.resolution.editorNote.trim()
        ? { label: 'Accepted with edits', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' }
        : { label: 'Accepted as submitted', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
    case 'rejected':
      return { label: 'Closed', className: 'bg-gray-100 text-gray-600 border-gray-200' };
    default:
      return { label: item.status, className: 'bg-gray-100 text-gray-600 border-gray-200' };
  }
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function deriveTitle(item: ContributionRecord): string {
  if (typeof item.title === 'string' && item.title.trim().length > 0) {
    return item.title.trim();
  }
  const summary = item.body.replace(/\s+/g, ' ').trim();
  if (!summary) return `Untitled ${item.kind}`;
  return summary.length > 80 ? `${summary.slice(0, 77)}...` : summary;
}

function ContributionCard({
  item,
  expanded,
  onToggle,
}: {
  item: ContributionRecord;
  expanded: boolean;
  onToggle: () => void;
}) {
  const badge = statusBadge(item);
  const icon = KIND_ICONS[item.kind] ?? '💬';

  return (
    <article className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base" aria-hidden="true">{icon}</span>
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-gray-600">
              {item.kind}
            </span>
            <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${badge.className}`}>
              {badge.label}
            </span>
          </div>
          <p className="mt-2 text-sm font-medium text-gray-900">
            {deriveTitle(item)}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            Submitted {formatDate(item.submittedAt)}
          </p>
        </div>
        <span className="mt-1 shrink-0 text-sm font-medium text-shield">
          {expanded ? 'Hide details' : 'View details'}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 px-5 py-4 space-y-3 text-sm text-gray-700">
          <p className="whitespace-pre-wrap leading-6 text-gray-800">{item.body}</p>

          {(item.when || item.where) && (
            <dl className="grid gap-2 text-sm text-gray-600 sm:grid-cols-2">
              {item.when && (
                <div>
                  <dt className="font-semibold text-gray-800">When</dt>
                  <dd>{item.when}</dd>
                </div>
              )}
              {item.where && (
                <div>
                  <dt className="font-semibold text-gray-800">Where</dt>
                  <dd>{item.where}</dd>
                </div>
              )}
            </dl>
          )}

          <p className="text-xs text-gray-500">
            Page:{' '}
            <a href={item.url} className="text-shield hover:underline">
              {item.url}
            </a>
          </p>

          {item.resolution.note.trim() && (
            <div className="rounded-lg bg-gray-50 px-4 py-3">
              <p className="text-xs font-semibold text-gray-600 mb-1">Stuart&apos;s note</p>
              <p className="whitespace-pre-wrap">{item.resolution.note}</p>
            </div>
          )}

          {item.status === 'accepted' && item.resolution.editorNote.trim() && (
            <div className="rounded-lg bg-emerald-50 px-4 py-3">
              <p className="text-xs font-semibold text-emerald-700 mb-1">Stuart&apos;s edit notes</p>
              <p className="whitespace-pre-wrap text-emerald-900">{item.resolution.editorNote}</p>
            </div>
          )}

          {item.status === 'rejected' && item.resolution.rejectedReason.trim() && (
            <div className="rounded-lg bg-gray-50 px-4 py-3">
              <p className="text-xs font-semibold text-gray-500 mb-1">Why it wasn&apos;t used</p>
              <p className="whitespace-pre-wrap text-gray-700">{item.resolution.rejectedReason}</p>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export default function MyContributionsList({
  items,
  loading = false,
  error = null,
  onRetry,
}: MyContributionsListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white px-6 py-8 text-sm text-gray-600 shadow-sm">
        Loading your contributions...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-6 py-8 text-sm text-rose-900">
        <p className="font-semibold">Couldn&apos;t load your contributions.</p>
        <p className="mt-2">{error}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
          >
            Try again
          </button>
        )}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center text-sm text-gray-600">
        <p className="text-base font-semibold text-gray-900">No contributions yet.</p>
        <p className="mt-2">
          Use the Comment pill on any page, or share a memory on a person&apos;s profile.
        </p>
      </div>
    );
  }

  const openItems = items.filter((i) => isOpen(i.status));
  const resolvedItems = items.filter((i) => !isOpen(i.status));

  // Only show section headings when both groups have items — avoids
  // duplicate "Open" text (section heading + status badge) in the DOM.
  const showHeadings = openItems.length > 0 && resolvedItems.length > 0;

  const toggle = (id: string) =>
    setExpandedId((current) => (current === id ? null : id));

  return (
    <div className="space-y-8">
      {openItems.length > 0 && (
        <section>
          {showHeadings && (
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              Open
            </h2>
          )}
          <div className="space-y-4">
            {openItems.map((item) => (
              <ContributionCard
                key={item.id}
                item={item}
                expanded={expandedId === item.id}
                onToggle={() => toggle(item.id)}
              />
            ))}
          </div>
        </section>
      )}

      {resolvedItems.length > 0 && (
        <section>
          {showHeadings && (
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              Resolved
            </h2>
          )}
          <div className="space-y-4">
            {resolvedItems.map((item) => (
              <ContributionCard
                key={item.id}
                item={item}
                expanded={expandedId === item.id}
                onToggle={() => toggle(item.id)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
