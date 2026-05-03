'use client';

import { useMemo } from 'react';
import type { GlobeData } from '../types';

export interface PersonHighlightResult {
  /** Set of location IDs that contain the highlighted person */
  locationIds: Set<number>;
  /** Set of arc indices (in globeData.arcs) that belong to the highlighted person */
  arcIndices: Set<number>;
  /** The person's display name, if found */
  personName: string | null;
  /** The person's birth year, if found */
  birthYear: number | null;
  /** The person's death year, if found */
  deathYear: number | null;
  /** Whether a person is currently highlighted */
  isActive: boolean;
}

/**
 * Hook that takes the current highlightPerson from viewState and the globe data,
 * and returns the set of location IDs and arc indices that belong to the highlighted person.
 *
 * Used by the visibility model to dim everything except the highlighted person's data.
 */
export function usePersonHighlight(
  highlightPerson: string | null,
  globeData: GlobeData | null,
): PersonHighlightResult {
  return useMemo(() => {
    const empty: PersonHighlightResult = {
      locationIds: new Set(),
      arcIndices: new Set(),
      personName: null,
      birthYear: null,
      deathYear: null,
      isActive: false,
    };

    if (!highlightPerson || !globeData) return empty;

    const locationIds = new Set<number>();
    const arcIndices = new Set<number>();
    let personName: string | null = null;
    let birthYear: number | null = null;
    let deathYear: number | null = null;

    // Find locations containing the highlighted person
    for (const location of globeData.locations) {
      for (const person of location.people) {
        if (person.id === highlightPerson) {
          locationIds.add(location.id);
          // Capture name/dates from the first match
          if (!personName) {
            personName = person.name;
            birthYear = person.birth;
            deathYear = person.death;
          }
        }
      }
    }

    // Find arcs belonging to the highlighted person
    for (let i = 0; i < globeData.arcs.length; i++) {
      if (globeData.arcs[i].person_id === highlightPerson) {
        arcIndices.add(i);
      }
    }

    return {
      locationIds,
      arcIndices,
      personName,
      birthYear,
      deathYear,
      isActive: true,
    };
  }, [highlightPerson, globeData]);
}
