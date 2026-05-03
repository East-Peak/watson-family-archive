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
} from 'cesium';
import type { Location } from './types';
import type { OriginPin } from './hooks/useVisualizationMode';

interface OriginPinsProps {
  originPins: OriginPin[];
  onLocationClick: (location: Location) => void;
}

export default function OriginPins({ originPins, onLocationClick }: OriginPinsProps) {
  return (
    <>
      {originPins.map((pin) => (
        <Entity
          key={`origin-${pin.personId}`}
          position={Cartesian3.fromDegrees(pin.location.lng, pin.location.lat, 100)}
          name={pin.personName}
          description={`${pin.lineageLabel} lineage${pin.earliestYear ? ` (${pin.earliestYear})` : ''}`}
          onClick={() => onLocationClick(pin.location)}
        >
          <PointGraphics
            pixelSize={12}
            color={Color.fromCssColorString('#f59e0b')}
            outlineColor={Color.WHITE}
            outlineWidth={2}
          />
          <LabelGraphics
            text={`${pin.personName}\n${pin.lineageLabel}${pin.earliestYear ? ` (${pin.earliestYear})` : ''}`}
            font="13px sans-serif"
            fillColor={Color.WHITE}
            outlineColor={Color.BLACK}
            outlineWidth={2}
            style={LabelStyle.FILL_AND_OUTLINE}
            verticalOrigin={VerticalOrigin.BOTTOM}
            pixelOffset={new Cartesian2(0, -18)}
          />
        </Entity>
      ))}
    </>
  );
}
