'use client';

import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import Link from 'next/link';
import { usePageContext } from '@/hooks/usePageContext';
import { useRouteContextProvider } from '@/hooks/useRouteContextProvider';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useViewerAncestry } from '@/hooks/useViewerAncestry';
import Skeleton from '@/components/ui/Skeleton';
import MobileTimelineSummaryBar from '@/components/timeline/mobile/MobileTimelineSummaryBar';
import MobileTimelineFilterSheet from '@/components/timeline/mobile/MobileTimelineFilterSheet';
import type {
  TimelineBranchOption,
  TimelineDecadeOption,
  TimelineRangePreset,
  TimelineYearRange,
} from '@/components/timeline/mobile/types';

interface TimelineEvent {
  year: number;
  type: 'birth' | 'death';
  description: string;
  location: string | null;
  personId: string;
  personName: string;
  surname: string | null;
  lat: number | null;
  lng: number | null;
  country: string | null;
}

const HISTORICAL_EVENTS = [
  { year: 1776, label: 'American Revolution', color: '#3B82F6' },
  { year: 1815, label: 'Waterloo', color: '#6B7280' },
  { year: 1849, label: 'Gold Rush', color: '#F59E0B' },
  { year: 1861, label: 'Civil War Begins', color: '#EF4444' },
  { year: 1865, label: 'Civil War Ends', color: '#EF4444' },
  { year: 1914, label: 'WWI Begins', color: '#DC2626' },
  { year: 1918, label: 'WWI Ends', color: '#DC2626' },
  { year: 1929, label: 'Great Depression', color: '#6B7280' },
  { year: 1939, label: 'WWII Begins', color: '#991B1B' },
  { year: 1945, label: 'WWII Ends', color: '#991B1B' },
  { year: 1969, label: 'Moon Landing', color: '#8B5CF6' },
];

const BRANCH_COLORS = [
  '#3B82F6', '#F59E0B', '#EF4444', '#14B8A6', '#10B981',
  '#EC4899', '#06B6D4', '#A855F7', '#8B5CF6', '#F97316',
];

const ALL_BRANCH = 'all';
const MY_LINES_BRANCH = 'my-lines';

interface FamilyBranch {
  label: string;
  surnames: string[];
  color: string;
}

function sortYears(events: TimelineEvent[]): number[] {
  return Array.from(
    new Set(events.map((event) => event.year).filter((year): year is number => Boolean(year))),
  ).sort((a, b) => a - b);
}

function filterEventsByBranch(
  events: TimelineEvent[],
  branch: string,
  familyBranches: Record<string, FamilyBranch>,
  viewerAncestorIds?: Set<string>,
  viewerSurnames?: Set<string>,
) {
  if (branch === ALL_BRANCH) return events;

  if (branch === MY_LINES_BRANCH) {
    if (viewerAncestorIds && viewerAncestorIds.size > 0) {
      return events.filter((event) => viewerAncestorIds.has(event.personId));
    }

    const viewerLineSurnames = Array.from(viewerSurnames ?? []);
    return events.filter((event) => {
      const eventSurname = event.surname?.toLowerCase() ?? '';
      return viewerLineSurnames.some((surname) => surname && eventSurname.includes(surname));
    });
  }

  const surnames = familyBranches[branch]?.surnames ?? [];
  return events.filter((event) => {
    const eventSurname = event.surname?.toLowerCase() ?? '';
    return surnames.some((surname) => eventSurname.includes(surname));
  });
}

function isMeaningfulTimelineSurname(value: string): boolean {
  const surname = value.trim();
  if (!surname) return false;
  if (/^\d+$/.test(surname)) return false;
  if (/^\([^)]*\)$/.test(surname)) return false;
  return true;
}

