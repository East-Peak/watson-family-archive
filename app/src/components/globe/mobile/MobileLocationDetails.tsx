'use client';

import type { FilteredLocation, Person } from '../types';

interface MobileLocationDetailsProps {
  location: FilteredLocation;
  onPersonHighlight: (person: Person) => void;
}

export default function MobileLocationDetails({
  location,
  onPersonHighlight,
}: MobileLocationDetailsProps) {
  return (
    <div className="space-y-4" data-testid="mobile-location-details">
      <div>
        <h2 className="font-serif text-xl font-bold text-white">{location.name}</h2>
        <p className="mt-1 text-sm text-white/65">
          {location.country}
          {location.state ? ` · ${location.state}` : ''}
        </p>
        {location.isApproximate && (
          <p className="mt-1 text-xs font-medium text-amber-300/80">
            Approximate location ({location.precision})
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/70">
        {location.visiblePeopleCount} visible {location.visiblePeopleCount === 1 ? 'person' : 'people'}
        {location.visiblePeopleCount < location.people.length && (
          <span className="text-white/40"> of {location.people.length} total</span>
        )}
      </div>

      <div className="space-y-2">
        {location.visiblePeople.map((person, idx) => (
          <button
            key={`${person.id}-${idx}`}
            type="button"
            onClick={() => onPersonHighlight(person)}
            className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left transition-colors hover:bg-white/[0.08]"
          >
            <div>
              <div className="font-semibold text-white">{person.name}</div>
              <div className="mt-1 text-xs text-white/50">
                {person.birth && person.death
                  ? `${person.birth}–${person.death}`
                  : person.birth
                    ? `b. ${person.birth}`
                    : person.death
                      ? `d. ${person.death}`
                      : 'Dates unknown'}
              </div>
            </div>
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-300">
              Highlight
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
