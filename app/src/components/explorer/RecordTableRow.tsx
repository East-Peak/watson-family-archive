'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { ExplorerRecord } from './types';

interface RecordTableRowProps {
  record: ExplorerRecord;
}

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

function toTitleCase(str: string): string {
  return str
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function RecordTableRow({ record }: RecordTableRowProps) {
  const [expanded, setExpanded] = useState<boolean>(false);

  const typeColor =
    TYPE_COLORS[record.type] ?? TYPE_COLORS.other;
  const tierColor = record.tier
    ? TIER_COLORS[record.tier] ?? 'bg-gray-100 text-gray-500 border-gray-200'
    : null;

  const participantTooltip = record.participants
    .slice(0, 5)
    .map((p) => p.name)
    .join(', ')
    + (record.participants.length > 5
      ? ` (+${record.participants.length - 5} more)`
      : '');

  return (
    <>
      <tr
        className="border-b border-stone-100 even:bg-stone-50/50 hover:bg-amber-50/40 transition-colors cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Type */}
        <td className="px-3 py-2 whitespace-nowrap">
          <span className="inline-flex items-center gap-1.5">
            <span className="text-shield/40 text-xs leading-none">
              {expanded ? '▾' : '▸'}
            </span>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${typeColor}`}
            >
              {toTitleCase(record.type)}
            </span>
            {record.ark && (
              <a
                href={record.ark}
                target="_blank"
                rel="noopener noreferrer"
                className="text-shield/30 hover:text-indigo-600 transition-colors"
                onClick={(e) => e.stopPropagation()}
                title="View on FamilySearch"
              >
                <span className="text-xs">↗</span>
              </a>
            )}
          </span>
        </td>

        {/* Year */}
        <td className="px-3 py-2 text-shield/60 text-sm whitespace-nowrap tabular-nums">
          {record.year ?? '--'}
        </td>

        {/* Collection */}
        <td className="px-3 py-2 text-shield/60 text-sm">
          <span
            className="block max-w-[250px] truncate"
            title={record.collection}
          >
            {record.collection}
          </span>
        </td>

        {/* Place */}
        <td className="px-3 py-2 text-shield/60 text-sm">
          {record.place ? (
            <span
              className="block max-w-[200px] truncate"
              title={record.place}
            >
              {record.place}
            </span>
          ) : (
            <span className="text-shield/30">--</span>
          )}
        </td>

        {/* People (participantCount) */}
        <td className="px-3 py-2 text-shield/60 text-sm text-center tabular-nums">
          <span className="group/ppl relative cursor-default">
            {record.participantCount}
            {record.participants.length > 0 && (
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover/ppl:block bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-20">
                {participantTooltip}
              </span>
            )}
          </span>
        </td>

        {/* Tier */}
        <td className="px-3 py-2 text-center whitespace-nowrap">
          {record.tier && tierColor ? (
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${tierColor}`}
            >
              {record.tier}
            </span>
          ) : (
            <span className="text-shield/30 text-sm">--</span>
          )}
        </td>

        {/* Evidence */}
        <td className="px-3 py-2 text-center text-shield/60 text-xs capitalize">
          {record.evidenceClass ? toTitleCase(record.evidenceClass) : (
            <span className="text-shield/30 text-sm">--</span>
          )}
        </td>

        {/* Linked */}
        <td className="px-3 py-2 text-center tabular-nums text-sm">
          {record.linkedPeople.length > 0 ? (
            <span className="text-indigo-600 font-medium">
              {record.linkedPeople.length}
            </span>
          ) : (
            <span className="text-shield/30">0</span>
          )}
        </td>
      </tr>

      {/* Expanded participant sub-table */}
      {expanded && (
        <tr>
          <td colSpan={8} className="bg-amber-50/30 border-b border-amber-200/40 px-6 py-3">
            {record.participants.length === 0 ? (
              <p className="text-shield/40 text-xs">No participant data available.</p>
            ) : (
              <table className="w-full text-xs text-shield/70">
                <thead>
                  <tr className="border-b border-amber-200/30">
                    <th className="text-left px-2 py-1 font-medium text-shield/50 uppercase tracking-wide">
                      Name
                    </th>
                    <th className="text-left px-2 py-1 font-medium text-shield/50 uppercase tracking-wide">
                      Role
                    </th>
                    <th className="text-left px-2 py-1 font-medium text-shield/50 uppercase tracking-wide">
                      Age
                    </th>
                    <th className="text-left px-2 py-1 font-medium text-shield/50 uppercase tracking-wide">
                      Occupation
                    </th>
                    <th className="text-left px-2 py-1 font-medium text-shield/50 uppercase tracking-wide">
                      Birthplace
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {record.participants.map((p, i) => (
                    <tr
                      key={i}
                      className="border-b border-amber-200/20 last:border-b-0"
                    >
                      <td className="px-2 py-1 whitespace-nowrap">
                        {p.matchedSlug ? (
                          <Link
                            href={`/person/${p.matchedSlug}`}
                            className="text-indigo-700 hover:text-indigo-900 transition-colors font-medium"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {p.name}
                          </Link>
                        ) : (
                          <span>{p.name}</span>
                        )}
                      </td>
                      <td className="px-2 py-1 whitespace-nowrap">
                        {p.role ?? '--'}
                      </td>
                      <td className="px-2 py-1 whitespace-nowrap tabular-nums">
                        {p.age ?? '--'}
                      </td>
                      <td className="px-2 py-1">
                        {p.occupation ?? '--'}
                      </td>
                      <td className="px-2 py-1">
                        {p.birthplace ?? '--'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
