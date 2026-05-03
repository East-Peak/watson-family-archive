'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import type { ExplorerRecord } from '../types';

const TYPE_COLORS: Record<string, string> = {
  census: 'bg-blue-50 text-blue-700 border-blue-200',
  death: 'bg-gray-100 text-gray-600 border-gray-200',
  birth: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  marriage: 'bg-pink-50 text-pink-700 border-pink-200',
  military: 'bg-amber-50 text-amber-700 border-amber-200',
  burial: 'bg-stone-100 text-stone-600 border-stone-200',
  other: 'bg-purple-50 text-purple-600 border-purple-200',
};

const TIER_COLORS: Record<string, string> = {
  A: 'bg-green-50 text-green-700 border-green-200',
  B: 'bg-blue-50 text-blue-700 border-blue-200',
  C: 'bg-amber-50 text-amber-700 border-amber-200',
  D: 'bg-orange-50 text-orange-700 border-orange-200',
  E: 'bg-red-50 text-red-600 border-red-200',
};

function toTitleCase(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function MobileExplorerRecordCard({ record }: { record: ExplorerRecord }) {
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const participantsRegionId = useId();
  const typeColor = TYPE_COLORS[record.type] ?? TYPE_COLORS.other;
  const tierColor = record.tier
    ? TIER_COLORS[record.tier] ?? 'bg-gray-100 text-gray-500 border-gray-200'
    : null;

  return (
    <article className="rounded-3xl border border-shield/10 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${typeColor}`}>
              {toTitleCase(record.type)}
            </span>
            {record.tier && tierColor && (
              <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${tierColor}`}>
                Tier {record.tier}
              </span>
            )}
            {record.evidenceClass && (
              <span className="rounded-full bg-shield/[0.05] px-2.5 py-1 text-xs text-shield/70">
                {toTitleCase(record.evidenceClass)}
              </span>
            )}
          </div>
          <h3 className="mt-3 text-base font-semibold leading-tight text-shield">
            {record.collection}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {[record.year ?? 'Unknown year', record.place ?? 'Unknown place'].join(' · ')}
          </p>
        </div>

        {record.ark && (
          <a
            href={record.ark}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`View source for ${record.collection}${record.year ? ` (${record.year})` : ''}`}
            className="shrink-0 rounded-full border border-shield/15 bg-shield/[0.04] px-3 py-2 text-xs font-semibold text-shield transition-colors hover:bg-shield/[0.08]"
          >
            View Source
          </a>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
        <span className="rounded-full bg-shield/[0.05] px-2.5 py-1 text-shield/75">
          {record.participantCount} participants
        </span>
        <span className="rounded-full bg-shield/[0.05] px-2.5 py-1 text-shield/75">
          {record.linkedPeople.length} linked people
        </span>
      </div>

      <div className="mt-4 border-t border-shield/10 pt-4">
        <button
          type="button"
          onClick={() => setParticipantsOpen((current) => !current)}
          aria-expanded={participantsOpen}
          aria-controls={participantsRegionId}
          className="flex min-h-11 w-full items-center justify-between rounded-2xl border border-shield/10 bg-shield/[0.03] px-3 py-2 text-left text-sm font-semibold text-shield transition-colors hover:bg-shield/[0.05]"
        >
          <span>Participants ({record.participantCount})</span>
          <span className="text-shield/55">{participantsOpen ? 'Hide' : 'Show'}</span>
        </button>

        {participantsOpen && (
          <div id={participantsRegionId} className="mt-3 space-y-2">
            {record.participants.length === 0 ? (
              <p className="text-sm text-slate-500">No participant data available.</p>
            ) : (
              record.participants.map((participant, index) => {
                const content = (
                  <div className="rounded-2xl border border-shield/10 bg-white px-3 py-2">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-shield">{participant.name}</p>
                      {participant.role && (
                        <span className="rounded-full bg-shield/[0.05] px-2 py-0.5 text-[11px] text-shield/70">
                          {participant.role}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                      {participant.age && <span>Age {participant.age}</span>}
                      {participant.birthplace && <span>{participant.birthplace}</span>}
                    </div>
                  </div>
                );

                return participant.matchedSlug ? (
                  <Link
                    key={`${participant.name}-${index}`}
                    href={`/person/${participant.matchedSlug}`}
                    className="block"
                  >
                    {content}
                  </Link>
                ) : (
                  <div key={`${participant.name}-${index}`}>{content}</div>
                );
              })
            )}
          </div>
        )}
      </div>
    </article>
  );
}
