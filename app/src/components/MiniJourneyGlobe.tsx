'use client';

import { useEffect, useRef, useCallback } from 'react';
import {
  Viewer,
  Entity,
  PointGraphics,
  PolylineGraphics,
  LabelGraphics,
} from 'resium';
import {
  Cartesian3,
  Cartesian2,
  Color,
  Rectangle,
  VerticalOrigin,
  LabelStyle,
  Ion,
  type Viewer as CesiumViewer,
} from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { generateArcPositions } from '@/components/globe/utils';
import Link from 'next/link';

// Cesium Ion access token (free tier)
Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJiOTg2YTI5Ni02NjRiLTQ2MjItOWRjNC0xYTA4YzY2YjJlZmMiLCJpZCI6Mzc0NDE3LCJpYXQiOjE3NjczNzQ3MDR9.L5_FUAZv68o80_t9Nr50GWQLiElvnuIysi1akPfMeK0';

declare global {
  interface Window {
    CESIUM_BASE_URL?: string;
  }
}

if (typeof window !== 'undefined') {
  window.CESIUM_BASE_URL = '/cesium';
}

interface JourneyStop {
  lat: number;
  lng: number;
  place: string;
  year: number | null;
  type: string;
}

interface MiniJourneyGlobeProps {
  personId: string;
  journeyStops: JourneyStop[];
  className?: string;
}

// Pin colors by index position in journey
const STOP_COLORS = [
  Color.fromCssColorString('#22c55e'), // green - start
  Color.fromCssColorString('#3b82f6'), // blue
  Color.fromCssColorString('#a855f7'), // purple
  Color.fromCssColorString('#f59e0b'), // amber
  Color.fromCssColorString('#ef4444'), // red
  Color.fromCssColorString('#06b6d4'), // cyan
  Color.fromCssColorString('#ec4899'), // pink
  Color.fromCssColorString('#84cc16'), // lime
];

function getStopColor(index: number, total: number): Color {
  if (index === 0) return STOP_COLORS[0]; // first = green
  if (index === total - 1) return STOP_COLORS[4]; // last = red
  return STOP_COLORS[index % STOP_COLORS.length];
}

export default function MiniJourneyGlobe({ personId, journeyStops, className }: MiniJourneyGlobeProps) {
  const viewerRef = useRef<{ cesiumElement?: CesiumViewer } | null>(null);

  // Auto-fit camera to bounding box of all stops on mount
  const handleViewerReady = useCallback(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer || journeyStops.length === 0) return;

    // Compute bounding box
    let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
    for (const stop of journeyStops) {
      if (stop.lng < west) west = stop.lng;
      if (stop.lng > east) east = stop.lng;
      if (stop.lat < south) south = stop.lat;
      if (stop.lat > north) north = stop.lat;
    }

    // Add padding (degrees)
    const lngPad = Math.max((east - west) * 0.3, 2);
    const latPad = Math.max((north - south) * 0.3, 2);
    west -= lngPad;
    east += lngPad;
    south -= latPad;
    north += latPad;

    // Clamp to valid ranges
    west = Math.max(west, -180);
    east = Math.min(east, 180);
    south = Math.max(south, -90);
    north = Math.min(north, 90);

    // Delay slightly to ensure viewer is fully initialized
    setTimeout(() => {
      viewer.camera.flyTo({
        destination: Rectangle.fromDegrees(west, south, east, north),
        duration: 1.5,
      });
    }, 200);
  }, [journeyStops]);

  // Trigger camera fit once viewer is mounted
  useEffect(() => {
    const timer = setTimeout(() => {
      handleViewerReady();
    }, 500);
    return () => clearTimeout(timer);
  }, [handleViewerReady]);

  // Don't render if fewer than 2 stops
  if (journeyStops.length < 2) {
    return null;
  }

  return (
    <div className={className}>
      {/* Globe container */}
      <div className="h-[350px] rounded-2xl overflow-hidden relative">
        <Viewer
          ref={viewerRef}
          full
          timeline={false}
          animation={false}
          baseLayerPicker={false}
          geocoder={false}
          homeButton={false}
          sceneModePicker={false}
          selectionIndicator={false}
          navigationHelpButton={false}
          fullscreenButton={false}
          infoBox={false}
        >
          {/* Journey stops as colored pins */}
          {journeyStops.map((stop, index) => {
            const color = getStopColor(index, journeyStops.length);
            const label = stop.year
              ? `${stop.place} (${stop.year})`
              : stop.place;

            return (
              <Entity
                key={`stop-${index}`}
                position={Cartesian3.fromDegrees(stop.lng, stop.lat, 100)}
                name={label}
              >
                <PointGraphics
                  pixelSize={10}
                  color={color}
                  outlineColor={Color.WHITE}
                  outlineWidth={2}

                />
                <LabelGraphics
                  text={label}
                  font="12px sans-serif"
                  fillColor={Color.WHITE}
                  outlineColor={Color.BLACK}
                  outlineWidth={2}
                  style={LabelStyle.FILL_AND_OUTLINE}
                  verticalOrigin={VerticalOrigin.BOTTOM}
                  pixelOffset={new Cartesian2(0, -14)}

                />
              </Entity>
            );
          })}

          {/* Arcs between consecutive stops */}
          {journeyStops.slice(0, -1).map((from, index) => {
            const to = journeyStops[index + 1];
            const positions = generateArcPositions(
              from.lat, from.lng,
              to.lat, to.lng
            );

            return (
              <Entity key={`arc-${index}`}>
                <PolylineGraphics
                  positions={positions}
                  width={2.5}
                  material={Color.fromCssColorString('rgba(255, 150, 100, 0.6)')}
                />
              </Entity>
            );
          })}
        </Viewer>
      </div>

      {/* View Full Globe link */}
      <div className="mt-3 text-center">
        <Link
          href={`/globe?journey=${personId}`}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-shield hover:text-white bg-shield/5 hover:bg-shield rounded-lg transition-all"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          View Full Globe
        </Link>
      </div>
    </div>
  );
}
