'use client';

import { useState, useEffect, useRef } from 'react';

interface PersonSummary {
  personId: string;
  fullName: string;
  birthYear: number | null;
  deathYear: number | null;
  birthPlace: string | null;
}

interface ContextCardProps {
  personId?: string;
  personName?: string;
  onQuickAction: (message: string) => void;
}

export default function ContextCard({
  personId,
  personName,
  onQuickAction,
}: ContextCardProps) {
  const [summary, setSummary] = useState<PersonSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const cachedIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!personId) {
      setSummary(null);
      return;
    }
    if (personId === cachedIdRef.current) return;
    cachedIdRef.current = personId;
    setLoading(true);
    fetch(`/api/person/${encodeURIComponent(personId)}/summary`)
      .then((res) => {
        if (!res.ok) throw new Error('not found');
        return res.json();
      })
      .then((data: PersonSummary) => setSummary(data))
      .catch(() => setSummary(null))
      .finally(() => setLoading(false));
  }, [personId]);

  if (!personId) return null;
  const firstName = personName?.split(' ')[0] || 'this person';

  return (
    <div className="border-b border-amber-200/40 bg-amber-50/30 px-4 py-3">
      <h3 className="font-semibold text-gray-900 text-sm">
        {personName || 'Loading...'}
      </h3>
      {loading ? (
        <div className="mt-1 space-y-1">
          <div className="h-3 w-32 bg-gray-200 rounded animate-pulse" />
          <div className="h-3 w-24 bg-gray-200 rounded animate-pulse" />
        </div>
      ) : summary ? (
        <p className="text-xs text-gray-500 mt-1">
          {summary.birthYear && summary.deathYear
            ? `${summary.birthYear}–${summary.deathYear}`
            : summary.birthYear
              ? `b. ${summary.birthYear}`
              : ''}
          {summary.birthPlace && (
            <span className="ml-1">
              {summary.birthYear || summary.deathYear ? ' · ' : ''}
              {summary.birthPlace}
            </span>
          )}
        </p>
      ) : null}
      <div className="flex gap-2 mt-2">
        <button
          type="button"
          onClick={() =>
            onQuickAction(`What are the research gaps for ${firstName}?`)
          }
          className="px-2 py-1 text-xs bg-white border border-amber-200/60 text-gray-600 rounded hover:bg-amber-50 transition-colors"
        >
          Research gaps
        </button>
        <button
          type="button"
          onClick={() => onQuickAction(`Show me all records for ${firstName}`)}
          className="px-2 py-1 text-xs bg-white border border-amber-200/60 text-gray-600 rounded hover:bg-amber-50 transition-colors"
        >
          Show records
        </button>
      </div>
    </div>
  );
}
