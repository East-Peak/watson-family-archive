'use client';

interface PersonHighlightCardProps {
  personName: string;
  birthYear: number | null;
  deathYear: number | null;
  locationCount: number;
  arcCount: number;
  highlightPersonId: string;
  onClear: () => void;
}

export default function PersonHighlightCard({
  personName,
  birthYear,
  deathYear,
  locationCount,
  arcCount,
  highlightPersonId,
  onClear,
}: PersonHighlightCardProps) {
  return (
    <div className="absolute bottom-24 left-4 right-4 z-10 bg-black/80 backdrop-blur-md border border-white/15 rounded-xl p-4 max-w-[calc(100vw-2rem)] shadow-2xl sm:bottom-4 sm:right-auto sm:max-w-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-white font-serif font-bold text-lg truncate">
            {personName}
          </div>
          {(birthYear || deathYear) && (
            <div className="text-white/50 text-sm mt-0.5">
              {birthYear && deathYear
                ? `${birthYear}\u2013${deathYear}`
                : birthYear
                  ? `b. ${birthYear}`
                  : `d. ${deathYear}`}
            </div>
          )}
          <div className="text-white/40 text-xs mt-1">
            {locationCount} location{locationCount !== 1 ? 's' : ''}
            {' \u00b7 '}
            {arcCount} migration{arcCount !== 1 ? 's' : ''}
          </div>
        </div>
        <button
          onClick={onClear}
          className="text-white/30 hover:text-white p-1 rounded transition-colors flex-shrink-0"
          title="Clear highlight"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="mt-3 flex gap-2">
        <a
          href={`/globe?journey=${highlightPersonId}`}
          className="flex-1 text-center bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium py-1.5 px-3 rounded-lg transition-colors"
        >
          View Journey
        </a>
        <a
          href={`/person/${highlightPersonId}`}
          className="flex-1 text-center bg-white/10 hover:bg-white/15 border border-white/10 text-white text-xs font-medium py-1.5 px-3 rounded-lg transition-colors"
        >
          View Profile
        </a>
      </div>
    </div>
  );
}
