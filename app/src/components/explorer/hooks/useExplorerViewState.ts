'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { ExplorerViewState, ExplorerViewMode, SortField, SortDirection, RecordSortField } from '../types';

// --- Defaults ---

export const DEFAULT_EXPLORER_VIEW_STATE: ExplorerViewState = {
  query: '',
  centuries: [],
  countries: [],
  sex: '',
  statuses: [],
  completenessMin: 0,
  completenessMax: 100,
  validation: '',
  hasSources: '',
  branch: '',
  sortField: 'fullName',
  sortDirection: 'asc',
  viewMode: 'people',
  recordQuery: '',
  recordTypes: [],
  tiers: [],
  yearMin: 0,
  yearMax: 9999,
  collectionSearch: '',
  participantSearch: '',
  recordSortField: 'year',
  recordSortDirection: 'asc',
};

export function resetPeopleExplorerState(state: ExplorerViewState): ExplorerViewState {
  return {
    ...state,
    query: DEFAULT_EXPLORER_VIEW_STATE.query,
    centuries: DEFAULT_EXPLORER_VIEW_STATE.centuries,
    countries: DEFAULT_EXPLORER_VIEW_STATE.countries,
    sex: DEFAULT_EXPLORER_VIEW_STATE.sex,
    statuses: DEFAULT_EXPLORER_VIEW_STATE.statuses,
    completenessMin: DEFAULT_EXPLORER_VIEW_STATE.completenessMin,
    completenessMax: DEFAULT_EXPLORER_VIEW_STATE.completenessMax,
    validation: DEFAULT_EXPLORER_VIEW_STATE.validation,
    hasSources: DEFAULT_EXPLORER_VIEW_STATE.hasSources,
    branch: DEFAULT_EXPLORER_VIEW_STATE.branch,
    sortField: DEFAULT_EXPLORER_VIEW_STATE.sortField,
    sortDirection: DEFAULT_EXPLORER_VIEW_STATE.sortDirection,
  };
}

export function resetRecordsExplorerState(state: ExplorerViewState): ExplorerViewState {
  return {
    ...state,
    recordQuery: DEFAULT_EXPLORER_VIEW_STATE.recordQuery,
    recordTypes: DEFAULT_EXPLORER_VIEW_STATE.recordTypes,
    tiers: DEFAULT_EXPLORER_VIEW_STATE.tiers,
    yearMin: DEFAULT_EXPLORER_VIEW_STATE.yearMin,
    yearMax: DEFAULT_EXPLORER_VIEW_STATE.yearMax,
    collectionSearch: DEFAULT_EXPLORER_VIEW_STATE.collectionSearch,
    participantSearch: DEFAULT_EXPLORER_VIEW_STATE.participantSearch,
    recordSortField: DEFAULT_EXPLORER_VIEW_STATE.recordSortField,
    recordSortDirection: DEFAULT_EXPLORER_VIEW_STATE.recordSortDirection,
  };
}

// --- URL Parsing ---

function parseCommaSeparated(value: string | null): string[] {
  if (!value) return [];
  return value.split(',').map((v) => v.trim()).filter(Boolean);
}

function parseCompleteness(value: string | null): { min: number; max: number } {
  const defaults = { min: 0, max: 100 };
  if (!value) return defaults;
  const match = value.match(/^(\d+)-(\d+)$/);
  if (!match) return defaults;
  const min = parseInt(match[1], 10);
  const max = parseInt(match[2], 10);
  if (isNaN(min) || isNaN(max) || min < 0 || max > 100 || min > max) return defaults;
  return { min, max };
}

function parseSortField(value: string | null): SortField {
  const valid: SortField[] = [
    'fullName',
    'birthYear',
    'deathYear',
    'originCountry',
    'sex',
    'status',
    'completenessScore',
    'sourceCount',
    'researchScore',
    'validationStatus',
  ];
  if (value && valid.includes(value as SortField)) {
    return value as SortField;
  }
  return 'fullName';
}

function parseSortDirection(value: string | null): SortDirection {
  if (value === 'desc') return 'desc';
  return 'asc';
}

function parseViewMode(value: string | null): ExplorerViewMode {
  if (value === 'records') return 'records';
  return 'people';
}

function parseRecordSortField(value: string | null): RecordSortField {
  const valid: RecordSortField[] = [
    'type', 'year', 'collection', 'place',
    'participantCount', 'tier', 'evidenceClass', 'linkedPeople',
  ];
  if (value && valid.includes(value as RecordSortField)) {
    return value as RecordSortField;
  }
  return 'year';
}

function parseIntWithDefault(value: string | null, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) return defaultValue;
  return parsed;
}

