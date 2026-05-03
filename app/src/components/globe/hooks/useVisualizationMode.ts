'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FilteredLocation, GlobeData, GlobeViewMode, Location } from '../types';

// --- Lineage graph types ---

export interface LineageAncestor {
  depth: number;
  parentOf: string[];
  lineageLabel: string;
}

export interface LineageGraph {
  viewerId: string;
  ancestors: Record<string, LineageAncestor>;
}

// --- Origin pin ---

export interface OriginPin {
  personId: string;
  personName: string;
  lineageLabel: string;
  location: Location;
  earliestYear: number | null;
}

// --- Generation color scale ---

/**
 * Map a generation depth to a color (CSS string).
 * Warm colors for deep ancestors (red at depth 10+), cool for recent (blue at depth 1).
 */
export function generationColor(depth: number): string {
  // Clamp depth to [0, 10] for color mapping
  const t = Math.min(depth, 10) / 10;

  // Gradient: blue (depth 0-1) -> cyan -> green -> yellow -> orange -> red (depth 10+)
  // Using HSL: hue from 240 (blue) down to 0 (red) as depth increases
  const hue = 240 * (1 - t);
  return `hsl(${Math.round(hue)}, 85%, 55%)`;
}

// --- Density helpers ---

export interface DensityBubble {
  location: Location;
  count: number;
  /** Radius in meters, proportional to person count */
  radius: number;
  /** CSS color string based on count */
  color: string;
}

/**
 * Compute density bubbles from locations, excluding approximate locations.
 * Respects timeline by only counting people whose events fall in the visible year range.
 */
export function computeDensityBubbles(
  locations: Array<Location | FilteredLocation>,
  yearRange: [number, number] | null,
): DensityBubble[] {
  const bubbles: DensityBubble[] = [];

  for (const loc of locations) {
    if ('visibility' in loc && loc.visibility !== 'full') continue;

    // Exclude approximate locations from density calculation
    if (loc.isApproximate) continue;

    // Count people visible in the current time range
    let count: number;
    if ('visiblePeopleCount' in loc) {
      count = loc.visiblePeopleCount;
    } else if (yearRange === null) {
      count = loc.people.length;
    } else {
      const [startYear, endYear] = yearRange;
      count = loc.people.filter((person) =>
        person.events.some(
          (e) => e.year !== null && e.year >= startYear && e.year <= endYear,
        ),
      ).length;
    }

    if (count === 0) continue;

    // Radius: base 20km + 15km per person, capped at 200km
    const radius = Math.min(20_000 + count * 15_000, 200_000);

    // Color: blue (1) -> yellow (5+) -> red (10+)
    let color: string;
    if (count >= 10) {
      color = 'rgba(239, 68, 68, 0.5)'; // red
    } else if (count >= 5) {
      // Interpolate yellow to red
      const t = (count - 5) / 5;
      const r = Math.round(234 + (239 - 234) * t);
      const g = Math.round(179 - (179 - 68) * t);
      const b = Math.round(8 + (68 - 8) * t);
      color = `rgba(${r}, ${g}, ${b}, 0.45)`;
    } else {
      // Interpolate blue to yellow
      const t = (count - 1) / 4;
      const r = Math.round(59 + (234 - 59) * t);
      const g = Math.round(130 + (179 - 130) * t);
      const b = Math.round(246 + (8 - 246) * t);
      color = `rgba(${r}, ${g}, ${b}, 0.4)`;
    }

    bubbles.push({ location: loc, count, radius, color });
  }

  return bubbles;
}

// --- Hook ---

export interface UseVisualizationModeResult {
  /** Current view mode */
  viewMode: GlobeViewMode;
  /** Whether viewer context exists (generation/origins available) */
  hasViewer: boolean;
  /** Lineage graph data (null when not fetched or unavailable) */
  lineageGraph: LineageGraph | null;
  /** Loading state for lineage data */
  lineageLoading: boolean;
  /** Generation depth map: personId -> depth (only populated in generation mode) */
  generationDepthMap: Map<string, number>;
  /** Origin pins (only populated in origins mode) */
  originPins: OriginPin[];
  /** Density bubbles (only populated in density mode) */
  densityBubbles: DensityBubble[];
}

/**
 * Hook managing the active visualization mode and its data.
 *
 * Modes:
 * - pins: default pin rendering (no extra data needed)
 * - density: density bubble rendering (computed from location data)
 * - generation: pins colored by generation depth (needs lineage graph)
 * - origins: one pin per terminal ancestor (needs lineage graph)
 */
