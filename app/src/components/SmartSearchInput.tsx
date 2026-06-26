'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useChat } from '@/components/ChatProvider';
import { useKeyboardNav } from '@/hooks/useKeyboardNav';

interface Person {
  id: string;
  fullName: string;
  nickname?: string;
  birthYear?: number;
  deathYear?: number;
  birthPlace?: string;
  sourceCount?: number;
}

interface SearchRecord {
  id: string;
  ark: string | null;
  type: string;
  collection: string;
  year: number | null;
  place: string | null;
  tier: string | null;
  matchedParticipant: string | null;
  participantCount: number;
  linkedPersonCount: number;
}

const RECORD_TYPE_COLORS: Record<string, string> = {
  census: 'bg-blue-50 text-blue-700 border-blue-200',
  death: 'bg-gray-100 text-gray-600 border-gray-200',
  birth: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  marriage: 'bg-pink-50 text-pink-700 border-pink-200',
  military: 'bg-amber-50 text-amber-700 border-amber-200',
  burial: 'bg-stone-100 text-stone-600 border-stone-200',
};

interface SmartSearchInputProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SmartSearchInput({
  isOpen,
  onClose,
}: SmartSearchInputProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Person[]>([]);
  const [records, setRecords] = useState<SearchRecord[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const resultRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const router = useRouter();
  const { openSidebar, askAI } = useChat();

  const handleSelectIndex = useCallback(
    (index: number) => {
      if (index < results.length) {
        onClose();
        router.push(`/person/${results[index].id}`);
      } else {
        const recordIndex = index - results.length;
        const displayedRecords = records.slice(0, 5);
        if (recordIndex < displayedRecords.length) {
          onClose();
          router.push(`/explorer?view=records&rq=${encodeURIComponent(query)}`);
        }
      }
    },
    [results, records, query, onClose, router],
  );

  const { activeIndex, handleKeyDown } = useKeyboardNav({
    itemCount: results.length + Math.min(records.length, 5),
    onSelect: handleSelectIndex,
    onEscape: onClose,
    isOpen,
    loop: true,
  });

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex >= 0 && resultRefs.current[activeIndex]) {
      resultRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  // Trim stale refs when result count shrinks
  const totalItems = results.length + Math.min(records.length, 5);
  useEffect(() => {
    resultRefs.current = resultRefs.current.slice(0, totalItems);
  }, [totalItems]);

  // Get total count on mount (for empty state display)
  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch('/api/stats');
        if (res.ok) {
          const data = await res.json();
          setTotalCount(data.totalPeople || 0);
        }
      } catch {
        // Silently fail - not critical
      }
    }
    fetchStats();
  }, []);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
    if (!isOpen) {
      setQuery('');
      setResults([]);
      setRecords([]);
    }
  }, [isOpen]);

  // Debounced search via API
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setRecords([]);
      return;
    }

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(query)}&limit=8`,
        );
        if (res.ok) {
          const data = await res.json();
          setResults(data.results || []);
          setRecords(data.records || []);
        }
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        setSearching(false);
      }
    }, 200);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [query]);

  const handleSelect = (personId: string) => {
    onClose();
    router.push(`/person/${personId}`);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // activeIndex >= 0 means a list item is highlighted — let the hook's Enter handler fire.
    // When nothing is highlighted, fall back to selecting the first person result.
    if (activeIndex < 0 && results.length > 0) {
      handleSelect(results[0].id);
    }
  };

  const handleAskAI = () => {
    const trimmed = query.trim();
    if (trimmed) {
      askAI(trimmed);
    } else {
      openSidebar();
    }
    onClose();
  };

  if (!isOpen) return null;

  const hasResults = results.length > 0 || records.length > 0;
  const hasQuery = query.trim().length > 0;
  const noResults = hasQuery && !searching && !hasResults;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl mx-4 bg-shield rounded-2xl shadow-2xl border border-white/10 overflow-hidden">
        {/* Search Input */}
        <form onSubmit={handleSubmit} className="p-4">
          <div className="relative">
            <svg
              className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search for a person or record..."
              className="w-full pl-12 pr-20 py-4 bg-white/5 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-oak focus:ring-1 focus:ring-oak text-lg"
              role="combobox"
              aria-expanded={results.length > 0 || records.length > 0}
              aria-controls="smart-search-results-listbox"
              aria-activedescendant={
                activeIndex >= 0
                  ? `smart-search-result-${activeIndex}`
                  : undefined
              }
              aria-autocomplete="list"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
              <kbd className="px-2 py-1 bg-white/10 rounded text-white/50 text-xs">
                {navigator?.platform?.includes('Mac') ? '⌘' : 'Ctrl'}+K
              </kbd>
            </div>
          </div>
        </form>

        {/* Results Area */}
        <div className="max-h-[60vh] overflow-y-auto">
          {searching ? (
            <div className="px-6 py-8 text-center text-white/50">
              Searching...
            </div>
          ) : hasResults ? (
            // Person Results + Record Results
            <div
              className="px-3 pb-3"
              role="listbox"
              id="smart-search-results-listbox"
            >
              {results.length > 0 && (
                <>
                  <div className="px-3 py-2 text-xs text-white/40 uppercase tracking-wide">
                    People ({results.length})
                  </div>
                  {results.map((person, i) => (
                    <button
                      key={person.id}
                      ref={(el) => {
                        resultRefs.current[i] = el;
                      }}
                      onClick={() => handleSelect(person.id)}
                      role="option"
                      id={`smart-search-result-${i}`}
                      aria-selected={i === activeIndex}
                      className={`w-full flex items-center gap-4 p-3 rounded-xl hover:bg-white/10 transition-colors text-left group${i === activeIndex ? ' bg-shield/10 ring-1 ring-shield/20' : ''}`}
                    >
                      <div className="w-10 h-10 rounded-full bg-shield flex items-center justify-center text-white font-bold flex-shrink-0">
                        {person.fullName[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-white font-medium group-hover:text-oak-light transition-colors truncate">
                          {person.fullName}
                        </div>
                        <div className="text-white/50 text-sm">
                          {person.birthYear && person.deathYear
                            ? `${person.birthYear} – ${person.deathYear}`
                            : person.birthYear
                              ? `b. ${person.birthYear}`
                              : 'Dates unknown'}
                          {person.birthPlace && (
                            <span className="ml-2 text-white/40">
                              • {person.birthPlace.split(',')[0]}
                            </span>
                          )}
                          {person.sourceCount != null &&
                            person.sourceCount > 0 && (
                              <span className="ml-2 text-white/40">
                                • {person.sourceCount} source
                                {person.sourceCount !== 1 ? 's' : ''}
                              </span>
                            )}
                        </div>
                      </div>
                      <svg
                        className="w-5 h-5 text-white/40 group-hover:text-oak-light transition-colors flex-shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </button>
                  ))}
                </>
              )}
              {records.length > 0 && (
                <div
                  className={
                    results.length > 0
                      ? 'border-t border-white/10 mt-2 pt-2'
                      : ''
                  }
                >
                  <div className="px-3 py-2 text-xs text-white/40 uppercase tracking-wide">
                    Records ({records.length})
                  </div>
                  {records.slice(0, 5).map((record, j) => {
                    const typeKey = record.type?.toLowerCase() ?? '';
                    const colorClass =
                      RECORD_TYPE_COLORS[typeKey] ??
                      'bg-white/10 text-white/60 border-white/20';
                    const combinedIndex = results.length + j;
                    return (
                      <button
                        key={record.id}
                        ref={(el) => {
                          resultRefs.current[combinedIndex] = el;
                        }}
                        onClick={() => {
                          onClose();
                          router.push(
                            `/explorer?view=records&rq=${encodeURIComponent(query)}`,
                          );
                        }}
                        role="option"
                        id={`smart-search-result-${combinedIndex}`}
                        aria-selected={combinedIndex === activeIndex}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/10 transition-colors text-left group${combinedIndex === activeIndex ? ' bg-shield/10 ring-1 ring-shield/20' : ''}`}
                      >
                        <span
                          className={`px-2 py-0.5 text-xs font-medium border rounded capitalize flex-shrink-0 ${colorClass}`}
                        >
                          {record.type}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-white/80 text-sm truncate group-hover:text-white transition-colors">
                            {record.year && (
                              <span className="text-white/50 mr-1.5">
                                {record.year}
                              </span>
                            )}
                            {record.collection}
                          </div>
                          {record.matchedParticipant && (
                            <div className="text-white/40 text-xs truncate">
                              {record.matchedParticipant}
                            </div>
                          )}
                        </div>
                        <svg
                          className="w-4 h-4 text-white/30 group-hover:text-white/60 transition-colors flex-shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      </button>
                    );
                  })}
                  {records.length > 5 && (
                    <button
                      onClick={() => {
                        onClose();
                        router.push(
                          `/explorer?view=records&rq=${encodeURIComponent(query)}`,
                        );
                      }}
                      className="w-full px-3 py-2 text-xs text-white/40 hover:text-oak-light transition-colors text-left"
                    >
                      View all {records.length} records in Explorer →
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : noResults ? (
            // No results — offer AI sidebar
            <div className="px-6 py-6 text-center">
              <p className="text-white/50 mb-4">
                No results found for &quot;{query}&quot;
              </p>
              <button
                onClick={handleAskAI}
                className="px-4 py-2 bg-oak hover:bg-oak-light text-white rounded-lg text-sm font-medium transition-colors"
              >
                Ask the AI Assistant →
              </button>
            </div>
          ) : (
            // Empty state
            <div className="px-6 py-6 text-center text-white/50">
              <p className="mb-2">
                Search{' '}
                {totalCount > 0
                  ? `${totalCount} family members`
                  : 'family members'}
              </p>
              <p className="text-sm text-white/40">Type a name to search</p>
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-6 py-3 border-t border-white/10 flex items-center justify-between">
          <span className="text-white/40 text-xs">
            Press{' '}
            <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-white/50">
              Esc
            </kbd>{' '}
            to close
          </span>
          <span className="text-white/40 text-xs">
            <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-white/50">
              Enter
            </kbd>{' '}
            to select
          </span>
        </div>
      </div>
    </div>
  );
}
