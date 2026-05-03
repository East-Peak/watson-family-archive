'use client';

import { useEffect, useMemo, useState } from 'react';
import { FAMILY_BRANCHES } from '../constants';
import { getLocationRegion } from '../regions';
import type {
  Arc,
  EntityVisibility,
  FilteredArc,
  FilteredLocation,
  GlobeData,
  GlobeViewState,
  Location,
  Person,
} from '../types';

// --- Visibility computation (exported for testing) ---

/**
 * Determine whether a person at a location passes the branch filter.
 * Returns true if the person belongs to the selected branch.
 */
function personMatchesBranch(
  personId: string,
  personName: string,
  branch: string,
  viewerSurnames?: Set<string>,
  viewerAncestorIds?: Set<string>,
): boolean {
  if (!branch || branch === 'all') return true;

  // "My Lines" uses actual ancestor IDs when available, falls back to surname matching
  if (branch === 'my-lines') {
    if (viewerAncestorIds && viewerAncestorIds.size > 0) {
      return viewerAncestorIds.has(personId);
    }
    // Fallback to surname matching if no ancestor IDs loaded yet
    const surnames = Array.from(viewerSurnames || []);
    return surnames.some((s) => s && personName.toLowerCase().includes(s));
  }

  const surnames = FAMILY_BRANCHES[branch]?.surnames || [branch.toLowerCase()];
  return surnames.some((s) => s && personName.toLowerCase().includes(s));
}

/**
 * Determine whether a location has any person matching the branch filter.
 * If no people match, the entire location is hidden.
 */
function locationPassesBranch(
  location: Location,
  branch: string,
  viewerSurnames?: Set<string>,
  viewerAncestorIds?: Set<string>,
): boolean {
  if (!branch || branch === 'all') return true;
  return location.people.some((p) => personMatchesBranch(p.id, p.name, branch, viewerSurnames, viewerAncestorIds));
}

/**
 * Determine whether an arc's person matches the branch filter.
 */
function arcPassesBranch(
  arc: Arc,
  branch: string,
  personIdToName: Map<string, string>,
  viewerSurnames?: Set<string>,
  viewerAncestorIds?: Set<string>,
): boolean {
  if (!branch || branch === 'all') return true;
  const name = personIdToName.get(arc.person_id) || '';
  return personMatchesBranch(arc.person_id, name, branch, viewerSurnames, viewerAncestorIds);
}

/**
 * Check if a location has at least one event matching the active event types
 * AND falling within the year range. Uses paired events for correct composition.
 *
 * Rules:
 * - If yearRange is null and eventTypes includes all defaults: full
 * - If yearRange is set: at least one event must have a year in range
 * - If eventTypes is set: at least one event must have a matching type
 * - If BOTH are set: at least one event must match BOTH type AND year
 */
export function locationMatchesFilters(
  location: Location,
  yearRange: [number, number] | null,
  eventTypes: string[],
  allEventTypesActive: boolean,
): boolean {
  return location.people.some((person) =>
    personMatchesTimelineAndEventFilters(person, yearRange, eventTypes, allEventTypesActive),
  );
}

/**
 * Check if a location's country is in the selected regions.
 * Empty regions array means all regions are full (no filtering).
 */
export function locationMatchesRegion(location: Location, regions: string[]): boolean {
  if (regions.length === 0) return true;
  return regions.includes(getLocationRegion(location));
}

function personMatchesTimelineAndEventFilters(
  person: Person,
  yearRange: [number, number] | null,
  eventTypes: string[],
  allEventTypesActive: boolean,
): boolean {
  const hasYearFilter = yearRange !== null;
  const hasEventFilter = !allEventTypesActive;

  if (!hasYearFilter && !hasEventFilter) return true;

  return person.events.some((event) => {
    const yearOk = !hasYearFilter || (event.year !== null && event.year >= yearRange![0] && event.year <= yearRange![1]);
    const typeOk = !hasEventFilter || eventTypes.includes(event.type);
    return yearOk && typeOk;
  });
}

function personMatchesLocationView(
  person: Person,
  viewState: Pick<GlobeViewState, 'branch' | 'yearRange' | 'eventTypes' | 'highlightPerson'>,
  viewerSurnames?: Set<string>,
  viewerAncestorIds?: Set<string>,
): boolean {
  if (!personMatchesBranch(person.id, person.name, viewState.branch, viewerSurnames, viewerAncestorIds)) {
    return false;
  }

  if (viewState.highlightPerson && person.id !== viewState.highlightPerson) {
    return false;
  }

  return personMatchesTimelineAndEventFilters(
    person,
    viewState.yearRange,
    viewState.eventTypes,
    isAllEventTypesActive(viewState.eventTypes),
  );
}

