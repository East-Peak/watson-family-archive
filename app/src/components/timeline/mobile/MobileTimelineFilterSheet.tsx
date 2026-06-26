'use client';

import BottomSheet from '@/components/mobile/BottomSheet';
import MobileTimelineRangeControls from './MobileTimelineRangeControls';
import type {
  TimelineBranchOption,
  TimelineDecadeOption,
  TimelineRangePreset,
  TimelineYearRange,
} from './types';

interface MobileTimelineFilterSheetProps {
  open: boolean;
  onClose: () => void;
  branches: TimelineBranchOption[];
  branch: string;
  onBranchChange: (branch: string) => void;
  yearRange: TimelineYearRange | null;
  presets: TimelineRangePreset[];
  years: number[];
  onYearRangeChange: (range: TimelineYearRange | null) => void;
  onReset: () => void;
  decades: TimelineDecadeOption[];
  selectedDecade: number | null;
  onSelectDecade: (decade: number) => void;
  branchHint?: string | null;
}

export default function MobileTimelineFilterSheet({
  open,
  onClose,
  branches,
  branch,
  onBranchChange,
  yearRange,
  presets,
  years,
  onYearRangeChange,
  onReset,
  decades,
  selectedDecade,
  onSelectDecade,
  branchHint,
}: MobileTimelineFilterSheetProps) {
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      eyebrow="Timeline"
      title="Filters"
    >
      <div className="space-y-5">
        <label className="block space-y-2 text-sm text-slate-600">
          <span className="font-medium text-slate-700">Family branch</span>
          <select
            aria-label="Family branch"
            value={branch}
            onChange={(event) => onBranchChange(event.target.value)}
            className="min-h-11 w-full rounded-2xl border border-shield/15 bg-white px-3 py-2 text-sm text-slate-700"
          >
            {branches.map((option) => (
              <option
                key={option.value}
                value={option.value}
                disabled={option.disabled}
              >
                {option.label}
              </option>
            ))}
          </select>
          {branchHint && <p className="text-xs text-slate-500">{branchHint}</p>}
        </label>

        <MobileTimelineRangeControls
          presets={presets}
          years={years}
          yearRange={yearRange}
          onYearRangeChange={onYearRangeChange}
        />

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-shield/45">
              Jump To Decade
            </h3>
            <button
              type="button"
              onClick={onReset}
              className="text-sm font-semibold text-shield transition-colors hover:text-shield/80"
            >
              Reset filters
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {decades.map(({ decade, count }) => {
              const isActive = selectedDecade === decade;
              return (
                <button
                  key={decade}
                  type="button"
                  onClick={() => onSelectDecade(decade)}
                  aria-pressed={isActive}
                  className={`min-h-10 rounded-full border px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'border-shield bg-shield text-white'
                      : 'border-shield/15 bg-white text-shield hover:bg-shield/5'
                  }`}
                >
                  {decade}s
                  <span
                    className={`ml-1 text-xs ${isActive ? 'text-white/75' : 'text-shield/55'}`}
                  >
                    ({count})
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </BottomSheet>
  );
}
