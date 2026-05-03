'use client';

import type { TimelineRangePreset, TimelineYearRange } from './types';

function rangesEqual(a: TimelineYearRange | null, b: TimelineYearRange | null) {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.startYear === b.startYear &&
    a.endYear === b.endYear &&
    a.source === b.source
  );
}

interface MobileTimelineRangeControlsProps {
  presets: TimelineRangePreset[];
  years: number[];
  yearRange: TimelineYearRange | null;
  onYearRangeChange: (range: TimelineYearRange | null) => void;
}

export default function MobileTimelineRangeControls({
  presets,
  years,
  yearRange,
  onYearRangeChange,
}: MobileTimelineRangeControlsProps) {
  const defaultStartYear = yearRange?.startYear ?? years[0] ?? 0;
  const defaultEndYear = yearRange?.endYear ?? years[years.length - 1] ?? 0;

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-shield/45">Year Range</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {presets.map((preset) => {
            const isActive = rangesEqual(preset.range, yearRange);
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={isActive}
                onClick={() => onYearRangeChange(preset.range)}
                className={`min-h-10 rounded-full border px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-shield bg-shield text-white'
                    : 'border-shield/15 bg-white text-shield hover:bg-shield/5'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-2 text-sm text-slate-600">
          <span className="font-medium text-slate-700">Start year</span>
          <select
            aria-label="Start year"
            value={defaultStartYear}
            onChange={(event) => {
              const nextStartYear = Number(event.target.value);
              const nextEndYear = Math.max(nextStartYear, defaultEndYear);
              onYearRangeChange({
                startYear: nextStartYear,
                endYear: nextEndYear,
                source: 'custom',
              });
            }}
            className="min-h-11 w-full rounded-2xl border border-shield/15 bg-white px-3 py-2 text-sm text-slate-700"
          >
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2 text-sm text-slate-600">
          <span className="font-medium text-slate-700">End year</span>
          <select
            aria-label="End year"
            value={defaultEndYear}
            onChange={(event) => {
              const nextEndYear = Number(event.target.value);
              const nextStartYear = Math.min(defaultStartYear, nextEndYear);
              onYearRangeChange({
                startYear: nextStartYear,
                endYear: nextEndYear,
                source: 'custom',
              });
            }}
            className="min-h-11 w-full rounded-2xl border border-shield/15 bg-white px-3 py-2 text-sm text-slate-700"
          >
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}
