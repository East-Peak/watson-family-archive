'use client';

interface MobileHighlightDetailsProps {
  personName: string | null;
  birthYear: number | null;
  deathYear: number | null;
  locationCount: number;
  arcCount: number;
  highlightPersonId: string;
  onClear: () => void;
}

export default function MobileHighlightDetails({
  personName,
  birthYear,
  deathYear,
  locationCount,
  arcCount,
  highlightPersonId,
  onClear,
}: MobileHighlightDetailsProps) {
  const isResolved = personName !== null;

  return (
    <div className="space-y-4" data-testid="mobile-highlight-details">
      <div>
        <h2 className="font-serif text-xl font-bold text-white">
          {personName ?? 'Highlighted person unavailable'}
        </h2>
        {isResolved && (birthYear || deathYear) && (
          <p className="mt-1 text-sm text-white/55">
            {birthYear && deathYear
              ? `${birthYear}–${deathYear}`
              : birthYear
                ? `b. ${birthYear}`
                : `d. ${deathYear}`}
          </p>
        )}
        {!isResolved && (
          <p className="mt-2 text-sm leading-6 text-white/60">
            This highlighted person is not visible in the current globe data. Clear the highlight
            or adjust your filters to continue.
          </p>
        )}
      </div>

      {isResolved && (
        <>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/70">
            {locationCount} location{locationCount === 1 ? '' : 's'} · {arcCount} migration{arcCount === 1 ? '' : 's'}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <a
              href={`/globe?journey=${highlightPersonId}`}
              className="rounded-2xl bg-indigo-600 px-4 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
            >
              View Journey
            </a>
            <a
              href={`/person/${highlightPersonId}`}
              className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-white/[0.08]"
            >
              View Profile
            </a>
          </div>
        </>
      )}

      <button
        type="button"
        onClick={onClear}
        className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white/75 transition-colors hover:bg-white/[0.08] hover:text-white"
      >
        Clear Highlight
      </button>
    </div>
  );
}
