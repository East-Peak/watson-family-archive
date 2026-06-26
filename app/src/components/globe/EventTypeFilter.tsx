'use client';

import { useCallback } from 'react';

/** The 5 user-facing event filter categories. */
const EVENT_CATEGORIES = [
  { type: 'birth', label: 'Birth' },
  { type: 'death', label: 'Death' },
  { type: 'marriage', label: 'Marriage' },
  { type: 'census', label: 'Census' },
  { type: 'residence', label: 'Residence' },
] as const;

export const ALL_EVENT_TYPES = EVENT_CATEGORIES.map((c) => c.type);

interface EventTypeFilterProps {
  activeTypes: string[];
  onChange: (types: string[]) => void;
}

export default function EventTypeFilter({
  activeTypes,
  onChange,
}: EventTypeFilterProps) {
  const toggle = useCallback(
    (type: string) => {
      if (activeTypes.includes(type)) {
        // Don't allow deselecting the last one
        if (activeTypes.length === 1) return;
        onChange(activeTypes.filter((t) => t !== type));
      } else {
        onChange([...activeTypes, type]);
      }
    },
    [activeTypes, onChange],
  );

  const allActive = activeTypes.length === ALL_EVENT_TYPES.length;

  const handleAllToggle = useCallback(() => {
    if (allActive) return; // already all active
    onChange([...ALL_EVENT_TYPES]);
  }, [allActive, onChange]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-white/50 uppercase tracking-wider font-semibold">
          Event Types
        </span>
        {!allActive && (
          <button
            onClick={handleAllToggle}
            className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
          >
            Show All
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {EVENT_CATEGORIES.map(({ type, label }) => {
          const active = activeTypes.includes(type);
          return (
            <button
              key={type}
              onClick={() => toggle(type)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                active
                  ? 'bg-white/20 text-white border border-white/30'
                  : 'bg-white/5 text-white/40 border border-white/10 hover:bg-white/10 hover:text-white/60'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
