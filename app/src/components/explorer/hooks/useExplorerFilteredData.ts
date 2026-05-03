'use client';

import { useState, useEffect, useMemo } from 'react';
import type {
  ExplorerPerson,
  ExplorerViewState,
  ExplorerFilterOptions,
} from '../types';

/**
 * Convert a birth year to its century bucket label.
 * e.g. 1850 → "1800s", 1900 → "1900s"
 */
function getCentury(year: number): string {
  return `${Math.floor(year / 100) * 100}s`;
}

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

interface UseExplorerFilteredDataResult {
  /** Full unfiltered dataset */
  data: ExplorerPerson[];
  /** Dataset after all active filters and sort applied */
  filteredData: ExplorerPerson[];
  /** Unique option values derived from the full dataset */
  filterOptions: ExplorerFilterOptions;
  /** Total number of people in the dataset */
  totalCount: number;
  /** Number of people after filtering */
  filteredCount: number;
  /** True while the initial fetch is in flight */
  loading: boolean;
}

/**
 * Fetch the explorer dataset once, derive filter options from the full set,
 * then apply all active filters and sort client-side.
 *
 * Mirrors the globe's `useGlobeFilteredData` pattern.
 */
export function useExplorerFilteredData(
  viewState: ExplorerViewState,
): UseExplorerFilteredDataResult {
  const [data, setData] = useState<ExplorerPerson[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch once on mount; use a cancelled flag to avoid state updates on unmount.
  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        const res = await fetch('/api/explorer');
        if (!res.ok) throw new Error(`Explorer API returned ${res.status}`);
        const json: ExplorerPerson[] = await res.json();
        if (!cancelled) {
          setData(json);
        }
      } catch (err) {
        console.error('useExplorerFilteredData: fetch failed', err);
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
  const filterOptions = useMemo<ExplorerFilterOptions>(() => {
    const centurySet = new Set<string>();
    const countrySet = new Set<string>();
    const sexSet = new Set<string>();
    const statusSet = new Set<string>();
    const surnameFreq = new Map<string, number>();

    for (const person of data) {
      // Centuries
      if (person.birthYear !== null) {
        centurySet.add(getCentury(person.birthYear));
      }

      // Countries
      if (person.originCountry) {
        countrySet.add(person.originCountry);
      }

      // Sex
      if (person.sex) {
        sexSet.add(person.sex);
      }

      // Statuses
      if (person.status) {
        statusSet.add(person.status);
      }

      // Surnames — track frequency for sorting
      if (person.surname) {
        surnameFreq.set(person.surname, (surnameFreq.get(person.surname) ?? 0) + 1);
      }
    }

    // Sort centuries chronologically
    const centuries = Array.from(centurySet).sort();

    // Sort countries and sex alphabetically
    const countries = Array.from(countrySet).sort((a, b) => a.localeCompare(b));
    const sexValues = Array.from(sexSet).sort((a, b) => a.localeCompare(b));
    const statuses = Array.from(statusSet).sort((a, b) => a.localeCompare(b));

    // Sort surnames by frequency descending, then alphabetically for ties
    const surnames = Array.from(surnameFreq.entries())
      .sort(([nameA, freqA], [nameB, freqB]) => {
        if (freqB !== freqA) return freqB - freqA;
        return nameA.localeCompare(nameB);
      })
      .map(([name]) => name);

    return { centuries, countries, sexValues, statuses, surnames };
  }, [data]);

  // Apply filters and sort to produce filteredData.
  const filteredData = useMemo<ExplorerPerson[]>(() => {
    const {
      query,
      centuries,
      countries,
      sex,
      statuses,
      completenessMin,
      completenessMax,
      validation,
      hasSources,
      // branch filter is not a data field — reserved for future use
      sortField,
      sortDirection,
    } = viewState;

    const queryLower = query.trim().toLowerCase();
    const dir: 1 | -1 = sortDirection === 'asc' ? 1 : -1;

    const result = data.filter((person) => {
      // Text search — fullName, maidenName, birthPlace, deathPlace
      if (queryLower) {
        const haystack = [
          person.fullName,
          person.maidenName,
          person.birthPlace,
          person.deathPlace,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(queryLower)) return false;
      }

      // Century filter
      if (centuries.length > 0) {
        if (person.birthYear === null) return false;
        if (!centuries.includes(getCentury(person.birthYear))) return false;
      }

      // Country filter
      if (countries.length > 0) {
        if (!person.originCountry || !countries.includes(person.originCountry)) return false;
      }

      // Sex filter
      if (sex && sex !== '') {
        if (person.sex !== sex) return false;
      }

      // Status filter
      if (statuses.length > 0) {
        if (!statuses.includes(person.status)) return false;
      }

      // Completeness range
      if (person.completenessScore < completenessMin || person.completenessScore > completenessMax) {
        return false;
      }

      // Validation status filter
      if (validation && validation !== '') {
        if (person.validationStatus !== validation) return false;
      }

      // Has sources filter
      if (hasSources === 'yes' && person.sourceCount < 1) return false;
      if (hasSources === 'no' && person.sourceCount > 0) return false;

      return true;
    });

    // Sort
    result.sort((a, b) => {
      switch (sortField) {
        case 'fullName':
          return compareNullableString(a.fullName, b.fullName, dir);
        case 'birthYear':
          return compareNullableNumber(a.birthYear, b.birthYear, dir);
        case 'deathYear':
          return compareNullableNumber(a.deathYear, b.deathYear, dir);
        case 'originCountry':
          return compareNullableString(a.originCountry, b.originCountry, dir);
        case 'sex':
          return compareNullableString(a.sex, b.sex, dir);
        case 'status':
          return compareNullableString(a.status, b.status, dir);
        case 'completenessScore':
          return (a.completenessScore - b.completenessScore) * dir;
        case 'sourceCount':
          return (a.sourceCount - b.sourceCount) * dir;
        case 'researchScore':
          return (a.researchScore - b.researchScore) * dir;
        case 'validationStatus':
          return compareNullableString(a.validationStatus, b.validationStatus, dir);
        default:
          return 0;
      }
    });

    return result;
  }, [data, viewState]);

  return {
    data,
    filteredData,
    filterOptions,
    totalCount: data.length,
    filteredCount: filteredData.length,
    loading,
  };
}
