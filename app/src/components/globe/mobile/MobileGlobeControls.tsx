'use client';

import { useCallback, useMemo } from 'react';
import EventTypeFilter from '@/components/globe/EventTypeFilter';
import PersonSearch from '@/components/globe/PersonSearch';
import { FAMILY_BRANCHES, REGION_COLORS } from '@/components/globe/constants';
import { getRegionOptions } from '@/components/globe/regions';
import type {
  ArcColorMode,
  GlobeData,
  GlobeViewMode,
  GlobeViewState,
} from '@/components/globe/types';

const VIEW_MODES: {
  mode: GlobeViewMode;
  label: string;
  requiresViewer: boolean;
  description: string;
}[] = [
  {
    mode: 'pins',
    label: 'Pins',
    requiresViewer: false,
    description:
      'Individual places sized by how many people are visible in the current view.',
  },
  {
    mode: 'density',
    label: 'Density',
    requiresViewer: false,
    description:
      'Weighted bubbles that emphasize where the most in-view people cluster.',
  },
  {
    mode: 'generation',
    label: 'Generation',
    requiresViewer: true,
    description:
      'Recolors places by how many generations back each ancestor sits from the viewer.',
  },
  {
    mode: 'origins',
    label: 'Origins',
    requiresViewer: true,
    description:
      'One marker per terminal ancestor at their earliest mapped location.',
  },
];

interface MobileGlobeControlsProps {
  viewState: GlobeViewState;
  onViewStateChange: (partial: Partial<GlobeViewState>) => void;
  locationCount: number;
  arcCount: number;
  viewerSurnames?: Set<string>;
  viewerAncestryLoading?: boolean;
  viewerAncestryError?: string | null;
  globeData: GlobeData | null;
  hasActiveFilters: boolean;
  hasViewer?: boolean;
  onFitToView?: () => void;
}

