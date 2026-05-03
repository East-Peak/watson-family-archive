'use client';

import { Entity, EllipseGraphics } from 'resium';
import { Cartesian3, Color, ColorMaterialProperty } from 'cesium';
import type { DensityBubble } from './hooks/useVisualizationMode';

interface DensityLayerProps {
  bubbles: DensityBubble[];
}

/**
 * Renders density bubbles as translucent Cesium EllipseGraphics.
 *
 * Each location is rendered as a colored ellipse with:
 * - Radius proportional to person count
 * - Color gradient: blue (1 person) -> yellow (5+) -> red (10+)
 * - Approximate locations are excluded upstream (by useVisualizationMode)
 */
export default function DensityLayer({ bubbles }: DensityLayerProps) {
  return (
    <>
      {bubbles.map((bubble) => {
        const fillColor = Color.fromCssColorString(bubble.color);
        const outlineColor = fillColor.withAlpha(
          Math.min(fillColor.alpha + 0.2, 0.9),
        );

        return (
          <Entity
            key={`density-${bubble.location.id}`}
            position={Cartesian3.fromDegrees(
              bubble.location.lng,
              bubble.location.lat,
            )}
            name={`${bubble.location.name} (${bubble.count} ${bubble.count === 1 ? 'person' : 'people'})`}
            description={`Density: ${bubble.count} people at ${bubble.location.name}`}
          >
            <EllipseGraphics
              semiMajorAxis={bubble.radius}
              semiMinorAxis={bubble.radius}
              material={new ColorMaterialProperty(fillColor)}
              outline
              outlineColor={outlineColor}
              outlineWidth={1.5}
              height={0}
            />
          </Entity>
        );
      })}
    </>
  );
}
