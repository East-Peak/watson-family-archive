'use client';

import React, { useRef, useState, useEffect } from 'react';
import type { ParsedSource } from '@/types/person';
import RecordDetailModal from './RecordDetailModal';

interface HistoricalRecordsProps {
  sources: ParsedSource[];
  personName: string;
}

const RECORD_TYPE_ICONS: Record<string, string> = {
  census: '📋',
  birth: '📜',
  death: '💀',
  marriage: '💒',
  military: '🎖️',
  immigration: '🚢',
  burial: '🪦',
  other: '📄',
};

const PROVIDER_LABELS: Record<string, string> = {
  familysearch: 'View on FamilySearch',
  findagrave: 'View on Find A Grave',
  wikitree: 'View on WikiTree',
  newspapers: 'View on Newspapers.com',
  ancestry: 'View on Ancestry',
  other: 'View Source',
};

export default function HistoricalRecords({ sources, personName }: HistoricalRecordsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [selectedSource, setSelectedSource] = useState<ParsedSource | null>(null);

  const sorted = [...(sources || [])].sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999));

  const updateScrollState = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  };

  useEffect(() => {
    updateScrollState();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateScrollState, { passive: true });
    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', updateScrollState);
      ro.disconnect();
    };
  }, [sorted.length]);

  if (!sources || sources.length === 0) return null;

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const amount = scrollRef.current.offsetWidth * 0.8;
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -amount : amount,
      behavior: 'smooth',
    });
  };

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-shield uppercase tracking-widest">
          Historical Records
          <span className="ml-2 text-xs font-normal text-gray-400 normal-case tracking-normal">
            {sorted.length} record{sorted.length !== 1 ? 's' : ''}
          </span>
        </h2>
        {sorted.length > 1 && (
          <div className="flex gap-2">
            <button
              onClick={() => scroll('left')}
              disabled={!canScrollLeft}
              className="p-1.5 rounded-full bg-white/80 border border-gray-200 hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-default"
              aria-label="Scroll left"
            >
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={() => scroll('right')}
              disabled={!canScrollRight}
              className="p-1.5 rounded-full bg-white/80 border border-gray-200 hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-default"
              aria-label="Scroll right"
            >
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}
      </div>

      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-4 -mx-2 px-2"
        style={{ scrollbarWidth: 'thin' }}
      >
        {sorted.map((source, idx) => (
          <SourceCard key={idx} source={source} personName={personName} onSelect={() => setSelectedSource(source)} />
        ))}
      </div>

      <RecordDetailModal
        source={selectedSource}
        onClose={() => setSelectedSource(null)}
      />
    </section>
  );
}

function SourceCard({ source, personName, onSelect }: { source: ParsedSource; personName: string; onSelect: () => void }) {
  const icon = RECORD_TYPE_ICONS[source.recordType] || RECORD_TYPE_ICONS.other;

  // Wrap thumbnail in link if ARK exists
  const thumbnailContent = source.imageUrl ? (
    <img
      src={source.imageUrl}
      alt={source.collection}
      className="w-full h-full object-cover"
    />
  ) : (
    <div className="text-center text-gray-400">
      <span className="text-3xl">{icon}</span>
      <p className="text-xs mt-1 font-medium uppercase tracking-wide">
        {source.recordType}
      </p>
    </div>
  );

  // Make the entire card clickable to open the modal when URL exists
  if (source.url) {
    return (
      <div
        onClick={onSelect}
        className="snap-start shrink-0 w-[260px] sm:w-[280px] bg-white rounded-2xl border border-gray-200 shadow-lg hover:shadow-xl hover:border-indigo-300 transition-all overflow-hidden group cursor-pointer"
      >
        <div className="h-40 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center border-b border-gray-100 group-hover:from-indigo-50 group-hover:to-indigo-100 transition-colors">
          {thumbnailContent}
        </div>
        <div className="p-4">
          <h3 className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2 group-hover:text-indigo-700 transition-colors">
            {source.collection}
          </h3>
          {source.keyFacts.length > 0 && (
            <div className="mt-2 space-y-0.5">
              {source.keyFacts.slice(0, 2).map((fact, i) => (
                <p key={i} className="text-xs text-gray-500 truncate">{fact}</p>
              ))}
            </div>
          )}
          {source.recordType === 'census' && source.participants && source.participants.length >= 2 && (
            <HouseholdTable participants={source.participants} focalName={personName} />
          )}
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-800 transition-colors"
          >
            {PROVIDER_LABELS[source.provider] || 'View Source'}
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
      </div>
    );
  }

  // No URL — still clickable for modal (to see key facts / participants), muted styling
  return (
    <div
      onClick={onSelect}
      className="snap-start shrink-0 w-[260px] sm:w-[280px] bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden opacity-70 cursor-pointer hover:opacity-90 transition-opacity"
    >
      <div className="h-40 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center border-b border-gray-100">
        {thumbnailContent}
      </div>
      <div className="p-4">
        <h3 className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2">
          {source.collection}
        </h3>
        {source.keyFacts.length > 0 && (
          <div className="mt-2 space-y-0.5">
            {source.keyFacts.slice(0, 2).map((fact, i) => (
              <p key={i} className="text-xs text-gray-500 truncate">{fact}</p>
            ))}
          </div>
        )}
        {source.recordType === 'census' && source.participants && source.participants.length >= 2 && (
          <HouseholdTable participants={source.participants} focalName={personName} />
        )}
        <p className="mt-3 text-xs text-gray-400">No external link available</p>
      </div>
    </div>
  );
}

function HouseholdTable({ participants, focalName }: {
  participants: NonNullable<ParsedSource['participants']>;
  focalName: string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-t border-gray-100 mt-2 pt-2">
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setExpanded(!expanded); }}
        className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
      >
        <svg className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        Household ({participants.length})
      </button>
      {expanded && (
        <table className="w-full mt-2 text-xs">
          <thead>
            <tr className="text-gray-400 border-b border-gray-100">
              <th className="text-left py-1 font-medium">Name</th>
              <th className="text-left py-1 font-medium">Role</th>
              <th className="text-right py-1 font-medium">Age</th>
              <th className="text-left py-1 font-medium">Occupation</th>
            </tr>
          </thead>
          <tbody>
            {participants.map((p, i) => {
              const isFocal = p.name.toLowerCase() === focalName.toLowerCase() ||
                p.name.toLowerCase().includes(focalName.toLowerCase()) ||
                focalName.toLowerCase().includes(p.name.toLowerCase());
              return (
                <tr key={i} className={isFocal ? 'text-indigo-700 font-medium' : 'text-gray-600'}>
                  <td className="py-0.5">{p.name}</td>
                  <td className="py-0.5">{p.role || '--'}</td>
                  <td className="py-0.5 text-right">{p.age ?? '--'}</td>
                  <td className="py-0.5">{p.occupation || '--'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