function normalizeYearRange(
  yearRange: TimelineYearRange | null,
  branchFilteredEvents: TimelineEvent[],
): TimelineYearRange | null {
  if (!yearRange) return null;

  const availableYears = sortYears(branchFilteredEvents);
  const minYear = availableYears[0];
  const maxYear = availableYears[availableYears.length - 1];

  if (typeof minYear !== 'number' || typeof maxYear !== 'number') {
    return null;
  }

  if (yearRange.startYear > yearRange.endYear) {
    return null;
  }

  if (yearRange.startYear < minYear || yearRange.endYear > maxYear) {
    return null;
  }

  const hasVisibleEvents = branchFilteredEvents.some(
    (event) => event.year >= yearRange.startYear && event.year <= yearRange.endYear,
  );

  return hasVisibleEvents ? yearRange : null;
}

function filterEventsByYearRange(
  events: TimelineEvent[],
  yearRange: TimelineYearRange | null,
) {
  if (!yearRange) return events;

  return events.filter(
    (event) => event.year >= yearRange.startYear && event.year <= yearRange.endYear,
  );
}

function buildRangePresets(minYear: number | null, maxYear: number | null): TimelineRangePreset[] {
  if (typeof minYear !== 'number' || typeof maxYear !== 'number') {
    return [{ id: 'all', label: 'All years', range: null }];
  }

  const presets: TimelineRangePreset[] = [
    { id: 'all', label: 'All years', range: null },
  ];

  const span = maxYear - minYear;

  if (span >= 49) {
    presets.push({
      id: 'recent-50',
      label: 'Recent 50 years',
      range: { startYear: maxYear - 49, endYear: maxYear, source: 'preset' },
    });
    presets.push({
      id: 'early-50',
      label: 'Earliest 50 years',
      range: { startYear: minYear, endYear: minYear + 49, source: 'preset' },
    });
  }

  if (span >= 99) {
    presets.push({
      id: 'recent-100',
      label: 'Recent 100 years',
      range: { startYear: maxYear - 99, endYear: maxYear, source: 'preset' },
    });
  }

  return presets;
}

function buildDecadeOptions(eventsByDecade: Record<number, TimelineEvent[]>): TimelineDecadeOption[] {
  return Object.keys(eventsByDecade)
    .map((decade) => Number(decade))
    .sort((a, b) => a - b)
    .map((decade) => ({
      decade,
      count: eventsByDecade[decade]?.length ?? 0,
    }));
}

function formatYearRangeLabel(
  yearRange: TimelineYearRange | null,
  minYear: number | null,
  maxYear: number | null,
) {
  if (yearRange) {
    return `${yearRange.startYear}-${yearRange.endYear}`;
  }

  if (typeof minYear === 'number' && typeof maxYear === 'number') {
    return `${minYear}-${maxYear}`;
  }

  return 'All years';
}

