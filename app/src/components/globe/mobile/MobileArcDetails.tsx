'use client';

import type { Arc } from '../types';
import { haversineDistance } from '../utils';

interface MobileArcDetailsProps {
  arc: Arc;
}

export default function MobileArcDetails({ arc }: MobileArcDetailsProps) {
  const distanceKm = Math.round(
    haversineDistance(arc.from.lat, arc.from.lng, arc.to.lat, arc.to.lng),
  ).toLocaleString();

  return (
    <div className="space-y-4" data-testid="mobile-arc-details">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">From</div>
        <div className="mt-1 font-semibold text-white">{arc.from.place}</div>
        {arc.from.year && (
          <div className="mt-1 text-sm text-white/55">{arc.from.year}</div>
        )}
      </div>

      <div className="flex justify-center text-white/35">
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">To</div>
        <div className="mt-1 font-semibold text-white">{arc.to.place}</div>
        {arc.to.year && (
          <div className="mt-1 text-sm text-white/55">{arc.to.year}</div>
        )}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/70">
        Distance: {distanceKm} km
      </div>

      <a
        href={`/person/${arc.person_id}`}
        className="block rounded-2xl bg-indigo-600 px-4 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
      >
        View Person Story
      </a>
    </div>
  );
}
