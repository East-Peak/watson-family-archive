'use client';

import { useCallback, type RefObject } from 'react';
import { Rectangle, type Viewer as CesiumViewer } from 'cesium';
import type { FilteredLocation } from '../types';

interface UseFitCameraOptions {
  viewerRef: RefObject<{ cesiumElement?: CesiumViewer } | null>;
}

/**
 * Hook that provides a `fitToView()` function.
 * Computes a bounding rectangle from the provided locations and flies the camera to fit.
 */
export function useFitCamera({ viewerRef }: UseFitCameraOptions) {
  /**
   * Fly the camera to fit the given set of locations with padding.
   * If no locations are provided, does nothing.
   */
  const fitToLocations = useCallback(
    (locations: FilteredLocation[]) => {
      const viewer = viewerRef.current?.cesiumElement;
      if (!viewer || locations.length === 0) return;

      // Compute bounding box
      let minLat = Infinity;
      let maxLat = -Infinity;
      let minLng = Infinity;
      let maxLng = -Infinity;

      for (const loc of locations) {
        if (loc.lat < minLat) minLat = loc.lat;
        if (loc.lat > maxLat) maxLat = loc.lat;
        if (loc.lng < minLng) minLng = loc.lng;
        if (loc.lng > maxLng) maxLng = loc.lng;
      }

      // Add padding (roughly 10% of the extent, with a minimum)
      const latPad = Math.max((maxLat - minLat) * 0.15, 0.5);
      const lngPad = Math.max((maxLng - minLng) * 0.15, 0.5);

      const west = minLng - lngPad;
      const south = minLat - latPad;
      const east = maxLng + lngPad;
      const north = maxLat + latPad;

      const rectangle = Rectangle.fromDegrees(
        Math.max(west, -180),
        Math.max(south, -90),
        Math.min(east, 180),
        Math.min(north, 90),
      );

      viewer.camera.flyTo({
        destination: rectangle,
        duration: 1.5,
      });
    },
    [viewerRef],
  );

  /**
   * Fit camera to all non-dimmed (full visibility) locations from the provided array.
   */
  const fitToVisible = useCallback(
    (filteredLocations: FilteredLocation[]) => {
      const fullLocations = filteredLocations.filter((loc) => loc.visibility === 'full');
      if (fullLocations.length === 0) return;
      fitToLocations(fullLocations);
    },
    [fitToLocations],
  );

  return { fitToLocations, fitToVisible };
}
