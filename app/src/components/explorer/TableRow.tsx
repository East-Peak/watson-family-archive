'use client';

import Link from 'next/link';
import type { ExplorerPerson } from './types';

interface TableRowProps {
  person: ExplorerPerson;
}

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

function toTitleCase(str: string): string {
  return str
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatBirthDeath(year: number | null, place: string | null): string {
  if (!year && !place) return '--';
  const parts: string[] = [];
  if (year) parts.push(String(year));
  if (place) parts.push(place);
  return parts.join(', ');
}

export default function TableRow({ person }: TableRowProps) {
  const statusColor =
    STATUS_COLORS[person.status] ?? 'bg-gray-100 text-gray-500 border-gray-200';
  const completenessPercent = Math.max(0, Math.min(100, person.completenessScore));

  return (
    <tr className="border-b border-stone-100 even:bg-stone-50/50 hover:bg-amber-50/40 transition-colors">
      <td className="px-3 py-2 whitespace-nowrap">
        <Link
          href={`/person/${person.id}`}
          className="text-indigo-700 hover:text-indigo-900 transition-colors font-medium"
        >
          {person.fullName}
        </Link>
        {person.maidenName && (
          <span className="ml-1 text-shield/40 text-xs">(nee {person.maidenName})</span>
        )}
      </td>
      <td className="px-3 py-2 text-shield/60 text-sm whitespace-nowrap">
        {formatBirthDeath(person.birthYear, person.birthPlace)}
      </td>
      <td className="px-3 py-2 text-shield/60 text-sm whitespace-nowrap">
        {formatBirthDeath(person.deathYear, person.deathPlace)}
      </td>
      <td className="px-3 py-2 text-shield/60 text-sm whitespace-nowrap">
        {person.originCountry ?? '--'}
      </td>
      <td className="px-3 py-2 text-shield/60 text-sm text-center">
        {person.sex || '--'}
      </td>

      {/* Record Status */}
      <td className="px-3 py-2 whitespace-nowrap">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${statusColor}`}
        >
          {toTitleCase(person.status)}
        </span>
      </td>

      <td className="px-3 py-2 min-w-[100px]">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-shield/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full"
              style={{ width: `${completenessPercent}%` }}
            />
          </div>
          <span className="text-shield/50 text-xs tabular-nums w-6 text-right">
            {person.completenessScore}
          </span>
        </div>
      </td>
      <td className="px-3 py-2 text-shield/60 text-sm text-center tabular-nums">
        <span className="group/src relative cursor-default">
          {person.sourceCount}
          {person.recordCounts && Object.keys(person.recordCounts).length > 0 && (
            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover/src:block bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-20">
              {Object.entries(person.recordCounts)
                .sort(([, a], [, b]) => b - a)
                .map(([type, count]) => `${count} ${type}`)
                .join(', ')}
            </span>
          )}
        </span>
      </td>
      <td className="px-3 py-2 text-shield/60 text-sm text-center tabular-nums">
        {person.researchScore}
      </td>

      <td className="px-3 py-2 text-center">
        {person.validationStatus === 'pass' ? (
          <svg
            className="inline w-4 h-4 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
            aria-label="Pass"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg
            className="inline w-4 h-4 text-amber-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
            aria-label="Warning"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
            />
          </svg>
        )}
      </td>
    </tr>
  );
}