function locationHasVisiblePeople(
  location: Location,
  viewState: Pick<GlobeViewState, 'branch' | 'yearRange' | 'eventTypes' | 'highlightPerson'>,
  viewerSurnames?: Set<string>,
  viewerAncestorIds?: Set<string>,
): boolean {
  return location.people.some((person) =>
    personMatchesLocationView(person, viewState, viewerSurnames, viewerAncestorIds),
  );
}

/**
 * Check if an arc matches the highlighted person.
 */
function arcMatchesPerson(arc: Arc, highlightPerson: string | null): boolean {
  if (!highlightPerson) return true;
  return arc.person_id === highlightPerson;
}

/**
 * Check if an arc passes the year range and event type filters.
 * An arc is dimmed if either endpoint falls outside the filters.
 */
export function arcMatchesFilters(
  arc: Arc,
  yearRange: [number, number] | null,
  eventTypes: string[],
  allEventTypesActive: boolean,
): boolean {
  const hasYearFilter = yearRange !== null;
  const hasEventFilter = !allEventTypesActive;

  if (!hasYearFilter && !hasEventFilter) return true;

  // Check from endpoint
  const fromYearOk = !hasYearFilter || (arc.from.year != null && arc.from.year >= yearRange![0] && arc.from.year <= yearRange![1]);
  const fromTypeOk = !hasEventFilter || (arc.from.eventType != null && eventTypes.includes(arc.from.eventType));

  // Check to endpoint
  const toYearOk = !hasYearFilter || (arc.to.year != null && arc.to.year >= yearRange![0] && arc.to.year <= yearRange![1]);
  const toTypeOk = !hasEventFilter || (arc.to.eventType != null && eventTypes.includes(arc.to.eventType));

  // Arc is full if BOTH endpoints pass their respective checks
  const fromOk = (!hasYearFilter || fromYearOk) && (!hasEventFilter || fromTypeOk);
  const toOk = (!hasYearFilter || toYearOk) && (!hasEventFilter || toTypeOk);

  return fromOk && toOk;
}

/**
 * Check if an arc touches any of the selected regions.
 * An arc is full if either endpoint is in a selected region.
 */
function arcMatchesRegion(
  arc: Arc,
  regions: string[],
  locationsByCoord: Map<string, Location>,
): boolean {
  if (regions.length === 0) return true;

  const fromKey = `${arc.from.lat},${arc.from.lng}`;
  const toKey = `${arc.to.lat},${arc.to.lng}`;
  const fromLoc = locationsByCoord.get(fromKey);
  const toLoc = locationsByCoord.get(toKey);

  const fromMatch = fromLoc ? regions.includes(getLocationRegion(fromLoc)) : false;
  const toMatch = toLoc ? regions.includes(getLocationRegion(toLoc)) : false;

  return fromMatch || toMatch;
}

// --- Default event types (matching useGlobeViewState defaults) ---

const DEFAULT_EVENT_TYPES = ['birth', 'death', 'marriage', 'census', 'residence'];

function isAllEventTypesActive(eventTypes: string[]): boolean {
  if (eventTypes.length !== DEFAULT_EVENT_TYPES.length) return false;
  return DEFAULT_EVENT_TYPES.every((t) => eventTypes.includes(t));
}

// --- Compute visibility for all entities ---

export function computeLocationVisibility(
  location: Location,
  viewState: Pick<GlobeViewState, 'branch' | 'yearRange' | 'eventTypes' | 'regions' | 'highlightPerson'>,
  viewerSurnames?: Set<string>,
  viewerAncestorIds?: Set<string>,
): EntityVisibility {
  // Branch filter -> hidden
  if (!locationPassesBranch(location, viewState.branch, viewerSurnames, viewerAncestorIds)) {
    return 'hidden';
  }

  // Region filter -> dimmed
  if (!locationMatchesRegion(location, viewState.regions)) {
    return 'dimmed';
  }

  // A location is only fully visible when at least one actual person survives
  // the combined branch + year/event + person filters together.
  if (!locationHasVisiblePeople(location, viewState, viewerSurnames, viewerAncestorIds)) {
    return 'dimmed';
  }

  return 'full';
}

