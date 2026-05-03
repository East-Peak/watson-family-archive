'use client';

import type { ExplorerViewState } from './types';

interface ExplorerHeaderProps {
  totalCount: number;
  filteredCount: number;
  viewState: ExplorerViewState;
  onStateChange: (partial: Partial<ExplorerViewState>) => void;
  onReset: () => void;
}

export default function ExplorerHeader({
  totalCount,
  filteredCount,
  viewState,
  onStateChange,
  onReset,
}: ExplorerHeaderProps) {
  const isFiltered = filteredCount < totalCount;
  const { viewMode } = viewState;

  // Build the list of active filter chips
  const chips: Array<{ label: string; onRemove: () => void }> = [];

  if (viewMode === 'people') {
    // Query filter
    if (viewState.query) {
      chips.push({
        label: `Search: ${viewState.query}`,
        onRemove: () => onStateChange({ query: '' }),
      });
    }

    // Centuries
    viewState.centuries.forEach((century) => {
      chips.push({
        label: century,
        onRemove: () =>
          onStateChange({
            centuries: viewState.centuries.filter((c) => c !== century),
          }),
      });
    });

    // Countries
    viewState.countries.forEach((country) => {
      chips.push({
        label: country,
        onRemove: () =>
          onStateChange({
            countries: viewState.countries.filter((c) => c !== country),
          }),
      });
    });

    // Sex
    if (viewState.sex) {
      chips.push({
        label: viewState.sex,
        onRemove: () => onStateChange({ sex: '' }),
      });
    }

    // Statuses (replace underscores with spaces)
    viewState.statuses.forEach((status) => {
      chips.push({
        label: status.replace(/_/g, ' '),
        onRemove: () =>
          onStateChange({
            statuses: viewState.statuses.filter((s) => s !== status),
          }),
      });
    });

    // Completeness range (only if not default 0-100)
    if (viewState.completenessMin > 0 || viewState.completenessMax < 100) {
      chips.push({
        label: `Completeness: ${viewState.completenessMin}–${viewState.completenessMax}%`,
        onRemove: () =>
          onStateChange({
            completenessMin: 0,
            completenessMax: 100,
          }),
      });
    }

    // Validation
    if (viewState.validation) {
      chips.push({
        label: viewState.validation,
        onRemove: () => onStateChange({ validation: '' }),
      });
    }

    // Has sources
    if (viewState.hasSources) {
      chips.push({
        label: viewState.hasSources,
        onRemove: () => onStateChange({ hasSources: '' }),
      });
    }

    // Branch
    if (viewState.branch) {
      chips.push({
        label: viewState.branch,
        onRemove: () => onStateChange({ branch: '' }),
      });
    }
  } else {
    // Records mode chips

    // Record query
    if (viewState.recordQuery) {
      chips.push({
        label: `Search: ${viewState.recordQuery}`,
        onRemove: () => onStateChange({ recordQuery: '' }),
      });
    }

    // Record types
    viewState.recordTypes.forEach((type) => {
      chips.push({
        label: type,
        onRemove: () =>
          onStateChange({
            recordTypes: viewState.recordTypes.filter((t) => t !== type),
          }),
      });
    });

    // Tiers
    viewState.tiers.forEach((tier) => {
      chips.push({
        label: `Tier ${tier}`,
        onRemove: () =>
          onStateChange({
            tiers: viewState.tiers.filter((t) => t !== tier),
          }),
      });
    });

    // Year range (only if not default 0/9999)
    if (viewState.yearMin > 0 || viewState.yearMax < 9999) {
      chips.push({
        label: `Year: ${viewState.yearMin || '...'}–${viewState.yearMax < 9999 ? viewState.yearMax : '...'}`,
        onRemove: () =>
          onStateChange({
            yearMin: 0,
            yearMax: 9999,
          }),
      });
    }

    // Collection search
    if (viewState.collectionSearch) {
      chips.push({
        label: `Collection: ${viewState.collectionSearch}`,
        onRemove: () => onStateChange({ collectionSearch: '' }),
      });
    }

    // Participant search
    if (viewState.participantSearch) {
      chips.push({
        label: `Participant: ${viewState.participantSearch}`,
        onRemove: () => onStateChange({ participantSearch: '' }),
      });
    }
  }

  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b border-amber-900/10 bg-parchment flex-shrink-0">
      {/* View mode toggle */}
      <div className="bg-amber-100/60 rounded-lg p-0.5 flex">
        <button
          className={viewMode === 'people' ? 'bg-white shadow-sm text-shield font-medium px-3 py-1 rounded-md text-sm transition-all' : 'px-3 py-1 text-shield/50 hover:text-shield/70 text-sm transition-colors rounded-md'}
          onClick={() => onStateChange({ viewMode: 'people' })}
        >People</button>
        <button
          className={viewMode === 'records' ? 'bg-white shadow-sm text-shield font-medium px-3 py-1 rounded-md text-sm transition-all' : 'px-3 py-1 text-shield/50 hover:text-shield/70 text-sm transition-colors rounded-md'}
          onClick={() => onStateChange({ viewMode: 'records' })}
        >Records</button>
      </div>

      <div className="whitespace-nowrap text-sm text-shield/60">
        Showing{' '}
        <span className="text-shield font-medium">{filteredCount}</span>
        {isFiltered && (
          <>
            {' '}
            of <span className="text-shield font-medium">{totalCount}</span>
          </>
        )}{' '}
        {viewMode === 'people' ? 'people' : 'records'}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {chips.map((chip, idx) => (
          <div
            key={idx}
            className="bg-indigo-50 border border-indigo-200 text-xs text-indigo-700 rounded-full px-2 py-0.5 flex items-center gap-1 whitespace-nowrap"
          >
            {chip.label}
            <button
              onClick={chip.onRemove}
              className="ml-1 hover:text-indigo-900 transition-colors"
              aria-label={`Remove ${chip.label} filter`}
            >
              &times;
            </button>
          </div>
        ))}
      </div>

      {chips.length > 0 && (
        <button
          onClick={onReset}
          className="ml-auto text-xs text-shield/40 hover:text-shield transition-colors whitespace-nowrap"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
