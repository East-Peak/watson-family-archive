'use client';

import type { FilteredLocation, Person } from '../types';

interface LocationPanelProps {
  location: FilteredLocation;
  selectedPersonId: string | null;
  onPersonClick: (person: Person) => void;
  onClose: () => void;
}

export default function LocationPanel({
  location,
  selectedPersonId,
  onPersonClick,
  onClose,
}: LocationPanelProps) {
  const peopleHeading =
    location.visiblePeopleCount === 1 ? 'Person In View' : 'People In View';

  return (
    <div className="absolute top-6 left-4 right-4 bottom-28 bg-[#0f172a]/80 backdrop-blur-xl border border-white/10 rounded-3xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.5)] z-20 flex flex-col sm:left-auto sm:right-6 sm:bottom-6 sm:w-[380px]">
      {/* Header */}
      <div className="bg-[#1e293b]/50 border-b border-white/10 p-4 z-10 shrink-0 sm:p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-serif font-bold text-white tracking-tight sm:text-2xl">
              {location.name}
            </h2>
            <p className="text-blue-200/80 text-sm mt-1 font-medium">
              {location.country}
              {location.state && ` \u2022 ${location.state}`}
            </p>
            {location.isApproximate && (
              <p className="text-amber-400/70 text-xs mt-1 font-medium">
                Approximate location ({location.precision})
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-white/50 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors"
          >
            <svg
              className="w-5 h-5"
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
      </div>

      {/* People List */}
      <div className="p-4 overflow-y-auto flex-1 custom-scrollbar sm:p-6">
        <h3 className="text-xs font-bold text-white/50 uppercase tracking-widest mb-4">
          {peopleHeading} ({location.visiblePeopleCount})
          {location.visiblePeopleCount < location.people.length && (
            <span className="text-white/30 font-normal">
              {' '}
              of {location.people.length}
            </span>
          )}
        </h3>
        <div className="space-y-3">
          {location.visiblePeople.map((person, idx) => (
            <button
              key={`${person.id}-${idx}`}
              onClick={() => onPersonClick(person)}
              className={`w-full text-left p-4 rounded-2xl transition-all border ${
                selectedPersonId === person.id
                  ? 'bg-blue-600/20 border-blue-500/50 text-white shadow-[0_0_15px_rgba(59,130,246,0.2)]'
                  : 'bg-white/5 border-white/5 hover:bg-white/10 text-white hover:border-white/20'
              }`}
            >
              <div className="font-serif font-bold text-lg">{person.name}</div>
              <div className="text-sm font-medium text-white/60 mt-1">
                {person.birth && person.death
                  ? `${person.birth} - ${person.death}`
                  : person.birth
                    ? `b. ${person.birth}`
                    : person.death
                      ? `d. ${person.death}`
                      : 'Dates unknown'}
              </div>
            </button>
          ))}
        </div>

        {/* Selected Person Link */}
        {selectedPersonId && (
          <div className="mt-8">
            <a
              href={`/person/${selectedPersonId}`}
              className="block w-full text-center bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 px-4 rounded-xl transition-all hover:shadow-[0_0_20px_rgba(59,130,246,0.4)]"
            >
              View Full Profile &rarr;
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
