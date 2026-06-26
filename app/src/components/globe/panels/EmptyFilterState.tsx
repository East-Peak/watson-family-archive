'use client';

import type { GlobeViewState } from '../types';

interface EmptyFilterStateProps {
  onReset: () => void;
  viewState?: Pick<
    GlobeViewState,
    'branch' | 'yearRange' | 'regions' | 'highlightPerson' | 'eventTypes'
  >;
  onClearFilter?: (partial: Partial<GlobeViewState>) => void;
}

const ALL_EVENT_TYPES = ['birth', 'death', 'marriage', 'census', 'residence'];

interface ActiveFilter {
  label: string;
  detail: string;
  clear: Partial<GlobeViewState>;
}

function describeActiveFilters(
  viewState?: EmptyFilterStateProps['viewState'],
): ActiveFilter[] {
  if (!viewState) return [];
  const filters: ActiveFilter[] = [];

  if (viewState.yearRange) {
    const [start, end] = viewState.yearRange;
    filters.push({
      label: 'Year range',
      detail: `${start}–${end}`,
      clear: { yearRange: null },
    });
  }

  if (viewState.regions && viewState.regions.length > 0) {
    filters.push({
      label: viewState.regions.length === 1 ? 'Region' : 'Regions',
      detail: viewState.regions.join(', '),
      clear: { regions: [] },
    });
  }

  if (viewState.highlightPerson) {
    filters.push({
      label: 'Highlighted person',
      detail: viewState.highlightPerson.replace(/_/g, ' '),
      clear: { highlightPerson: null },
    });
  }

  if (
    viewState.eventTypes &&
    viewState.eventTypes.length > 0 &&
    viewState.eventTypes.length < ALL_EVENT_TYPES.length
  ) {
    filters.push({
      label: viewState.eventTypes.length === 1 ? 'Event type' : 'Event types',
      detail: viewState.eventTypes.join(', '),
      clear: { eventTypes: ALL_EVENT_TYPES },
    });
  }

  return filters;
}

export default function EmptyFilterState({
  onReset,
  viewState,
  onClearFilter,
}: EmptyFilterStateProps) {
  const activeFilters = describeActiveFilters(viewState);
  const branchLabel = viewState?.branch === 'my-lines' ? 'Your Lines' : null;

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
      <div className="bg-black/80 backdrop-blur-md border border-white/10 rounded-2xl p-6 text-left pointer-events-auto max-w-sm">
        <div className="flex items-center gap-2 mb-3">
          <svg
            className="w-5 h-5 text-white/40"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <div className="text-white text-sm font-medium">
            No locations match
          </div>
        </div>

        {branchLabel && (
          <div className="text-white/50 text-xs mb-3">
            Viewing {branchLabel} only
          </div>
        )}

        {activeFilters.length > 0 ? (
          <div className="space-y-2 mb-4">
            <div className="text-white/40 text-xs uppercase tracking-wide">
              Active filters
            </div>
            {activeFilters.map((f) => (
              <div
                key={f.label}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <span className="text-white/60">{f.label}: </span>
                  <span className="text-white/90 truncate">{f.detail}</span>
                </div>
                {onClearFilter && (
                  <button
                    type="button"
                    onClick={() => onClearFilter(f.clear)}
                    className="text-xs text-indigo-300 hover:text-indigo-200 whitespace-nowrap"
                  >
                    Clear
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-white/40 text-xs mb-4">
            Try adjusting the year range, event types, or region filters.
          </div>
        )}

        <button
          onClick={onReset}
          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
        >
          Reset all filters
        </button>
      </div>
    </div>
  );
}