export function computeArcVisibility(
  arc: Arc,
  viewState: Pick<GlobeViewState, 'branch' | 'yearRange' | 'eventTypes' | 'regions' | 'highlightPerson'>,
  personIdToName: Map<string, string>,
  locationsByCoord: Map<string, Location>,
  viewerSurnames?: Set<string>,
  viewerAncestorIds?: Set<string>,
): EntityVisibility {
  // Branch filter -> hidden
  if (!arcPassesBranch(arc, viewState.branch, personIdToName, viewerSurnames, viewerAncestorIds)) {
    return 'hidden';
  }

  const allActive = isAllEventTypesActive(viewState.eventTypes);

  // Year/event filter -> dimmed
  if (!arcMatchesFilters(arc, viewState.yearRange, viewState.eventTypes, allActive)) {
    return 'dimmed';
  }

  // Region filter -> dimmed
  if (!arcMatchesRegion(arc, viewState.regions, locationsByCoord)) {
    return 'dimmed';
  }

  // Person highlight -> dimmed
  if (!arcMatchesPerson(arc, viewState.highlightPerson)) {
    return 'dimmed';
  }

  return 'full';
}

// --- Hook options ---

interface UseGlobeFilteredDataOptions {
  viewState: Pick<GlobeViewState, 'branch' | 'yearRange' | 'eventTypes' | 'regions' | 'highlightPerson'>;
  viewerSurnames?: Set<string>;
  viewerAncestorIds?: Set<string>;
}

// --- Hook return type ---

export interface UseGlobeFilteredDataReturn {
  globeData: GlobeData | null;
  filteredLocations: FilteredLocation[];
  filteredArcs: FilteredArc[];
  /** Branch setter preserved for stats panel backward compatibility. */
  selectedBranch: string;
  setSelectedBranch: (branch: string) => void;
}

// --- Hook ---

export function useGlobeFilteredData({
  viewState,
  viewerSurnames,
  viewerAncestorIds,
}: UseGlobeFilteredDataOptions): UseGlobeFilteredDataReturn {
  const [globeData, setGlobeData] = useState<GlobeData | null>(null);

  useEffect(() => {
    fetch('/api/globe')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch globe data');
        return res.json();
      })
      .then((data: GlobeData) => {
        setGlobeData(data);
      })
      .catch((err) => console.error('Failed to load globe data:', err));
  }, []);

  // Build lookup maps once when data changes
  const personIdToName = useMemo(() => {
    if (!globeData) return new Map<string, string>();
    const map = new Map<string, string>();
    for (const location of globeData.locations) {
      for (const person of location.people) {
        map.set(person.id, person.name);
      }
    }
    return map;
  }, [globeData]);

  const locationsByCoord = useMemo(() => {
    if (!globeData) return new Map<string, Location>();
    const map = new Map<string, Location>();
    for (const location of globeData.locations) {
      map.set(`${location.lat},${location.lng}`, location);
    }
    return map;
  }, [globeData]);

  // Compute visibility for all locations
  const filteredLocations = useMemo((): FilteredLocation[] => {
    if (!globeData) return [];

    return globeData.locations.map((location) => {
      const visiblePeople = location.people.filter((person) =>
        personMatchesLocationView(person, viewState, viewerSurnames, viewerAncestorIds),
      );

      return {
        ...location,
        visiblePeople,
        visiblePeopleCount: visiblePeople.length,
        visibility: computeLocationVisibility(location, viewState, viewerSurnames, viewerAncestorIds),
      };
    });
  }, [globeData, viewState, viewerSurnames, viewerAncestorIds]);

  // Compute visibility for all arcs
  const filteredArcs = useMemo((): FilteredArc[] => {
    if (!globeData) return [];

    return globeData.arcs.map((arc) => ({
      ...arc,
      visibility: computeArcVisibility(
        arc,
        viewState,
        personIdToName,
        locationsByCoord,
        viewerSurnames,
        viewerAncestorIds,
      ),
    }));
  }, [globeData, viewState, personIdToName, locationsByCoord, viewerSurnames, viewerAncestorIds]);

  // Expose a branch setter for backward compatibility with the stats panel
  const setSelectedBranch = useMemo(() => {
    // This is a no-op placeholder — branch is now controlled by viewState.
    // Callers that still reference this should migrate to viewState.branch.
    return () => {};
  }, []);

  return {
    globeData,
    filteredLocations,
    filteredArcs,
    selectedBranch: viewState.branch || 'all',
    setSelectedBranch,
  };
}