export default function MobileGlobeControls({
  viewState,
  onViewStateChange,
  locationCount,
  arcCount,
  viewerSurnames,
  viewerAncestryLoading = false,
  viewerAncestryError = null,
  globeData,
  hasActiveFilters,
  hasViewer = false,
  onFitToView,
}: MobileGlobeControlsProps) {
  const selectedBranch = viewState.branch || 'all';
  const hasLoadedViewerAncestry = Boolean(
    viewerSurnames && viewerSurnames.size > 0,
  );
  const showMyLinesOption =
    hasViewer ||
    viewerAncestryLoading ||
    Boolean(viewerAncestryError) ||
    hasLoadedViewerAncestry;
  const myLinesDisabled =
    viewerAncestryLoading ||
    Boolean(viewerAncestryError) ||
    !hasLoadedViewerAncestry;
  const myLinesLabel = viewerAncestryLoading
    ? 'My Lines (loading...)'
    : viewerAncestryError
      ? 'My Lines (unavailable)'
      : 'My Lines';

  const regionOptions = useMemo(() => getRegionOptions(globeData), [globeData]);
  const activeViewMode = useMemo(
    () =>
      VIEW_MODES.find(({ mode }) => mode === viewState.viewMode) ??
      VIEW_MODES[0],
    [viewState.viewMode],
  );

  const handleBranchChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const value = event.target.value;
      onViewStateChange({ branch: value === 'all' ? '' : value });
    },
    [onViewStateChange],
  );

  const handleEventTypesChange = useCallback(
    (types: string[]) => {
      onViewStateChange({ eventTypes: types });
    },
    [onViewStateChange],
  );

  const handlePersonSelect = useCallback(
    (personId: string) => {
      onViewStateChange({ highlightPerson: personId });
    },
    [onViewStateChange],
  );

  const handleRegionClick = useCallback(
    (region: string) => {
      const current = viewState.regions;
      onViewStateChange({
        regions: current.includes(region)
          ? current.filter((candidate) => candidate !== region)
          : [...current, region],
      });
    },
    [onViewStateChange, viewState.regions],
  );

  const handleArcColorChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      onViewStateChange({ arcColorMode: event.target.value as ArcColorMode });
    },
    [onViewStateChange],
  );

  return (
    <div className="space-y-5" data-testid="mobile-globe-controls">
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
          Family Tree
        </div>
        <div className="mt-2 text-sm text-white/80">
          {locationCount} locations
        </div>
        <div className="text-sm text-white/80">{arcCount} migration paths</div>
      </section>

      <section>
        <label className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
          Filter by Family
        </label>
        <select
          value={selectedBranch}
          onChange={handleBranchChange}
          className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-400/50"
        >
          {showMyLinesOption && (
            <option value="my-lines" disabled={myLinesDisabled}>
              {myLinesLabel}
            </option>
          )}
          {Object.entries(FAMILY_BRANCHES).map(([key, { label }]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </section>

      <PersonSearch
        globeData={globeData}
        highlightPerson={viewState.highlightPerson}
        onSelect={handlePersonSelect}
        onClear={() => onViewStateChange({ highlightPerson: null })}
      />

      <EventTypeFilter
        activeTypes={viewState.eventTypes}
        onChange={handleEventTypesChange}
      />

      <section>
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
          View Mode
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {VIEW_MODES.map(({ mode, label, requiresViewer }) => {
            const isActive = viewState.viewMode === mode;
            const isDisabled = requiresViewer && !hasViewer;

            return (
              <button
                key={mode}
                type="button"
                disabled={isDisabled}
                onClick={() =>
                  !isDisabled && onViewStateChange({ viewMode: mode })
                }
                className={`rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : isDisabled
                      ? 'bg-white/[0.03] text-white/25'
                      : 'bg-white/[0.04] text-white/70 hover:bg-white/[0.08] hover:text-white'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs leading-5 text-white/60">
          {activeViewMode.description}
        </p>
        {hasActiveFilters && (
          <p className="mt-1 text-xs leading-5 text-white/40">
            {viewState.viewMode === 'density'
              ? 'Only locations inside the active filters contribute to bubble size.'
              : 'Solid pins match the active filters. Faded pins stay on the globe for context.'}
          </p>
        )}
      </section>

      <section>
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
          Layers
        </div>
        <div className="mt-2 space-y-2">
          {[
            {
              label: 'Migration arcs',
              active: viewState.showArcs,
              onToggle: () =>
                onViewStateChange({ showArcs: !viewState.showArcs }),
            },
            {
              label: 'Place labels',
              active: viewState.showLabels,
              onToggle: () =>
                onViewStateChange({ showLabels: !viewState.showLabels }),
            },
            {
              label: 'Approximate rings',
              active: viewState.showApproximate,
              onToggle: () =>
                onViewStateChange({
                  showApproximate: !viewState.showApproximate,
                }),
            },
          ].map(({ label, active, onToggle }) => (
            <button
              key={label}
              type="button"
              onClick={onToggle}
              className="flex w-full items-center justify-between rounded-xl bg-white/[0.04] px-3 py-2 text-sm text-white/75 transition-colors hover:bg-white/[0.08] hover:text-white"
            >
              <span>{label}</span>
              <span
                className={`inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  active ? 'bg-indigo-500' : 'bg-white/20'
                }`}
              >
                <span
                  className={`h-4 w-4 rounded-full bg-white transition-transform ${
                    active ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </span>
            </button>
          ))}
        </div>
        {viewState.showArcs && (
          <select
            value={viewState.arcColorMode}
            onChange={handleArcColorChange}
            className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-400/50"
          >
            <option value="default">Default (orange)</option>
            <option value="era">Color by era</option>
            <option value="family">Color by family</option>
          </select>
        )}
      </section>

      <section>
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
          Locations by Region
        </div>
        <div className="mt-2 space-y-2">
          {regionOptions.map((region) => {
            const color = REGION_COLORS[region] || REGION_COLORS.default;
            const selected = viewState.regions.includes(region);

            return (
              <button
                key={region}
                type="button"
                onClick={() => handleRegionClick(region)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors ${
                  selected
                    ? 'bg-white/[0.1] text-white ring-1 ring-indigo-400/60'
                    : 'bg-white/[0.04] text-white/70 hover:bg-white/[0.08] hover:text-white'
                }`}
              >
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: color.toCssColorString() }}
                />
                <span className="flex-1 text-sm font-medium">{region}</span>
              </button>
            );
          })}
        </div>
        {viewState.regions.length > 0 && (
          <button
            type="button"
            onClick={() => onViewStateChange({ regions: [] })}
            className="mt-2 text-xs font-semibold text-indigo-300 transition-colors hover:text-indigo-200"
          >
            Clear region filter
          </button>
        )}
      </section>

      {onFitToView && (
        <button
          type="button"
          onClick={onFitToView}
          className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white/75 transition-colors hover:bg-white/[0.08] hover:text-white"
        >
          Fit to view
        </button>
      )}
    </div>
  );
}
