'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GlobeData, Person } from './types';

interface PersonSearchProps {
  globeData: GlobeData | null;
  highlightPerson: string | null;
  onSelect: (personId: string) => void;
  onClear: () => void;
}

/** A unique person entry for the autocomplete list. */
interface PersonEntry {
  id: string;
  name: string;
  birth: number | null;
  death: number | null;
}

/**
 * Search input with autocomplete dropdown for finding people in the globe data.
 * Sources from already-loaded globe data (people across all locations).
 * Debounced input (200ms).
 */
export default function PersonSearch({
  globeData,
  highlightPerson,
  onSelect,
  onClear,
}: PersonSearchProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Deduplicated list of all people from globe data
  const allPeople = useMemo((): PersonEntry[] => {
    if (!globeData) return [];
    const seen = new Map<string, PersonEntry>();
    for (const location of globeData.locations) {
      for (const person of location.people) {
        if (!seen.has(person.id)) {
          seen.set(person.id, {
            id: person.id,
            name: person.name,
            birth: person.birth,
            death: person.death,
          });
        }
      }
    }
    // Sort by name
    return Array.from(seen.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [globeData]);

  // Debounce input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  // Filter people by debounced query
  const results = useMemo((): PersonEntry[] => {
    if (!debouncedQuery || debouncedQuery.length < 2) return [];
    const lower = debouncedQuery.toLowerCase();
    return allPeople
      .filter((p) => p.name.toLowerCase().includes(lower))
      .slice(0, 12); // limit results
  }, [allPeople, debouncedQuery]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // When a person is highlighted externally, update the display
  const selectedPerson = useMemo(() => {
    if (!highlightPerson) return null;
    return allPeople.find((p) => p.id === highlightPerson) || null;
  }, [highlightPerson, allPeople]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setQuery(e.target.value);
      setIsOpen(true);
    },
    [],
  );

  const handleSelect = useCallback(
    (person: PersonEntry) => {
      setQuery('');
      setIsOpen(false);
      onSelect(person.id);
    },
    [onSelect],
  );

  const handleClear = useCallback(() => {
    setQuery('');
    setDebouncedQuery('');
    setIsOpen(false);
    onClear();
  }, [onClear]);

  const handleFocus = useCallback(() => {
    if (query.length >= 2) {
      setIsOpen(true);
    }
  }, [query]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  }, []);

  const formatLifespan = (person: PersonEntry): string => {
    if (person.birth && person.death)
      return `${person.birth}\u2013${person.death}`;
    if (person.birth) return `b. ${person.birth}`;
    if (person.death) return `d. ${person.death}`;
    return '';
  };

  return (
    <div className="relative">
      <label className="text-xs text-white/50 uppercase tracking-wider font-semibold">
        Search Person
      </label>

      {/* When a person is selected, show their name with a clear button */}
      {selectedPerson && !isOpen ? (
        <div className="mt-1.5 flex items-center gap-2">
          <div className="flex-1 bg-indigo-500/20 border border-indigo-500/40 rounded-lg px-2.5 py-1.5 text-sm text-white truncate">
            {selectedPerson.name}
            {selectedPerson.birth || selectedPerson.death ? (
              <span className="text-white/50 ml-1.5">
                ({formatLifespan(selectedPerson)})
              </span>
            ) : null}
          </div>
          <button
            onClick={handleClear}
            className="text-white/40 hover:text-white p-1 rounded transition-colors flex-shrink-0"
            title="Clear selection"
          >
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      ) : (
        <div className="mt-1.5 relative">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleInputChange}
            onFocus={handleFocus}
            onKeyDown={handleKeyDown}
            placeholder="Type a name..."
            className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 transition-colors"
          />
          {query && (
            <button
              onClick={() => {
                setQuery('');
                setDebouncedQuery('');
                inputRef.current?.focus();
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
            >
              <svg
                className="w-3.5 h-3.5"
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
          )}
        </div>
      )}

      {/* Autocomplete dropdown */}
      {isOpen && results.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute left-0 right-0 mt-1 bg-black/95 backdrop-blur-md border border-white/15 rounded-lg shadow-2xl z-50 max-h-60 overflow-y-auto custom-scrollbar"
        >
          {results.map((person) => (
            <button
              key={person.id}
              onClick={() => handleSelect(person)}
              className="w-full text-left px-3 py-2 hover:bg-white/10 transition-colors border-b border-white/5 last:border-b-0"
            >
              <div className="text-sm text-white font-medium truncate">
                {person.name}
              </div>
              {(person.birth || person.death) && (
                <div className="text-xs text-white/40 mt-0.5">
                  {formatLifespan(person)}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* No results message */}
      {isOpen && debouncedQuery.length >= 2 && results.length === 0 && (
        <div
          ref={dropdownRef}
          className="absolute left-0 right-0 mt-1 bg-black/95 backdrop-blur-md border border-white/15 rounded-lg shadow-2xl z-50 px-3 py-2"
        >
          <div className="text-sm text-white/40">No matches found</div>
        </div>
      )}
    </div>
  );
}
