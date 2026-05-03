'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useKeyboardNav } from '@/hooks/useKeyboardNav';

interface TreeSearchResult {
  id: string;
  name: string;
  birthYear?: string;
}

interface TreeSearchProps {
  people: TreeSearchResult[];
  onSelect: (personId: string) => void;
}

export default function TreeSearch({ people, onSelect }: TreeSearchProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<TreeSearchResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (val.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    const lower = val.toLowerCase();
    const matches = people
      .filter(p => p.name.toLowerCase().includes(lower))
      .slice(0, 10);
    setResults(matches);
    setOpen(matches.length > 0);
  }, [people]);

  const handleSelect = useCallback((id: string) => {
    setQuery('');
    setResults([]);
    setOpen(false);
    onSelect(id);
  }, [onSelect]);

  const { activeIndex, handleKeyDown } = useKeyboardNav({
    itemCount: results.length,
    isOpen: open,
    onSelect: (index) => {
      if (results[index]) handleSelect(results[index].id);
    },
    onEscape: () => {
      setOpen(false);
      setResults([]);
    },
  });

  // Scroll active result into view
  useEffect(() => {
    if (activeIndex >= 0 && itemRefs.current[activeIndex]) {
      itemRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  // Trim stale refs when result count shrinks
  useEffect(() => {
    itemRefs.current = itemRefs.current.slice(0, results.length);
  }, [results.length]);

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-1.5 bg-shield/5 border border-shield/15 rounded-full px-3 py-1.5">
        <svg className="w-3.5 h-3.5 text-shield/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Find in tree..."
          className="bg-transparent text-xs text-shield placeholder:text-shield/40 focus:outline-none w-28"
          role="combobox"
          aria-expanded={open}
          aria-controls="tree-search-results-listbox"
          aria-activedescendant={activeIndex >= 0 ? `tree-search-result-${activeIndex}` : undefined}
          aria-autocomplete="list"
        />
      </div>
      {open && (
        <div className="absolute top-full mt-1 left-0 right-0 min-w-[220px] bg-white border border-shield/15 rounded-xl shadow-xl overflow-hidden z-50" role="listbox" id="tree-search-results-listbox">
          {results.map((person, index) => (
            <button
              key={person.id}
              ref={(el) => { itemRefs.current[index] = el; }}
              onClick={() => handleSelect(person.id)}
              role="option"
              id={`tree-search-result-${index}`}
              aria-selected={index === activeIndex}
              className={`w-full text-left px-3 py-2 transition-colors ${
                index === activeIndex
                  ? 'bg-shield/10'
                  : 'hover:bg-shield/5'
              }`}
            >
              <div className="text-sm font-medium text-shield">{person.name}</div>
              {person.birthYear && (
                <div className="text-xs text-shield/50">b. {person.birthYear}</div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
