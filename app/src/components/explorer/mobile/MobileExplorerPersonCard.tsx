'use client';

import Link from 'next/link';
import type { ExplorerPerson } from '../types';

const STATUS_COLORS: Record<string, string> = {
  verified: 'bg-green-50 text-green-700 border-green-200',
  deep_verified: 'bg-green-50 text-green-700 border-green-200',
  partially_verified: 'bg-blue-50 text-blue-700 border-blue-200',
  living: 'bg-blue-50 text-blue-700 border-blue-200',
  needs_research: 'bg-amber-50 text-amber-700 border-amber-200',
  auto_generated: 'bg-orange-50 text-orange-700 border-orange-200',
  stub: 'bg-gray-100 text-gray-500 border-gray-200',
  cross_reference: 'bg-purple-50 text-purple-700 border-purple-200',
};

function toTitleCase(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatLifeEvent(year: number | null, place: string | null): string {
  if (!year && !place) return 'Unknown';
  return [year ? String(year) : null, place].filter(Boolean).join(', ');
}

export default function MobileExplorerPersonCard({ person }: { person: ExplorerPerson }) {
  const completenessPercent = Math.max(0, Math.min(100, person.completenessScore));
  const statusColor = STATUS_COLORS[person.status] ?? 'bg-gray-100 text-gray-500 border-gray-200';

  return (
    <Link
      href={`/person/${person.id}`}
      className="block rounded-3xl border border-shield/10 bg-white p-4 shadow-sm transition-colors hover:bg-shield/[0.02]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold leading-tight text-shield">{person.fullName}</h3>
          {person.maidenName && (
            <p className="mt-1 text-sm text-slate-500">nee {person.maidenName}</p>
          )}
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-1 text-xs font-semibold ${statusColor}`}>
          {toTitleCase(person.status)}
        </span>
      </div>

      <dl className="mt-3 space-y-2 text-sm text-slate-600">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-shield/45">Birth</dt>
          <dd className="mt-1">{formatLifeEvent(person.birthYear, person.birthPlace)}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-shield/45">Death</dt>
          <dd className="mt-1">{formatLifeEvent(person.deathYear, person.deathPlace)}</dd>
        </div>
      </dl>

      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
        {person.originCountry && (
          <span className="rounded-full bg-shield/[0.05] px-2.5 py-1 text-shield/75">
            Origin: {person.originCountry}
          </span>
        )}
        {person.sex && (
          <span className="rounded-full bg-shield/[0.05] px-2.5 py-1 text-shield/75">
            {person.sex === 'M' ? 'Male' : person.sex === 'F' ? 'Female' : person.sex}
          </span>
        )}
        <span className="rounded-full bg-shield/[0.05] px-2.5 py-1 text-shield/75">
          {person.sourceCount} sources
        </span>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <div className="flex-1">
          <div className="h-2 rounded-full bg-shield/10">
            <div
              className="h-2 rounded-full bg-indigo-500"
              style={{ width: `${completenessPercent}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-slate-500">Completeness {person.completenessScore}%</p>
        </div>

        <div className="shrink-0 rounded-full bg-shield/[0.05] px-2.5 py-1 text-xs font-semibold text-shield">
          {person.validationStatus === 'pass' ? 'Validated' : 'Needs review'}
        </div>
      </div>
    </Link>
  );
}
