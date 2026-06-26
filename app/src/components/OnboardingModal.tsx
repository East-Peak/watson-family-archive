'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useMe, MePerson } from '@/components/MeProvider';
import { useKeyboardNav } from '@/hooks/useKeyboardNav';

interface SearchResult {
  id: string;
  fullName: string;
  birthYear?: number;
  deathYear?: number;
  surname?: string;
}

export default function OnboardingModal() {
  const { me, setMe, onboardingOpen, setOnboardingOpen, authIdentity } =
    useMe();
  const [dismissed, setDismissed] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Check if user already dismissed the modal this session
  useEffect(() => {
    try {
      if (sessionStorage.getItem('onboarding-dismissed')) {
        setDismissed(true);
      }
    } catch {
      // sessionStorage not available
    }
  }, []);

  // Reset search state when modal opens via "Change" trigger
  useEffect(() => {
    if (onboardingOpen) {
      setQuery('');
      setResults([]);
    }
  }, [onboardingOpen]);

  // Show if explicitly opened (via "Change" in ViewerBadge) or first visit
  const isVisible = onboardingOpen || (!me && !dismissed);

  const handleSelect = useCallback(
    (person: SearchResult) => {
      const mePerson: MePerson = {
        id: person.id,
        name: person.fullName,
        familyBranch: person.surname?.toLowerCase(),
      };
      setMe(mePerson);
      setOnboardingOpen(false);
    },
    [setMe, setOnboardingOpen],
  );

  const onKeyboardSelect = useCallback(
    (index: number) => {
      if (results[index]) handleSelect(results[index]);
    },
    [results, handleSelect],
  );

  const { activeIndex, handleKeyDown } = useKeyboardNav({
    itemCount: results.length,
    onSelect: onKeyboardSelect,
    isOpen: isVisible,
  });

  // Scroll active result into view
  useEffect(() => {
    if (activeIndex >= 0 && resultRefs.current[activeIndex]) {
      resultRefs.current[activeIndex]!.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  // Trim stale refs when result count shrinks
  useEffect(() => {
    resultRefs.current = resultRefs.current.slice(0, results.length);
  }, [results.length]);

  if (!isVisible) return null;

  const handleSearch = (value: string) => {
    setQuery(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);

    if (value.length < 2) {
      setResults([]);
      return;
    }

    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(value)}&limit=8`,
        );
        if (res.ok) {
          const data = await res.json();
          setResults(data.results || []);
        }
      } catch {
        // silent fail
      }
      setSearching(false);
    }, 300);
  };

  const handleSkip = () => {
    setDismissed(true);
    setOnboardingOpen(false);
    try {
      sessionStorage.setItem('onboarding-dismissed', '1');
    } catch {
      // sessionStorage not available
    }
  };

  const handleNotInTree = () => {
    setMe({
      id: null,
      name: authIdentity?.email || 'Browsing',
    });
    setOnboardingOpen(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <h2 className="font-serif text-2xl text-shield mb-2">Welcome</h2>
        <p className="text-gray-600 text-sm mb-6">
          Find yourself in the family tree to personalize your experience.
        </p>

        {/* Search input */}
        <div className="relative mb-4">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search by name..."
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-shield focus:outline-none focus:ring-1 focus:ring-shield"
            autoFocus
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls="onboarding-results-listbox"
            aria-activedescendant={
              activeIndex >= 0 ? `onboarding-result-${activeIndex}` : undefined
            }
            aria-autocomplete="list"
          />
          {searching && (
            <div className="absolute right-3 top-3.5">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-shield/30 border-t-shield" />
            </div>
          )}
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div
            className="mb-4 max-h-64 overflow-y-auto rounded-lg border border-gray-200"
            role="listbox"
            id="onboarding-results-listbox"
          >
            {results.map((person, index) => (
              <button
                key={person.id}
                ref={(el) => {
                  resultRefs.current[index] = el;
                }}
                onClick={() => handleSelect(person)}
                role="option"
                id={`onboarding-result-${index}`}
                aria-selected={index === activeIndex}
                className={`w-full px-4 py-3 text-left transition-colors border-b border-gray-100 last:border-0 ${
                  index === activeIndex
                    ? 'bg-shield/10 ring-1 ring-inset ring-shield/20'
                    : 'hover:bg-shield/5'
                }`}
              >
                <div className="font-medium text-gray-900 text-sm">
                  {person.fullName}
                </div>
                <div className="text-xs text-gray-500">
                  {[person.birthYear, person.deathYear]
                    .filter(Boolean)
                    .join(' - ')}
                </div>
              </button>
            ))}
          </div>
        )}

        {query.length >= 2 && results.length === 0 && !searching && (
          <p className="text-gray-500 text-xs mb-4">
            No results found. Try a different name.
          </p>
        )}

        {/* Skip / not-in-tree */}
        <button
          onClick={handleSkip}
          className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Decide later
        </button>
        <button
          onClick={handleNotInTree}
          className="w-full rounded-lg border border-shield/20 px-4 py-2.5 text-sm text-shield hover:bg-shield/5 transition-colors mt-2"
        >
          I&apos;m not in the tree
        </button>
      </div>
    </div>
  );
}
