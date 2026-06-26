'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { REGION_COLORS, FAMILY_BRANCHES } from './constants';
import { getRegionOptions } from './regions';
import EventTypeFilter from './EventTypeFilter';
import PersonSearch from './PersonSearch';
import type {
  ArcColorMode,
  GlobeData,
  GlobeViewMode,
  GlobeViewState,
} from './types';

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
      'The same places, recolored by how many generations back each ancestor sits from the viewer.',
  },
  {
    mode: 'origins',
    label: 'Origins',
    requiresViewer: true,
    description:
      'One marker per terminal ancestor at their earliest mapped location.',
  },
];

interface ControlDockProps {
  viewState: GlobeViewState;
  onViewStateChange: (partial: Partial<GlobeViewState>) => void;
  locationCount: number;
  arcCount: number;
  viewerSurnames?: Set<string>;
  viewerAncestryLoading?: boolean;
  viewerAncestryError?: string | null;
  globeData: GlobeData | null;
  /** Whether any dimming filters are active (region, person, event, year). */
  hasActiveFilters: boolean;
  /** Called when the user clicks "Fit to view". */
  onFitToView?: () => void;
  /** Whether a viewer person has been identified (enables generation/origins modes). */
  hasViewer?: boolean;
  isSidebarOpen?: boolean;
  onCloseSidebar?: () => void;
}

