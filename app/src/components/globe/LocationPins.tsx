'use client';

import {
  Entity,
  PointGraphics,
  LabelGraphics,
} from 'resium';
import {
  Cartesian3,
  Cartesian2,
  Color,
  VerticalOrigin,
  LabelStyle,
  DistanceDisplayCondition,
} from 'cesium';
import type { FilteredLocation, JourneyModeData, Location } from './types';
import { generationColor } from './hooks/useVisualizationMode';

/** Opacity for dimmed entities */
const DIMMED_OPACITY = 0.12;

interface LocationPinsProps {
  locations: FilteredLocation[];
  hoveredLocationId: number | null;
  selectedLocation: Location | null;
  journeyMode: JourneyModeData | null;
  isGenerationMode: boolean;
  generationDepthMap: Map<string, number>;
  getLocationColor: (location: Pick<Location, 'country' | 'name' | 'city' | 'state' | 'lat' | 'lng'>) => Color;
  onLocationClick: (location: Location) => void;
  showLabels: boolean;
}

export default function LocationPins({
  locations,
  hoveredLocationId,
  selectedLocation,
  journeyMode,
  isGenerationMode,
  generationDepthMap,
  getLocationColor,
  onLocationClick,
  showLabels,
}: LocationPinsProps) {
  return (
    <>
      {locations.map((location) => {
        const isHovered = hoveredLocationId === location.id;
        const isSelected = selectedLocation?.id === location.id;
        const isDimmed = location.visibility === 'dimmed';
        const interacting = !isDimmed && (isHovered || isSelected);
        const visiblePeopleCount = Math.max(location.visiblePeopleCount, 1);
        const visiblePeopleLabel = `${location.visiblePeopleCount} ${location.visiblePeopleCount === 1 ? 'person' : 'people'}`;

        let pointAlpha = 1.0;
        if (journeyMode) {
          pointAlpha = 0.15;
        } else if (isDimmed && !interacting) {
          pointAlpha = DIMMED_OPACITY;
        }

        let baseColor: Color;
        if (isGenerationMode) {
          let minDepth: number | null = null;
          for (const person of location.people) {
            const depth = generationDepthMap.get(person.id);
            if (depth !== undefined && (minDepth === null || depth < minDepth)) {
              minDepth = depth;
            }
          }
          if (minDepth !== null) {
            baseColor = Color.fromCssColorString(generationColor(minDepth));
          } else {
            baseColor = getLocationColor(location).withAlpha(0.3);
          }
        } else {
          baseColor = getLocationColor(location);
        }

        const pointColor = baseColor.withAlpha(pointAlpha);

        let outlineColor: Color;
        if (interacting) {
          outlineColor = Color.YELLOW;
        } else if (journeyMode) {
          outlineColor = Color.WHITE.withAlpha(0.15);
        } else if (isDimmed) {
          outlineColor = Color.WHITE.withAlpha(DIMMED_OPACITY);
        } else {
          outlineColor = Color.WHITE;
        }

        const labelAlpha = isDimmed && !interacting ? 0.3 : 0.9;

        return (
          <Entity
            key={location.id}
            position={Cartesian3.fromDegrees(location.lng, location.lat, 100)}
            name={location.name}
            description={isDimmed ? 'Outside current filters' : `${visiblePeopleLabel} in current view`}
            onClick={!isDimmed ? () => onLocationClick(location) : undefined}
          >
            <PointGraphics
              pixelSize={interacting ? 14 : Math.max(6, Math.min(12, visiblePeopleCount * 1.5))}
              color={pointColor}
              outlineColor={outlineColor}
              outlineWidth={interacting ? 2 : 1}
            />
            {/* Hover label — always shown on interact */}
            {interacting && (
              <LabelGraphics
                text={`${location.city || location.name}\n${visiblePeopleLabel}`}
                font="14px sans-serif"
                fillColor={Color.WHITE}
                outlineColor={Color.BLACK}
                outlineWidth={2}
                style={LabelStyle.FILL_AND_OUTLINE}
                verticalOrigin={VerticalOrigin.BOTTOM}
                pixelOffset={new Cartesian2(0, -20)}
              />
            )}
            {/* Always-on labels — only for locations with 2+ people, fades in as you zoom */}
            {showLabels && !interacting && !isDimmed && location.visiblePeopleCount >= 2 && (
              <LabelGraphics
                text={location.city || location.name}
                font={`${Math.max(11, Math.min(14, 10 + location.visiblePeopleCount))}px sans-serif`}
                distanceDisplayCondition={new DistanceDisplayCondition(0, 5_000_000)}
                fillColor={Color.WHITE.withAlpha(labelAlpha)}
                outlineColor={Color.BLACK.withAlpha(labelAlpha * 0.8)}
                outlineWidth={1.5}
                style={LabelStyle.FILL_AND_OUTLINE}
                verticalOrigin={VerticalOrigin.BOTTOM}
                pixelOffset={new Cartesian2(0, -14)}
              />
            )}
          </Entity>
        );
      })}
    </>
  );
}
