'use client';

interface MobileTimelineSummaryBarProps {
  branchLabel: string;
  yearRangeLabel: string;
  eventCount: number;
  onOpenFilters: () => void;
}

export default function MobileTimelineSummaryBar({
  branchLabel,
  yearRangeLabel,
  eventCount,
  onOpenFilters,
}: MobileTimelineSummaryBarProps) {
  return (
    <div
      data-testid="mobile-timeline-summary-bar"
      className="sticky top-14 z-30 border-b border-shield/10 bg-white/92 px-4 py-3 shadow-sm backdrop-blur-md md:hidden"
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-shield/45">Timeline</p>
          <div className="mt-1 flex items-center gap-2 text-sm text-slate-600">
            <span className="truncate font-medium text-shield">{branchLabel}</span>
            <span className="text-slate-300">·</span>
            <span className="truncate">{yearRangeLabel}</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">{eventCount} events</p>
        </div>

        <button
          type="button"
          onClick={onOpenFilters}
          className="flex min-h-11 shrink-0 items-center justify-center rounded-full border border-shield/15 bg-shield/5 px-4 py-2 text-sm font-semibold text-shield transition-colors hover:bg-shield/10"
        >
          Filters
        </button>
      </div>
    </div>
  );
}