export default function TimelinePage() {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [branch, setBranch] = useState('all');
  const [yearRange, setYearRange] = useState<TimelineYearRange | null>(null);
  const [selectedDecade, setSelectedDecade] = useState<number | null>(null);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [hoveredEvent, setHoveredEvent] = useState<TimelineEvent | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const statsBarRef = useRef<HTMLDivElement>(null);
  const decadeNavRef = useRef<HTMLDivElement>(null);
  const summaryBarRef = useRef<HTMLDivElement>(null);
  const previousIsMobileRef = useRef<boolean | null>(null);
  const isMobile = useIsMobile();
  const {
    ancestorIds,
    ancestorSurnames,
    loading: viewerAncestryLoading,
    error: viewerAncestryError,
  } = useViewerAncestry();
  const pageContext = useMemo(() => ({ type: 'timeline' as const }), []);

  usePageContext(pageContext);

  const familyBranches = useMemo<Record<string, FamilyBranch>>(() => {
    const branches: Record<string, FamilyBranch> = {
      all: { label: 'All Families', surnames: [], color: '#3B82F6' },
    };

    const surnameCounts = new Map<string, number>();
    for (const event of events) {
      const surname = event.surname?.trim();
      if (surname && isMeaningfulTimelineSurname(surname)) {
        surnameCounts.set(surname, (surnameCounts.get(surname) ?? 0) + 1);
      }
    }

    const sortedSurnames = Array.from(surnameCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);

    sortedSurnames.forEach((surname, index) => {
      const key = surname.toLowerCase();
      if (!branches[key]) {
        branches[key] = {
          label: surname,
          surnames: [key],
          color: BRANCH_COLORS[index % BRANCH_COLORS.length],
        };
      }
    });

    return branches;
  }, [events]);

  const hasLoadedViewerAncestry = ancestorIds.size > 0 || ancestorSurnames.size > 0;
  const showMyLinesOption =
    viewerAncestryLoading || Boolean(viewerAncestryError) || hasLoadedViewerAncestry;
  const myLinesDisabled =
    viewerAncestryLoading || Boolean(viewerAncestryError) || !hasLoadedViewerAncestry;
  const myLinesLabel = viewerAncestryLoading
    ? 'My Lines (loading...)'
    : viewerAncestryError
      ? 'My Lines (unavailable)'
      : 'My Lines';

  const branchOptions = useMemo<TimelineBranchOption[]>(
    () => {
      const options: TimelineBranchOption[] = [
        { value: ALL_BRANCH, label: familyBranches[ALL_BRANCH]?.label ?? 'All Families' },
      ];

      if (showMyLinesOption) {
        options.push({
          value: MY_LINES_BRANCH,
          label: myLinesLabel,
          disabled: myLinesDisabled,
        });
      }

      Object.entries(familyBranches).forEach(([value, config]) => {
        if (value === ALL_BRANCH) {
          return;
        }

        options.push({
          value,
          label: config.label,
        });
      });

      return options;
    },
    [familyBranches, myLinesDisabled, myLinesLabel, showMyLinesOption],
  );

  useEffect(() => {
    if (branch === MY_LINES_BRANCH) {
      if (!showMyLinesOption || (myLinesDisabled && !viewerAncestryLoading)) {
        setBranch(ALL_BRANCH);
      }
      return;
    }

    if (!(branch in familyBranches)) {
      setBranch(ALL_BRANCH);
    }
  }, [branch, familyBranches, myLinesDisabled, showMyLinesOption, viewerAncestryLoading]);

  useEffect(() => {
    async function loadData() {
      try {
        const response = await fetch('/api/timeline');
        if (!response.ok) {
          console.error('Failed to load timeline data');
          setLoading(false);
          return;
        }

        const data: TimelineEvent[] = await response.json();
        setEvents(data);
      } catch (error) {
        console.error('Failed to load timeline data:', error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const branchFilteredEvents = useMemo(
    () => filterEventsByBranch(events, branch, familyBranches, ancestorIds, ancestorSurnames),
    [ancestorIds, ancestorSurnames, branch, events, familyBranches],
  );

  const branchFilteredYears = useMemo(
    () => sortYears(branchFilteredEvents),
    [branchFilteredEvents],
  );
  const availableMinYear = branchFilteredYears[0] ?? null;
  const availableMaxYear = branchFilteredYears[branchFilteredYears.length - 1] ?? null;

  useEffect(() => {
    const normalized = normalizeYearRange(yearRange, branchFilteredEvents);
    const yearRangeChanged =
      (yearRange === null && normalized !== null) ||
      (yearRange !== null && normalized === null) ||
      (yearRange !== null &&
        normalized !== null &&
        (
          yearRange.startYear !== normalized.startYear ||
          yearRange.endYear !== normalized.endYear ||
          yearRange.source !== normalized.source
        ));

    if (yearRangeChanged) {
      setYearRange(normalized);
    }
  }, [branchFilteredEvents, yearRange]);

  const filteredEvents = useMemo(
    () => filterEventsByYearRange(branchFilteredEvents, yearRange),
    [branchFilteredEvents, yearRange],
  );

  const eventsByDecade = useMemo(() => {
    const grouped: Record<number, TimelineEvent[]> = {};
    filteredEvents.forEach((event) => {
      if (event.year) {
        const decade = Math.floor(event.year / 10) * 10;
        if (!grouped[decade]) grouped[decade] = [];
        grouped[decade].push(event);
      }
    });
    return grouped;
  }, [filteredEvents]);

  const decadeOptions = useMemo(
    () => buildDecadeOptions(eventsByDecade),
    [eventsByDecade],
  );

  const decades = useMemo(() => {
    if (filteredEvents.length === 0) return [];
    const years = filteredEvents.map((event) => event.year).filter(Boolean);
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);
    const minDecade = Math.floor(minYear / 10) * 10;
    const maxDecade = Math.floor(maxYear / 10) * 10;
    const result = [];
    for (let decade = minDecade; decade <= maxDecade; decade += 10) {
      result.push(decade);
    }
    return result;
  }, [filteredEvents]);

  useEffect(() => {
    if (selectedDecade === null) {
      return;
    }

    const hasVisibleEvents = (eventsByDecade[selectedDecade]?.length ?? 0) > 0;
    if (!hasVisibleEvents) {
      setSelectedDecade(null);
    }
  }, [eventsByDecade, selectedDecade]);

  useEffect(() => {
    if (isMobile === null) {
      return;
    }

    const previousIsMobile = previousIsMobileRef.current;
    previousIsMobileRef.current = isMobile;

    if (previousIsMobile === null || previousIsMobile === isMobile) {
      return;
    }

    setIsFilterSheetOpen(false);

    if (!isMobile) {
      setYearRange(null);
    }
  }, [isMobile]);

  const stats = useMemo(() => {
    const births = filteredEvents.filter((event) => event.type === 'birth').length;
    const deaths = filteredEvents.filter((event) => event.type === 'death').length;
    const countries = new Set(filteredEvents.map((event) => event.country).filter(Boolean)).size;
    return { births, deaths, countries };
  }, [filteredEvents]);

  const rangePresets = useMemo(
    () => buildRangePresets(availableMinYear, availableMaxYear),
    [availableMaxYear, availableMinYear],
  );

  const summaryBranchLabel =
    branchOptions.find((option) => option.value === branch)?.label ??
    familyBranches[branch]?.label ??
    'All Families';
  const summaryYearRangeLabel = formatYearRangeLabel(yearRange, availableMinYear, availableMaxYear);
  const branchHint =
    branch === MY_LINES_BRANCH && viewerAncestryLoading
      ? 'Loading your ancestor lines...'
      : branch === MY_LINES_BRANCH && viewerAncestryError
        ? 'Couldn’t load your ancestor lines. Try changing viewer and retrying.'
        : null;

  const routeContextProvider = useCallback(
    () => ({
      branch,
      yearRange: yearRange
        ? {
            startYear: yearRange.startYear,
            endYear: yearRange.endYear,
            source: yearRange.source,
          }
        : null,
      decade: selectedDecade,
    }),
    [branch, selectedDecade, yearRange],
  );
  useRouteContextProvider(routeContextProvider);

  const scrollToDecade = useCallback((decade: number) => {
    setSelectedDecade(decade);
    const element = document.getElementById(`decade-${decade}`);
    if (!element) return;

    const stickyOffset = isMobile
      ? (summaryBarRef.current?.getBoundingClientRect().height ?? 0) + 72
      : (
          (document.querySelector('header')?.getBoundingClientRect().height ?? 0) +
          (statsBarRef.current?.getBoundingClientRect().height ?? 0) +
          (decadeNavRef.current?.getBoundingClientRect().height ?? 0) +
          16
        );

    const targetTop = window.scrollY + element.getBoundingClientRect().top - stickyOffset;
    window.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
  }, [isMobile]);

  const getEventColor = useCallback((event: TimelineEvent) => {
    if (branch === MY_LINES_BRANCH) {
      return '#6D28D9';
    }

    if (branch !== ALL_BRANCH) {
      return familyBranches[branch]?.color ?? '#3B82F6';
    }

    const surname = event.surname?.toLowerCase() ?? '';
    for (const currentBranch of Object.values(familyBranches)) {
      if (currentBranch.surnames.some((value) => surname.includes(value))) {
        return currentBranch.color;
      }
    }

    return '#6B7280';
  }, [branch, familyBranches]);

  if (loading || isMobile === null) {
    return (
      <div className="min-h-full bg-cream">
        <div className="mx-auto max-w-7xl px-6 py-12">
          <div className="mb-8 text-center">
            <Skeleton className="mx-auto mb-4 h-10 w-48" />
            <Skeleton className="mx-auto h-4 w-64" />
          </div>
          <div className="mb-8 flex gap-2">
            {[...Array(8)].map((_, index) => (
              <Skeleton key={index} className="h-8 w-16 rounded" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(9)].map((_, index) => (
              <div key={index} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-start gap-3">
                  <Skeleton variant="circular" className="h-8 w-8" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-vignette flex flex-col">
      {isMobile ? (
        <>
          <div ref={summaryBarRef}>
            <MobileTimelineSummaryBar
              branchLabel={summaryBranchLabel}
              yearRangeLabel={summaryYearRangeLabel}
              eventCount={filteredEvents.length}
              onOpenFilters={() => setIsFilterSheetOpen(true)}
            />
          </div>
          <MobileTimelineFilterSheet
            open={isFilterSheetOpen}
            onClose={() => setIsFilterSheetOpen(false)}
            branches={branchOptions}
            branch={branch}
            onBranchChange={setBranch}
            branchHint={branchHint}
            yearRange={yearRange}
            presets={rangePresets}
            years={branchFilteredYears}
            onYearRangeChange={setYearRange}
            onReset={() => {
              setBranch(ALL_BRANCH);
              setYearRange(null);
              setSelectedDecade(null);
            }}
            decades={decadeOptions}
            selectedDecade={selectedDecade}
            onSelectDecade={(decade) => {
              scrollToDecade(decade);
              setIsFilterSheetOpen(false);
            }}
          />
        </>
      ) : (
        <>
          <div
            ref={statsBarRef}
            data-testid="desktop-timeline-stats-bar"
            className="sticky top-14 z-30 border-b border-shield/10 bg-white/80 shadow-sm backdrop-blur-md"
          >
            <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 text-sm">
              <div className="flex items-center gap-8">
                <div className="flex items-center gap-2">
                  <span className="text-green-600">+</span>
                  <span className="font-medium text-gray-900">{stats.births}</span>
                  <span className="text-gray-500">births</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-red-500">-</span>
                  <span className="font-medium text-gray-900">{stats.deaths}</span>
                  <span className="text-gray-500">deaths</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-shield">●</span>
                  <span className="font-medium text-gray-900">{stats.countries}</span>
                  <span className="text-gray-500">countries</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-shield">◆</span>
                  <span className="font-medium text-gray-900">{decades.length}</span>
                  <span className="text-gray-500">decades</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="desktop-timeline-branch" className="hidden text-sm text-gray-500 sm:block">
                  Family:
                </label>
                <select
                  id="desktop-timeline-branch"
                  aria-label="Family branch"
                  value={branch}
                  onChange={(event) => setBranch(event.target.value)}
                  className="cursor-pointer rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700"
                >
                  {branchOptions.map((option) => (
                    <option key={option.value} value={option.value} disabled={option.disabled}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div
            ref={decadeNavRef}
            data-testid="desktop-timeline-decade-nav"
            className="sticky top-[73px] z-30 border-b border-shield/10 bg-white/60 shadow-sm backdrop-blur-md"
          >
            <div className="mx-auto flex max-w-7xl flex-wrap gap-2 px-6 py-3">
              {decades.map((decade) => {
                const count = eventsByDecade[decade]?.length ?? 0;
                const isActive = selectedDecade === decade;
                return (
                  <button
                    key={decade}
                    onClick={() => scrollToDecade(decade)}
                    className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-shield text-white shadow-md'
                        : count > 0
                          ? 'border border-shield/10 bg-white text-gray-700 hover:border-shield/30 hover:bg-shield/5'
                          : 'border border-transparent bg-transparent text-gray-400 opacity-50'
                    }`}
                  >
                    {decade}s
                    {count > 0 && <span className="ml-1 text-xs opacity-60">({count})</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      <main
        className={`mx-auto w-full max-w-7xl px-4 py-6 md:px-6 md:py-8 ${isMobile ? 'space-y-10' : ''}`}
        ref={timelineRef}
      >
        {decades.map((decade) => {
          const decadeEvents = eventsByDecade[decade] ?? [];
          const historicalInDecade = HISTORICAL_EVENTS.filter(
            (event) => event.year >= decade && event.year < decade + 10,
          );

          return (
            <div key={decade} id={`decade-${decade}`} className="mb-12">
              <div className="mb-6 flex items-center gap-4">
                <h2 className="font-serif text-3xl font-bold text-shield">{decade}s</h2>
                <div className="h-px flex-1 bg-gradient-to-r from-gray-300 to-transparent" />
                <span className="text-sm text-gray-500">{decadeEvents.length} events</span>
              </div>

              {historicalInDecade.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-2">
                  {historicalInDecade.map((event) => (
                    <div
                      key={event.year}
                      className="rounded-full px-3 py-1 text-xs font-medium"
                      style={{
                        backgroundColor: `${event.color}20`,
                        color: event.color,
                        border: `1px solid ${event.color}40`,
                      }}
                    >
                      {event.year}: {event.label}
                    </div>
                  ))}
                </div>
              )}

              {decadeEvents.length > 0 ? (
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {decadeEvents.map((event, index) => (
                    <Link
                      key={`${event.personId}-${event.type}-${index}`}
                      href={`/person/${event.personId}`}
                      className="group relative rounded-2xl border border-shield/10 bg-white/90 p-5 transition-all hover:-translate-y-1 hover:border-shield/40 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)]"
                      onMouseEnter={!isMobile ? () => setHoveredEvent(event) : undefined}
                      onMouseLeave={!isMobile ? () => setHoveredEvent(null) : undefined}
                    >
                      <div
                        className="absolute -right-3 -top-3 flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold text-white shadow-lg ring-4 ring-white"
                        style={{ backgroundColor: getEventColor(event) }}
                      >
                        {event.year}
                      </div>

                      <div className="flex items-start gap-3">
                        <div
                          className={`mt-1 flex h-8 w-8 items-center justify-center rounded-full text-lg ${
                            event.type === 'birth'
                              ? 'bg-green-100 text-green-600'
                              : 'bg-red-100 text-red-500'
                          }`}
                        >
                          {event.type === 'birth' ? '+' : '−'}
                        </div>

                        <div className="min-w-0 flex-1">
                          <h3 className="truncate font-serif text-lg font-bold text-gray-900 transition-colors group-hover:text-shield">
                            {event.personName}
                          </h3>
                          <p className="mt-1 line-clamp-2 text-sm text-gray-600">
                            {event.type === 'birth' ? 'Born' : 'Died'} in{' '}
                            <span className="font-medium text-gray-800">
                              {event.location ?? 'unknown location'}
                            </span>
                          </p>
                          {event.country && (
                            <div className="mt-2 inline-block rounded border border-gray-200 bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                              {event.country}
                            </div>
                          )}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-gray-200 bg-white py-8 text-center text-gray-400">
                  No events recorded in this decade
                </div>
              )}
            </div>
          );
        })}
      </main>

      {!isMobile && hoveredEvent && (
        <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-white/20 bg-shield px-4 py-2 shadow-xl">
          <p className="font-medium text-white">{hoveredEvent.personName}</p>
          <p className="text-sm text-white/70">
            {hoveredEvent.type === 'birth' ? 'Born' : 'Died'} {hoveredEvent.year} in {hoveredEvent.location}
          </p>
        </div>
      )}
    </div>
  );
}