export function useVisualizationMode(
  viewMode: GlobeViewMode,
  viewerId: string | null,
  globeData: GlobeData | null,
  filteredLocations: FilteredLocation[],
  yearRange: [number, number] | null,
): UseVisualizationModeResult {
  const [lineageGraph, setLineageGraph] = useState<LineageGraph | null>(null);
  const [lineageLoading, setLineageLoading] = useState(false);

  const hasViewer = Boolean(viewerId);

  // Fetch lineage graph when viewer is available and mode requires it
  useEffect(() => {
    if (!viewerId || (viewMode !== 'generation' && viewMode !== 'origins')) {
      return;
    }

    // Don't re-fetch if we already have data for this viewer
    if (lineageGraph?.viewerId === viewerId) {
      return;
    }

    let cancelled = false;
    setLineageLoading(true);

    fetch(`/api/viewer/lineage-graph?personId=${encodeURIComponent(viewerId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: LineageGraph | null) => {
        if (!cancelled && data) {
          setLineageGraph(data);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Failed to fetch lineage graph:', err);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLineageLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [viewerId, viewMode, lineageGraph?.viewerId]);

  // Generation depth map: personId -> depth
  const generationDepthMap = useMemo(() => {
    const map = new Map<string, number>();
    if (viewMode !== 'generation' || !lineageGraph) return map;

    for (const [personId, ancestor] of Object.entries(lineageGraph.ancestors)) {
      map.set(personId, ancestor.depth);
    }

    return map;
  }, [viewMode, lineageGraph]);

  // Origin pins: terminal ancestors with their earliest geocoded location
  const originPins = useMemo((): OriginPin[] => {
    if (viewMode !== 'origins' || !lineageGraph || !globeData) return [];

    const ancestors = lineageGraph.ancestors;

    // Terminal ancestors: people with no further parents in the lineage
    const allChildIds = new Set<string>();
    for (const ancestor of Object.values(ancestors)) {
      for (const childId of ancestor.parentOf) {
        allChildIds.add(childId);
      }
    }

    const terminalAncestorIds = Object.keys(ancestors).filter((id) => {
      // A terminal ancestor has no one listing them as a child
      // i.e., no one in the graph has them in their parentOf
      // Actually: a terminal ancestor is someone who has no parents in the graph.
      // parentOf lists their children. We need to find people not listed as children by anyone.
      // More precisely: terminal = not a child of anyone else in the lineage.
      // The ancestors map is keyed by personId. If personId is NOT in any other ancestor's parentOf,
      // it means nobody in the lineage is a parent of this person — so they ARE a child.
      // Wait, let me re-think: parentOf = this ancestor's children who are also in the lineage.
      // So a terminal ancestor has no further parents — meaning they are not in anyone else's parentOf?
      // No. parentOf means "I am a parent of these children." So if A.parentOf includes B,
      // it means A is a parent of B. A terminal ancestor is someone who doesn't appear
      // as a child anywhere — i.e., no one lists them in their parentOf.
      // Actually no: if A.parentOf = [B], it means B is A's child. So B has parent A.
      // A terminal ancestor is someone who has no parent in the graph.
      // A person has a parent if they appear in someone else's parentOf array.
      return !allChildIds.has(id);
    });

    // Build a name lookup from globe data
    const personNames = new Map<string, string>();
    for (const loc of globeData.locations) {
      for (const person of loc.people) {
        if (!personNames.has(person.id)) {
          personNames.set(person.id, person.name);
        }
      }
    }

    // For each terminal ancestor, find their earliest geocoded location
    const pins: OriginPin[] = [];

    for (const ancestorId of terminalAncestorIds) {
      const ancestorData = ancestors[ancestorId];

      // Find all locations where this person appears
      let earliestYear: number | null = null;
      let earliestLocation: Location | null = null;

      for (const loc of globeData.locations) {
        for (const person of loc.people) {
          if (person.id === ancestorId) {
            // Find the earliest event year at this location
            for (const event of person.events) {
              if (
                event.year !== null &&
                (earliestYear === null || event.year < earliestYear)
              ) {
                earliestYear = event.year;
                earliestLocation = loc;
              }
            }
            // If no events have years, use this location as fallback
            if (earliestLocation === null) {
              earliestLocation = loc;
            }
          }
        }
      }

      if (earliestLocation) {
        pins.push({
          personId: ancestorId,
          personName: personNames.get(ancestorId) || ancestorId,
          lineageLabel: ancestorData.lineageLabel,
          location: earliestLocation,
          earliestYear,
        });
      }
    }

    return pins;
  }, [viewMode, lineageGraph, globeData]);

  // Density bubbles
  const densityBubbles = useMemo((): DensityBubble[] => {
    if (viewMode !== 'density') return [];
    return computeDensityBubbles(filteredLocations, yearRange);
  }, [viewMode, filteredLocations, yearRange]);

  return {
    viewMode,
    hasViewer,
    lineageGraph,
    lineageLoading,
    generationDepthMap,
    originPins,
    densityBubbles,
  };
}