export function parseStateFromURL(search: string): ExplorerViewState {
  const params = new URLSearchParams(search);
  const completeness = parseCompleteness(params.get('completeness'));
  return {
    query: params.get('q') || '',
    centuries: parseCommaSeparated(params.get('century')),
    countries: parseCommaSeparated(params.get('country')),
    sex: params.get('sex') || '',
    statuses: parseCommaSeparated(params.get('status')),
    completenessMin: completeness.min,
    completenessMax: completeness.max,
    validation: params.get('validation') || '',
    hasSources: params.get('sources') || '',
    branch: params.get('branch') || '',
    sortField: parseSortField(params.get('sort')),
    sortDirection: parseSortDirection(params.get('dir')),
    viewMode: parseViewMode(params.get('view')),
    recordQuery: params.get('rq') || '',
    recordTypes: parseCommaSeparated(params.get('rt')),
    tiers: parseCommaSeparated(params.get('tier')),
    yearMin: parseIntWithDefault(params.get('ymin'), 0),
    yearMax: parseIntWithDefault(params.get('ymax'), 9999),
    collectionSearch: params.get('col') || '',
    participantSearch: params.get('pname') || '',
    recordSortField: parseRecordSortField(params.get('rsort')),
    recordSortDirection: parseSortDirection(params.get('rdir')),
  };
}

// --- URL Serialization ---

export function serializeStateToURL(state: ExplorerViewState, existingSearch: string): string {
  const params = new URLSearchParams(existingSearch);

  // Clear all owned keys before re-setting non-defaults
  const knownKeys = [
    'q', 'century', 'country', 'sex', 'status', 'completeness', 'validation',
    'sources', 'branch', 'sort', 'dir',
    'view', 'rq', 'rt', 'tier', 'ymin', 'ymax', 'col', 'pname', 'rsort', 'rdir',
  ];
  knownKeys.forEach((key) => params.delete(key));

  // Only set non-default values
  if (state.query) {
    params.set('q', state.query);
  }

  if (state.centuries.length > 0) {
    params.set('century', state.centuries.join(','));
  }

  if (state.countries.length > 0) {
    params.set('country', state.countries.join(','));
  }

  if (state.sex) {
    params.set('sex', state.sex);
  }

  if (state.statuses.length > 0) {
    params.set('status', state.statuses.join(','));
  }

  if (state.completenessMin !== 0 || state.completenessMax !== 100) {
    params.set('completeness', `${state.completenessMin}-${state.completenessMax}`);
  }

  if (state.validation) {
    params.set('validation', state.validation);
  }

  if (state.hasSources) {
    params.set('sources', state.hasSources);
  }

  if (state.branch) {
    params.set('branch', state.branch);
  }

  if (state.sortField !== 'fullName') {
    params.set('sort', state.sortField);
  }

  if (state.sortDirection !== 'asc') {
    params.set('dir', state.sortDirection);
  }

  // Records view mode fields
  if (state.viewMode !== 'people') {
    params.set('view', state.viewMode);
  }

  if (state.recordQuery) {
    params.set('rq', state.recordQuery);
  }

  if (state.recordTypes.length > 0) {
    params.set('rt', state.recordTypes.join(','));
  }

  if (state.tiers.length > 0) {
    params.set('tier', state.tiers.join(','));
  }

  if (state.yearMin !== 0) {
    params.set('ymin', String(state.yearMin));
  }

  if (state.yearMax !== 9999) {
    params.set('ymax', String(state.yearMax));
  }

  if (state.collectionSearch) {
    params.set('col', state.collectionSearch);
  }

  if (state.participantSearch) {
    params.set('pname', state.participantSearch);
  }

  if (state.recordSortField !== 'year') {
    params.set('rsort', state.recordSortField);
  }

  if (state.recordSortDirection !== 'asc') {
    params.set('rdir', state.recordSortDirection);
  }

  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

// --- Hook ---

export interface UseExplorerViewStateReturn {
  state: ExplorerViewState;
  setState: (partial: Partial<ExplorerViewState>) => void;
  resetState: () => void;
  resetPeopleState: () => void;
  resetRecordsState: () => void;
}

export function useExplorerViewState(): UseExplorerViewStateReturn {
  const [state, setStateInternal] = useState<ExplorerViewState>(() => {
    if (typeof window === 'undefined') return DEFAULT_EXPLORER_VIEW_STATE;
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
  const updateURL = useCallback((newState: ExplorerViewState) => {
    const newSearch = serializeStateToURL(newState, window.location.search);
    const newURL = window.location.pathname + newSearch + window.location.hash;
    const currentURL = window.location.pathname + window.location.search + window.location.hash;
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

  const setState = useCallback((partial: Partial<ExplorerViewState>) => {
    setStateInternal((prev) => ({ ...prev, ...partial }));
  }, []);

  const resetState = useCallback(() => {
    setStateInternal(DEFAULT_EXPLORER_VIEW_STATE);
  }, []);

  const resetPeopleState = useCallback(() => {
    setStateInternal((prev) => resetPeopleExplorerState(prev));
  }, []);

  const resetRecordsState = useCallback(() => {
    setStateInternal((prev) => resetRecordsExplorerState(prev));
  }, []);

  return { state, setState, resetState, resetPeopleState, resetRecordsState };
}
