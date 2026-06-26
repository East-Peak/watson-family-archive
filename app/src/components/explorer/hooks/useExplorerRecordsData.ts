'use client';

import { useState, useEffect, useMemo } from 'react';
import type {
  ExplorerRecord,
  ExplorerViewState,
  RecordsFilterOptions,
  RecordSortField,
} from '../types';

/**
 * Compare two nullable strings for sorting, pushing nulls to the end.
 */
function compareNullableString(
  a: string | null,
  b: string | null,
  dir: 1 | -1,
): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.localeCompare(b) * dir;
}

/**
 * Compare two nullable numbers for sorting, pushing nulls to the end.
 */
function compareNullableNumber(
  a: number | null,
  b: number | null,
  dir: 1 | -1,
): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return (a - b) * dir;
}

interface UseExplorerRecordsDataResult {
  /** Dataset after all active filters and sort applied */
  filteredData: ExplorerRecord[];
  /** Unique option values derived from the full dataset */
  filterOptions: RecordsFilterOptions;
  /** Total number of records in the dataset */
  totalCount: number;
  /** Number of records after filtering */
  filteredCount: number;
  /** True while the initial fetch is in flight */
  loading: boolean;
}

/**
 * Fetch the records dataset once, derive filter options from the full set,
 * then apply all active filters and sort client-side.
 *
 * Mirrors the `useExplorerFilteredData` pattern for the records view mode.
 */
export function useExplorerRecordsData(
  viewState: ExplorerViewState,
): UseExplorerRecordsDataResult {
  const [data, setData] = useState<ExplorerRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch once on mount; use a cancelled flag to avoid state updates on unmount.
  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        const res = await fetch('/api/explorer/records');
        if (!res.ok) throw new Error(`Records API returned ${res.status}`);
        const json: ExplorerRecord[] = await res.json();
        if (!cancelled) {
          setData(json);
        }
      } catch (err) {
        console.error('useExplorerRecordsData: fetch failed', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();

    return () => {
      cancelled = true;
    };
  }, []);

  // Derive filter option lists from the full dataset.
  const filterOptions = useMemo<RecordsFilterOptions>(() => {
    const typeSet = new Set<string>();
    const tierSet = new Set<string>();
    const countrySet = new Set<string>();
    let minYear: number | null = null;
    let maxYear: number | null = null;

    for (const record of data) {
      if (record.type) {
        typeSet.add(record.type);
      }

      if (record.tier) {
        tierSet.add(record.tier);
      }

      if (record.country) {
        countrySet.add(record.country);
      }

      if (record.year !== null) {
        if (minYear === null || record.year < minYear) minYear = record.year;
        if (maxYear === null || record.year > maxYear) maxYear = record.year;
      }
    }

    const types = Array.from(typeSet).sort((a, b) => a.localeCompare(b));
    const tiers = Array.from(tierSet).sort((a, b) => a.localeCompare(b));
    const countries = Array.from(countrySet).sort((a, b) => a.localeCompare(b));
    const yearRange: [number, number] | null =
      minYear !== null && maxYear !== null ? [minYear, maxYear] : null;

    return { types, tiers, yearRange, countries };
  }, [data]);

  // Apply filters and sort to produce filteredData.
  const filteredData = useMemo<ExplorerRecord[]>(() => {
    const {
      recordQuery,
      recordTypes,
      tiers,
      yearMin,
      yearMax,
      collectionSearch,
      participantSearch,
      recordSortField,
      recordSortDirection,
    } = viewState;

    const queryLower = recordQuery.trim().toLowerCase();
    const collectionLower = collectionSearch.trim().toLowerCase();
    const participantLower = participantSearch.trim().toLowerCase();
    const dir: 1 | -1 = recordSortDirection === 'asc' ? 1 : -1;

    const result = data.filter((record) => {
      // Text search — collection, place, participant names
      if (queryLower) {
        const haystack = [
          record.collection,
          record.place,
          ...record.participants.map((p) => p.name),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(queryLower)) return false;
      }

      // Record type filter (intersection)
      if (recordTypes.length > 0) {
        if (!recordTypes.includes(record.type)) return false;
      }

      // Tier filter (intersection)
      if (tiers.length > 0) {
        if (!record.tier || !tiers.includes(record.tier)) return false;
      }

      // Year range filter (use 0 and 9999 as "no filter" defaults)
      if (yearMin > 0 || yearMax < 9999) {
        if (record.year === null) return false;
        if (record.year < yearMin || record.year > yearMax) return false;
      }

      // Collection substring filter
      if (collectionLower) {
        if (!record.collection.toLowerCase().includes(collectionLower))
          return false;
      }

      // Participant name substring filter
      if (participantLower) {
        const hasMatch = record.participants.some((p) =>
          p.name.toLowerCase().includes(participantLower),
        );
        if (!hasMatch) return false;
      }

      return true;
    });

    // Sort
    result.sort((a, b) => {
      switch (recordSortField) {
        case 'type':
          return compareNullableString(a.type, b.type, dir);
        case 'year':
          return compareNullableNumber(a.year, b.year, dir);
        case 'collection':
          return compareNullableString(a.collection, b.collection, dir);
        case 'place':
          return compareNullableString(a.place, b.place, dir);
        case 'participantCount':
          return (a.participantCount - b.participantCount) * dir;
        case 'tier':
          return compareNullableString(a.tier, b.tier, dir);
        case 'evidenceClass':
          return compareNullableString(a.evidenceClass, b.evidenceClass, dir);
        case 'linkedPeople':
          return (a.linkedPeople.length - b.linkedPeople.length) * dir;
        default:
          return 0;
      }
    });

    return result;
  }, [data, viewState]);

  return {
    filteredData,
    filterOptions,
    totalCount: data.length,
    filteredCount: filteredData.length,
    loading,
  };
}
