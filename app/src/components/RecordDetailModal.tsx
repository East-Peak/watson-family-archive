'use client';

import React, { useEffect } from 'react';
import type { ParsedSource } from '@/types/person';

interface RecordDetailModalProps {
  source: ParsedSource | null;
  onClose: () => void;
}

const PROVIDER_LABELS: Record<string, string> = {
  familysearch: 'View on FamilySearch',
  findagrave: 'View on Find A Grave',
  wikitree: 'View on WikiTree',
  newspapers: 'View on Newspapers.com',
  ancestry: 'View on Ancestry',
  other: 'View Source',
};

const TIER_LABELS: Record<string, string> = {
  A: 'Government vital record',
  B: 'Census / military / immigration',
  C: 'Church / land / probate',
  D: 'Published genealogy',
  E: 'User tree / unsourced',
};

export default function RecordDetailModal({
  source,
  onClose,
}: RecordDetailModalProps) {
  // Close on Escape
  useEffect(() => {
    if (!source) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [source, onClose]);

  if (!source) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Drawer */}
      <div
        className="relative w-full max-w-md bg-white shadow-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 leading-tight">
              {source.collection || source.recordType}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              {source.year && (
                <span className="text-sm text-gray-500">{source.year}</span>
              )}
              {source.tier && (
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold ${
                    source.tier === 'A'
                      ? 'bg-green-100 text-green-700'
                      : source.tier === 'B'
                        ? 'bg-blue-100 text-blue-700'
                        : source.tier === 'C'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  Tier {source.tier}
                </span>
              )}
              {source.evidenceClass && (
                <span className="text-xs text-gray-400 capitalize">
                  {source.evidenceClass}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="Close"
          >
            <svg
              className="w-5 h-5 text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* External Link — prominent */}
          {source.url && (
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium transition-colors shadow-sm"
            >
              {PROVIDER_LABELS[source.provider] || 'View Original Record'}
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
            </a>
          )}

          {/* Record metadata */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">
              Record Details
            </h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-gray-500">Type</dt>
              <dd className="text-gray-900 capitalize">{source.recordType}</dd>
              <dt className="text-gray-500">Provider</dt>
              <dd className="text-gray-900 capitalize">{source.provider}</dd>
              {source.tier && (
                <>
                  <dt className="text-gray-500">Tier</dt>
                  <dd className="text-gray-900">
                    {source.tier} — {TIER_LABELS[source.tier] || 'Other'}
                  </dd>
                </>
              )}
              {source.record_id && (
                <>
                  <dt className="text-gray-500">Record ID</dt>
                  <dd className="text-gray-900 font-mono text-xs">
                    {source.record_id}
                  </dd>
                </>
              )}
            </dl>
          </div>

          {/* Key facts */}
          {source.keyFacts.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                Key Facts
              </h3>
              <ul className="space-y-1.5">
                {source.keyFacts.map((fact, i) => (
                  <li
                    key={i}
                    className="text-sm text-gray-700 flex items-start gap-2"
                  >
                    <span className="text-emerald-500 mt-0.5 shrink-0">•</span>
                    {fact}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Participants table */}
          {source.participants && source.participants.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                Participants ({source.participants.length})
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-100">
                      <th className="text-left py-2 font-medium">Name</th>
                      <th className="text-left py-2 font-medium">Role</th>
                      <th className="text-right py-2 font-medium">Age</th>
                      <th className="text-left py-2 font-medium">Occupation</th>
                      <th className="text-left py-2 font-medium">Birthplace</th>
                    </tr>
                  </thead>
                  <tbody>
                    {source.participants.map((p, i) => (
                      <tr
                        key={i}
                        className="border-b border-gray-50 text-gray-700"
                      >
                        <td className="py-1.5 font-medium">{p.name}</td>
                        <td className="py-1.5">{p.role || '--'}</td>
                        <td className="py-1.5 text-right">{p.age ?? '--'}</td>
                        <td className="py-1.5">{p.occupation || '--'}</td>
                        <td className="py-1.5">{p.birthplace || '--'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Details (key-value pairs) */}
          {source.details && Object.keys(source.details).length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                Additional Details
              </h3>
              <dl className="space-y-2 text-sm">
                {Object.entries(source.details).map(([key, value]) => (
                  <div key={key} className="flex gap-2">
                    <dt className="text-gray-500 capitalize shrink-0">
                      {key.replace(/_/g, ' ')}
                    </dt>
                    <dd className="text-gray-900">{String(value)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {/* Image */}
          {source.imageUrl && (
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                Record Image
              </h3>
              <a
                href={source.imageUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <img
                  src={source.imageUrl}
                  alt={source.collection}
                  className="w-full rounded-lg border border-gray-200 hover:border-indigo-300 transition-colors"
                />
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
