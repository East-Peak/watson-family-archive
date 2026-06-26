'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type {
  GlobeViewState,
  GlobeCameraState,
  GlobeViewMode,
  ArcColorMode,
} from '../types';

// --- Defaults ---

export const DEFAULT_EVENT_TYPES = [
  'birth',
  'death',
  'marriage',
  'census',
  'residence',
];

const DEFAULT_STATE: GlobeViewState = {
  branch: '',
  yearRange: null,
  eventTypes: DEFAULT_EVENT_TYPES,
  regions: [],
  highlightPerson: null,
  viewMode: 'pins',
  showApproximate: true,
  showArcs: true,
  showLabels: false,
  arcColorMode: 'default',
  camera: null,
};

// --- URL Parsing ---

function parseYearRange(value: string | null): [number, number] | null {
  if (!value) return null;
  const match = value.match(/^(\d+)-(\d+)$/);
  if (!match) return null;
  const start = parseInt(match[1], 10);
  const end = parseInt(match[2], 10);
  if (isNaN(start) || isNaN(end) || start > end) return null;
  return [start, end];
}

function parseEventTypes(value: string | null): string[] {
  if (!value) return DEFAULT_EVENT_TYPES;
  const types = value
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  return types.length > 0 ? types : DEFAULT_EVENT_TYPES;
}

function parseRegions(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);
}

function parseViewMode(value: string | null): GlobeViewMode {
  const valid: GlobeViewMode[] = ['pins', 'density', 'generation', 'origins'];
  if (value && valid.includes(value as GlobeViewMode)) {
    return value as GlobeViewMode;
  }
  return 'pins';
}

function parseBoolParam(value: string | null, defaultVal: boolean): boolean {
  if (value === '0') return false;
  if (value === '1') return true;
  return defaultVal;
}

function parseArcColorMode(value: string | null): ArcColorMode {
  const valid: ArcColorMode[] = ['default', 'era', 'family'];
  if (value && valid.includes(value as ArcColorMode)) {
    return value as ArcColorMode;
  }
  return 'default';
}

function parseCamera(value: string | null): GlobeCameraState | null {
  if (!value) return null;
  const parts = value.split(',');
  if (parts.length !== 5) return null;
  const nums = parts.map((p) => parseFloat(p.trim()));
  if (nums.some((n) => isNaN(n))) return null;
  return {
    lat: nums[0],
    lng: nums[1],
    height: nums[2],
    heading: nums[3],
    pitch: nums[4],
  };
}

export function parseStateFromURL(search: string): GlobeViewState {
  const params = new URLSearchParams(search);
  return {
    branch: params.get('branch') || '',
    yearRange: parseYearRange(params.get('year')),
    eventTypes: parseEventTypes(params.get('events')),
    regions: parseRegions(params.get('region')),
    highlightPerson: params.get('person') || null,
    viewMode: parseViewMode(params.get('view')),
    showApproximate: parseBoolParam(params.get('approx'), true),
    showArcs: parseBoolParam(params.get('arcs'), true),
    showLabels: parseBoolParam(params.get('labels'), false),
    arcColorMode: parseArcColorMode(params.get('arcColor')),
    camera: parseCamera(params.get('cam')),
  };
}

// --- URL Serialization ---

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((val, i) => val === sortedB[i]);
}

export function serializeStateToURL(
  state: GlobeViewState,
  existingSearch: string,
): string {
  const params = new URLSearchParams(existingSearch);

  // Preserve journey param — never touch it
  const journey = params.get('journey');

  // Start fresh for our params, but keep any params we don't own
  const knownKeys = [
    'branch',
    'year',
    'events',
    'region',
    'person',
    'view',
    'approx',
    'arcs',
    'labels',
    'arcColor',
    'cam',
  ];
  knownKeys.forEach((key) => params.delete(key));

  // Only set non-default values
  if (state.branch) {
    params.set('branch', state.branch);
  }

  if (state.yearRange) {
    params.set('year', `${state.yearRange[0]}-${state.yearRange[1]}`);
  }

  if (!arraysEqual(state.eventTypes, DEFAULT_EVENT_TYPES)) {
    params.set('events', state.eventTypes.join(','));
  }

  if (state.regions.length > 0) {
    params.set('region', state.regions.join(','));
  }

  if (state.highlightPerson) {
    params.set('person', state.highlightPerson);
  }

  if (state.viewMode !== 'pins') {
    params.set('view', state.viewMode);
  }

  if (!state.showApproximate) {
    params.set('approx', '0');
  }

  if (!state.showArcs) {
    params.set('arcs', '0');
  }

  if (state.showLabels) {
    params.set('labels', '1');
  }

  if (state.arcColorMode !== 'default') {
    params.set('arcColor', state.arcColorMode);
  }

  if (state.camera) {
    const { lat, lng, height, heading, pitch } = state.camera;
    params.set(
      'cam',
      [lat, lng, height, heading, pitch]
        .map((n) => Number(n.toFixed(4)))
        .join(','),
    );
  }

  // Restore journey if it was present
  if (journey) {
    params.set('journey', journey);
  }

  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

// --- Hook ---

export interface UseGlobeViewStateReturn {
  state: GlobeViewState;
  setState: (partial: Partial<GlobeViewState>) => void;
  resetState: () => void;
}

export function useGlobeViewState(): UseGlobeViewStateReturn {
  const [state, setStateInternal] = useState<GlobeViewState>(() => {
    if (typeof window === 'undefined') return DEFAULT_STATE;
    return parseStateFromURL(window.location.search);
  });

  const initializedRef = useRef(false);
  const skipNextUrlSyncRef = useRef(true);

  // Sync state from URL on mount (handles SSR hydration mismatch)
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      const parsed = parseStateFromURL(window.location.search);
      setStateInternal(parsed);
    }
  }, []);

  // Write state to URL using replaceState
  const updateURL = useCallback((newState: GlobeViewState) => {
    const newSearch = serializeStateToURL(newState, window.location.search);
    const newURL = window.location.pathname + newSearch + window.location.hash;
    const currentURL =
      window.location.pathname + window.location.search + window.location.hash;
    if (currentURL !== newURL) {
      window.history.replaceState(null, '', newURL);
    }
  }, []);

  useEffect(() => {
    if (skipNextUrlSyncRef.current) {
      skipNextUrlSyncRef.current = false;
      return;
    }

    updateURL(state);
  }, [state, updateURL]);

  const setState = useCallback((partial: Partial<GlobeViewState>) => {
    setStateInternal((prev) => ({ ...prev, ...partial }));
  }, []);

  const resetState = useCallback(() => {
    setStateInternal(DEFAULT_STATE);
  }, []);

  return { state, setState, resetState };
}
