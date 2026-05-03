'use client';

import { useMemo } from 'react';
import {
  Entity,
  PolylineGraphics,
} from 'resium';
import { Color } from 'cesium';
import type { ArcColorMode, Arc, FilteredArc, GlobeData, JourneyModeData } from './types';
import { generateArcPositions } from './utils';
import { ERA_COLORS, FAMILY_ARC_COLORS } from './constants';

/** Opacity for dimmed entities */
const DIMMED_OPACITY = 0.12;

/** Get the century bucket color for an arc by departure year */
function getEraColor(year: number | undefined): Color {
  if (year === undefined) return Color.fromCssColorString(ERA_COLORS.unknown);
  if (year < 1700) return Color.fromCssColorString(ERA_COLORS.pre1700);
  if (year < 1800) return Color.fromCssColorString(ERA_COLORS['1700s']);
  if (year < 1900) return Color.fromCssColorString(ERA_COLORS['1800s']);
  if (year < 2000) return Color.fromCssColorString(ERA_COLORS['1900s']);
  return Color.fromCssColorString(ERA_COLORS['2000s']);
}

/** Get family color for an arc by looking up the person's surname */
function getFamilyColor(personId: string, globeData: GlobeData): Color {
  // Find the person in any location to get their name
  for (const loc of globeData.locations) {
    for (const person of loc.people) {
      if (person.id === personId) {
        const nameParts = person.name.trim().split(/\s+/);
        const surname = nameParts[nameParts.length - 1]?.toLowerCase() || '';
        const colorHex = FAMILY_ARC_COLORS[surname] || FAMILY_ARC_COLORS.default;
        return Color.fromCssColorString(colorHex);
      }
    }
  }
  return Color.fromCssColorString(FAMILY_ARC_COLORS.default);
}

interface MigrationArcsProps {
  arcs: FilteredArc[];
  selectedPersonId: string | null;
  selectedArc: Arc | null;
  journeyMode: JourneyModeData | null;
  isDensityMode: boolean;
  arcColorMode: ArcColorMode;
  globeData: GlobeData;
  onArcClick: (arc: Arc) => void;
}

export default function MigrationArcs({
  arcs,
  selectedPersonId,
  selectedArc,
  journeyMode,
  isDensityMode,
  arcColorMode,
  globeData,
  onArcClick,
}: MigrationArcsProps) {
  // Pre-compute family color lookup map when in family mode
  const familyColorMap = useMemo(() => {
    if (arcColorMode !== 'family') return null;
    const map = new Map<string, Color>();
    for (const arc of arcs) {
      if (!map.has(arc.person_id)) {
        map.set(arc.person_id, getFamilyColor(arc.person_id, globeData));
      }
    }
    return map;
  }, [arcColorMode, arcs, globeData]);

  return (
    <>
      {arcs.map((arc, index) => {
        const isPersonSelected = selectedPersonId === arc.person_id;
        const isArcSelected = selectedArc === arc;
        const isJourneyPerson = journeyMode && arc.person_id === journeyMode.personId;
        const isHighlighted = isPersonSelected || isArcSelected || isJourneyPerson;
        const isDimmed = arc.visibility === 'dimmed';

        let arcWidth = 1.5;
        let arcColor: Color;

        if (journeyMode) {
          if (isJourneyPerson) {
            arcWidth = 5;
            arcColor = Color.fromCssColorString('#6366f1');
          } else {
            arcWidth = 1.5;
            arcColor = Color.fromCssColorString('rgba(255, 150, 100, 0.25)');
          }
        } else if (isDensityMode) {
          arcWidth = 1;
          arcColor = Color.fromCssColorString('rgba(255, 150, 100, 0.05)');
        } else if (isHighlighted) {
          arcWidth = 4;
          arcColor = Color.fromCssColorString('#ff6b6b');
        } else if (isDimmed) {
          arcWidth = 1.5;
          arcColor = Color.fromCssColorString(`rgba(255, 150, 100, ${DIMMED_OPACITY})`);
        } else {
          // Normal state — apply color mode
          arcWidth = 1.5;
          if (arcColorMode === 'era') {
            arcColor = getEraColor(arc.from.year).withAlpha(0.6);
          } else if (arcColorMode === 'family' && familyColorMap) {
            arcColor = (familyColorMap.get(arc.person_id) || Color.fromCssColorString(FAMILY_ARC_COLORS.default)).withAlpha(0.6);
          } else {
            arcColor = Color.fromCssColorString('rgba(255, 150, 100, 0.4)');
          }
        }

        const positions = generateArcPositions(
          arc.from.lat, arc.from.lng,
          arc.to.lat, arc.to.lng,
        );

        return (
          <Entity
            key={`arc-${index}`}
            onClick={!isDimmed ? () => onArcClick(arc) : undefined}
          >
            <PolylineGraphics
              positions={positions}
              width={arcWidth}
              material={arcColor}
            />
          </Entity>
        );
      })}
    </>
  );
}