export default function ControlDock({
  viewState,
  onViewStateChange,
  locationCount,
  arcCount,
  viewerSurnames,
  viewerAncestryLoading = false,
  viewerAncestryError = null,
  globeData,
  hasActiveFilters,
  onFitToView,
  hasViewer = false,
  isSidebarOpen,
  onCloseSidebar,
}: ControlDockProps) {
  const [collapsed, setCollapsed] = useState(isSidebarOpen ?? false);
  const [shareCopied, setShareCopied] = useState(false);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);
  const scrollBodyRef = useRef<HTMLDivElement>(null);

  // Data quality stats: approximate and missing place counts
  const dataQuality = useMemo(() => {
    if (!globeData) return { approximate: 0, missing: 0 };
    let approximate = 0;
    let missing = 0;
    for (const loc of globeData.locations) {
      if (loc.isApproximate && loc.precision !== 'exact') {
        approximate++;
      }
      if (loc.lat === 0 && loc.lng === 0) {
        missing++;
      }
    }
    return { approximate, missing };
  }, [globeData]);

  const handleShare = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch {
      // Fallback for non-HTTPS or denied permission
      setShareCopied(false);
    }
  }, []);

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
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const val = e.target.value;
      onViewStateChange({ branch: val === 'all' ? '' : val });
    },
    [onViewStateChange],
  );

  const handleEventTypesChange = useCallback(
    (types: string[]) => {
      onViewStateChange({ eventTypes: types });
    },
    [onViewStateChange],
  );

  const handleApproxToggle = useCallback(() => {
    onViewStateChange({ showApproximate: !viewState.showApproximate });
  }, [viewState.showApproximate, onViewStateChange]);

  const handleArcsToggle = useCallback(() => {
    onViewStateChange({ showArcs: !viewState.showArcs });
  }, [viewState.showArcs, onViewStateChange]);

  const handleLabelsToggle = useCallback(() => {
    onViewStateChange({ showLabels: !viewState.showLabels });
  }, [viewState.showLabels, onViewStateChange]);

  const handleArcColorChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onViewStateChange({ arcColorMode: e.target.value as ArcColorMode });
    },
    [onViewStateChange],
  );

  const handleRegionClick = useCallback(
    (region: string) => {
      const current = viewState.regions;
      if (current.includes(region)) {
        onViewStateChange({ regions: current.filter((r) => r !== region) });
      } else {
        onViewStateChange({ regions: [...current, region] });
      }
    },
    [viewState.regions, onViewStateChange],
  );

  const handlePersonSelect = useCallback(
    (personId: string) => {
      onViewStateChange({ highlightPerson: personId });
    },
    [onViewStateChange],
  );

  const handlePersonClear = useCallback(() => {
    onViewStateChange({ highlightPerson: null });
  }, [onViewStateChange]);

  const updateScrollAffordance = useCallback(() => {
    const scrollBody = scrollBodyRef.current;
    if (!scrollBody) return;

    const remainingScroll =
      scrollBody.scrollHeight - scrollBody.clientHeight - scrollBody.scrollTop;
    setCanScrollUp(scrollBody.scrollTop > 8);
    setCanScrollDown(remainingScroll > 8);
  }, []);

  const handleScrollMore = useCallback(() => {
    const scrollBody = scrollBodyRef.current;
    if (!scrollBody) return;

    scrollBody.scrollBy({
      top: Math.max(scrollBody.clientHeight * 0.65, 220),
      behavior: 'smooth',
    });
  }, []);

  useEffect(() => {
    const scrollBody = scrollBodyRef.current;
    if (!scrollBody) return;

    const update = () => updateScrollAffordance();
    update();

    scrollBody.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);

    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(scrollBody);
    if (scrollBody.firstElementChild instanceof HTMLElement) {
      resizeObserver.observe(scrollBody.firstElementChild);
    }

    return () => {
      scrollBody.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      resizeObserver.disconnect();
    };
  }, [updateScrollAffordance, globeData, viewState, hasViewer, viewerSurnames]);

  useEffect(() => {
    if (isSidebarOpen) {
      setCollapsed(true);
    }
  }, [isSidebarOpen]);

  // Collapsed rail
  if (collapsed) {
    return (
      <div className="absolute top-4 right-4 z-10">
        <button
          onClick={() => {
            setCollapsed(false);
            onCloseSidebar?.();
          }}
          className="w-10 h-10 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-black/80 transition-all shadow-xl"
          title="Open control panel"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="absolute top-4 left-4 right-4 bottom-24 z-10 flex w-auto flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/60 shadow-2xl backdrop-blur-md sm:left-auto sm:w-64">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
        <span className="text-sm font-semibold text-white tracking-wide">
          Controls
        </span>
        <button
          onClick={() => setCollapsed(true)}
          className="text-white/40 hover:text-white transition-colors"
          title="Collapse panel"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 5l7 7-7 7M5 5l7 7-7 7"
            />
          </svg>
        </button>
      </div>

      {/* Scrollable body */}
      <div className="relative flex-1 min-h-0">
        <div
          ref={scrollBodyRef}
          className="h-full overflow-y-auto pr-1 pb-14 custom-scrollbar"
        >
          <div>
            {/* Section 1: Stats */}
            <div className="px-4 py-3 border-b border-white/5">
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-xs text-white/50 uppercase tracking-wider font-semibold">
                  Family Tree
                </div>
                <button
                  onClick={handleShare}
                  className="flex items-center gap-1 text-xs text-white/40 hover:text-white/80 transition-colors"
                  title="Copy link to this view"
                >
                  {shareCopied ? (
                    <>
                      <svg
                        className="w-3.5 h-3.5 text-green-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      <span className="text-green-400">Copied!</span>
                    </>
                  ) : (
                    <>
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                        />
                      </svg>
                      <span>Share</span>
                    </>
                  )}
                </button>
              </div>
              <div className="text-white/70 text-sm">
                {locationCount} locations
                {(dataQuality.approximate > 0 || dataQuality.missing > 0) && (
                  <span className="text-white/40">
                    {' '}
                    (
                    {dataQuality.approximate > 0 &&
                      `${dataQuality.approximate} approx`}
                    {dataQuality.approximate > 0 &&
                      dataQuality.missing > 0 &&
                      ', '}
                    {dataQuality.missing > 0 &&
                      `${dataQuality.missing} missing`}
                    )
                  </span>
                )}
              </div>
              <div className="text-white/70 text-sm">
                {arcCount} migration paths
              </div>
            </div>

            {/* Section 2: Branch filter */}
            <div className="px-4 py-3 border-b border-white/5">
              <label className="text-xs text-white/50 uppercase tracking-wider font-semibold">
                Filter by Family
              </label>
              <select
                value={selectedBranch}
                onChange={handleBranchChange}
                className="mt-1.5 w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-colors"
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
              {viewState.branch === 'my-lines' && viewerAncestryLoading && (
                <p className="mt-2 text-xs text-white/45">
                  Loading your ancestor lines...
                </p>
              )}
              {viewState.branch === 'my-lines' && viewerAncestryError && (
                <p className="mt-2 text-xs text-amber-300/80">
                  Couldn&apos;t load your ancestor lines. Try changing viewer
                  and retrying.
                </p>
              )}
            </div>

            {/* Section 3: Person search */}
            <div className="px-4 py-3 border-b border-white/5">
              <PersonSearch
                globeData={globeData}
                highlightPerson={viewState.highlightPerson}
                onSelect={handlePersonSelect}
                onClear={handlePersonClear}
              />
            </div>

            {/* Section 4: Event type filter */}
            <div className="px-4 py-3 border-b border-white/5">
              <EventTypeFilter
                activeTypes={viewState.eventTypes}
                onChange={handleEventTypesChange}
              />
            </div>

            {/* Section 5: View mode selector */}
            <div className="px-4 py-3 border-b border-white/5">
              <div className="text-xs text-white/50 uppercase tracking-wider font-semibold mb-2">
                View Mode
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {VIEW_MODES.map(({ mode, label, requiresViewer }) => {
                  const isActive = viewState.viewMode === mode;
                  const isDisabled = requiresViewer && !hasViewer;

                  return (
                    <button
                      key={mode}
                      onClick={() =>
                        !isDisabled && onViewStateChange({ viewMode: mode })
                      }
                      disabled={isDisabled}
                      title={
                        isDisabled
                          ? 'Set "Who am I?" to enable this mode'
                          : `Switch to ${label} view`
                      }
                      className={`text-xs font-medium py-1.5 px-2 rounded-lg transition-all ${
                        isActive
                          ? 'bg-indigo-600 text-white shadow-[0_0_8px_rgba(99,102,241,0.35)]'
                          : isDisabled
                            ? 'bg-white/5 text-white/20 cursor-not-allowed'
                            : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/90'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 rounded-xl border border-white/8 bg-white/[0.04] px-3 py-2">
                <p className="text-[11px] leading-5 text-white/65">
                  {activeViewMode.description}
                </p>
                {hasActiveFilters && (
                  <p className="mt-1 text-[11px] leading-5 text-white/40">
                    {viewState.viewMode === 'density'
                      ? 'Only locations inside the active filters contribute to bubble size.'
                      : 'Solid pins match the active filters. Faded pins stay on the globe for context and do not open panels.'}
                  </p>
                )}
                {!hasViewer && (
                  <p className="mt-1 text-[11px] leading-5 text-white/30">
                    Set your viewer profile to unlock generation and origins
                    views.
                  </p>
                )}
              </div>
            </div>

            {/* Section 6: Layers */}
            <div className="px-4 py-3 border-b border-white/5">
              <div className="text-xs text-white/50 uppercase tracking-wider font-semibold mb-2">
                Layers
              </div>
              <div className="space-y-2">
                {/* Migration arcs toggle */}
                <button
                  onClick={handleArcsToggle}
                  className="flex items-center justify-between w-full group"
                >
                  <span className="text-sm text-white/70 group-hover:text-white/90 transition-colors">
                    Migration arcs
                  </span>
                  <div
                    className={`w-8 h-4.5 rounded-full relative transition-colors ${
                      viewState.showArcs ? 'bg-indigo-500' : 'bg-white/20'
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-transform ${
                        viewState.showArcs ? 'translate-x-4' : 'translate-x-0.5'
                      }`}
                    />
                  </div>
                </button>

                {/* Arc style dropdown (only when arcs are visible) */}
                {viewState.showArcs && (
                  <div className="pl-3">
                    <select
                      value={viewState.arcColorMode}
                      onChange={handleArcColorChange}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white/70 focus:outline-none focus:border-blue-500/50 transition-colors"
                    >
                      <option value="default">Default (orange)</option>
                      <option value="era">Color by era</option>
                      <option value="family">Color by family</option>
                    </select>
                  </div>
                )}

                {/* Place labels toggle */}
                <button
                  onClick={handleLabelsToggle}
                  className="flex items-center justify-between w-full group"
                >
                  <span className="text-sm text-white/70 group-hover:text-white/90 transition-colors">
                    Place labels
                  </span>
                  <div
                    className={`w-8 h-4.5 rounded-full relative transition-colors ${
                      viewState.showLabels ? 'bg-indigo-500' : 'bg-white/20'
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-transform ${
                        viewState.showLabels
                          ? 'translate-x-4'
                          : 'translate-x-0.5'
                      }`}
                    />
                  </div>
                </button>

                {/* Approximate rings toggle */}
                <button
                  onClick={handleApproxToggle}
                  className="flex items-center justify-between w-full group"
                >
                  <span className="text-sm text-white/70 group-hover:text-white/90 transition-colors">
                    Approximate rings
                  </span>
                  <div
                    className={`w-8 h-4.5 rounded-full relative transition-colors ${
                      viewState.showApproximate
                        ? 'bg-indigo-500'
                        : 'bg-white/20'
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-transform ${
                        viewState.showApproximate
                          ? 'translate-x-4'
                          : 'translate-x-0.5'
                      }`}
                    />
                  </div>
                </button>
              </div>
            </div>

            {/* Section 7: Region legend with clickable toggles */}
            <div className="px-4 py-3 border-b border-white/5">
              <div className="text-xs text-white/50 uppercase tracking-wider font-semibold mb-2">
                Locations by Region
              </div>
              <div className="space-y-1">
                {regionOptions.map((region) => {
                  const color = REGION_COLORS[region] || REGION_COLORS.default;
                  const isExplicitlySelected =
                    viewState.regions.includes(region);
                  const noRegionsSelected = viewState.regions.length === 0;
                  const isActive = noRegionsSelected || isExplicitlySelected;

                  return (
                    <button
                      key={region}
                      onClick={() => handleRegionClick(region)}
                      className={`flex items-center gap-2.5 w-full text-left px-2 py-1.5 rounded-lg transition-all ${
                        isExplicitlySelected
                          ? 'bg-white/10 ring-1 ring-indigo-400/60 shadow-[0_0_6px_rgba(99,102,241,0.25)] text-white'
                          : isActive
                            ? 'text-white/90 hover:bg-white/5'
                            : 'text-white/30 hover:text-white/50 hover:bg-white/5'
                      }`}
                    >
                      <span
                        className={`w-3 h-3 rounded-full flex-shrink-0 transition-all ${
                          isActive ? 'opacity-100' : 'opacity-25'
                        } ${isExplicitlySelected ? 'ring-1 ring-white/50' : ''}`}
                        style={{ backgroundColor: color.toCssColorString() }}
                      />
                      <span className="text-sm font-medium flex-1">
                        {region}
                      </span>
                      {isExplicitlySelected && (
                        <svg
                          className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
              {viewState.regions.length > 0 && (
                <button
                  onClick={() => onViewStateChange({ regions: [] })}
                  className="mt-2 text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
                >
                  Clear region filter
                </button>
              )}
            </div>

            {/* Section 8: Fit to view button */}
            {onFitToView && (
              <div className="px-4 py-3 border-b border-white/5">
                <button
                  onClick={onFitToView}
                  title={
                    hasActiveFilters
                      ? 'Zoom the camera to frame all visible locations'
                      : 'Zoom the camera to frame the family tree'
                  }
                  className="w-full flex items-center justify-center gap-2 bg-white/10 hover:bg-white/15 border border-white/10 hover:border-white/20 text-white/80 hover:text-white text-sm font-medium py-2 px-3 rounded-lg transition-all"
                >
                  {/* Crosshairs / frame icon */}
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                    />
                  </svg>
                  Fit to view
                </button>
              </div>
            )}

            {/* Section 9: Help */}
            <div className="px-4 py-3">
              <details className="group">
                <summary className="text-xs text-white/50 uppercase tracking-wider font-semibold cursor-pointer hover:text-white/70 transition-colors list-none flex items-center gap-1.5">
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  How to explore
                </summary>
                <ul className="mt-2 text-white/60 space-y-1 text-xs font-medium">
                  <li>Drag to rotate the globe</li>
                  <li>Scroll to zoom (street level!)</li>
                  <li>Click a location to see people</li>
                  <li>Click an arc for migration details</li>
                  <li>Click a region to filter by country</li>
                  <li>Search for a person to highlight them</li>
                  <li>Middle-click to tilt view</li>
                </ul>
              </details>
            </div>
          </div>
        </div>

        {canScrollUp && (
          <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-black/65 via-black/25 to-transparent" />
        )}

        {canScrollDown && (
          <>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/85 via-black/45 to-transparent" />
            {!canScrollUp && (
              <div className="absolute inset-x-0 bottom-2 flex justify-center px-4">
                <button
                  type="button"
                  onClick={handleScrollMore}
                  className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-black/55 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/65 transition-colors hover:text-white/90"
                  title="Scroll down for more controls"
                >
                  <span>Scroll for more</span>
                  <svg
                    className="h-3.5 w-3.5 animate-[bounce_1.6s_ease-in-out_infinite]"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 10l5 5 5-5"
                    />
                  </svg>
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
