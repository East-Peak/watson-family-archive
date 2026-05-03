'use client';

import type { ExplorerViewMode } from '../types';

interface MobileExplorerSummaryBarProps {
  viewMode: ExplorerViewMode;
  resultCount: number;
  resultLabel: string;
  activeSummary: string;
  onViewModeChange: (mode: ExplorerViewMode) => void;
  onOpenFilters: () => void;
}

export default function MobileExplorerSummaryBar({
  viewMode,
  resultCount,
  resultLabel,
  activeSummary,
  onViewModeChange,
  onOpenFilters,
}: MobileExplorerSummaryBarProps) {
  return (
    <div
      data-testid="mobile-explorer-summary-bar"
      className="sticky top-0 z-30 border-b border-shield/10 bg-white/92 px-4 py-3 shadow-sm backdrop-blur-md md:hidden"
    >
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center rounded-full border border-shield/10 bg-shield/5 p-1">
          <button
            type="button"
            onClick={() => onViewModeChange('people')}
            aria-pressed={viewMode === 'people'}
            className={`min-h-10 flex-1 rounded-full px-3 py-2 text-sm font-semibold transition-colors ${
              viewMode === 'people'
                ? 'bg-white text-shield shadow-sm'
                : 'text-shield/55'
            }`}
          >
            People
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange('records')}
            aria-pressed={viewMode === 'records'}
            className={`min-h-10 flex-1 rounded-full px-3 py-2 text-sm font-semibold transition-colors ${
              viewMode === 'records'
                ? 'bg-white text-shield shadow-sm'
                : 'text-shield/55'
            }`}
          >
            Records
          </button>
        </div>

        <button
          type="button"
          onClick={onOpenFilters}
          className="flex min-h-11 shrink-0 items-center justify-center rounded-full border border-shield/15 bg-shield/5 px-4 py-2 text-sm font-semibold text-shield transition-colors hover:bg-shield/10"
        >
          Filters
        </button>
      </div>

      <div className="mt-2 min-w-0">
        <p className="text-sm font-medium text-shield">
          Showing {resultCount} {resultLabel}
        </p>
        <p className="mt-1 truncate text-xs text-slate-500">{activeSummary}</p>
      </div>
    </div>
  );
}
