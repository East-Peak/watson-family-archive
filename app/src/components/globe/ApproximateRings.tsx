'use client';

import { Entity, EllipseGraphics } from 'resium';
import { Cartesian3, Color, ColorMaterialProperty } from 'cesium';
import type { FilteredLocation } from './types';
import { APPROXIMATE_RING_RADIUS } from './constants';

interface ApproximateRingsProps {
  locations: FilteredLocation[];
  isDensityMode: boolean;
  getLocationColor: (
    location: Pick<
      FilteredLocation,
      'country' | 'name' | 'city' | 'state' | 'lat' | 'lng'
    >,
  ) => Color;
}

export default function ApproximateRings({
  locations,
  isDensityMode,
  getLocationColor,
}: ApproximateRingsProps) {
  return (
    <>
      {locations.map((location) => {
        const radius =
          APPROXIMATE_RING_RADIUS[location.precision] ||
          APPROXIMATE_RING_RADIUS.city;
        if (radius === 0) return null;

        const baseColor = getLocationColor(location);
        const isDimmed = location.visibility === 'dimmed';
        const ringAlpha = isDensityMode ? 0.06 : isDimmed ? 0.05 : 0.15;
        const outlineAlpha = isDensityMode ? 0.12 : isDimmed ? 0.1 : 0.35;

        return (
          <Entity
            key={`approx-${location.id}`}
            position={Cartesian3.fromDegrees(location.lng, location.lat)}
          >
            <EllipseGraphics
              semiMajorAxis={radius}
              semiMinorAxis={radius}
              material={
                new ColorMaterialProperty(baseColor.withAlpha(ringAlpha))
              }
              outline
              outlineColor={baseColor.withAlpha(outlineAlpha)}
              outlineWidth={1.5}
              height={0}
            />
          </Entity>
        );
      })}
    </>
  );
}
