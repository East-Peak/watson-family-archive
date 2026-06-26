'use client';

import { useCallback, useEffect, useRef, type RefObject } from 'react';
import {
  Cartographic,
  Math as CesiumMath,
  Rectangle,
  type Viewer as CesiumViewer,
} from 'cesium';
import { DEFAULT_GLOBE_VIEW } from '../constants';
import type { GlobeCameraState, GlobeData, JourneyModeData } from '../types';

interface UseGlobeCameraOptions {
  viewerRef: RefObject<{ cesiumElement?: CesiumViewer } | null>;
  viewerReady: boolean;
  globeData: GlobeData | null;
  journeyMode?: JourneyModeData | null;
  /** Initial camera state from URL (restored on mount). */
  initialCamera?: GlobeCameraState | null;
}

/**
 * Read the current Cesium camera position and serialize to GlobeCameraState.
 */
export function serializeCamera(viewer: CesiumViewer): GlobeCameraState | null {
  try {
    const camera = viewer.camera;
    const cartographic = Cartographic.fromCartesian(camera.position);
    return {
      lat: CesiumMath.toDegrees(cartographic.latitude),
      lng: CesiumMath.toDegrees(cartographic.longitude),
      height: cartographic.height,
      heading: CesiumMath.toDegrees(camera.heading),
      pitch: CesiumMath.toDegrees(camera.pitch),
    };
  } catch {
    return null;
  }
}

/**
 * Restore the camera from a GlobeCameraState.
 */
export function deserializeCamera(
  viewer: CesiumViewer,
  state: GlobeCameraState,
): void {
  viewer.camera.setView({
    destination: Cartographic.toCartesian(
      Cartographic.fromDegrees(state.lng, state.lat, state.height),
    ),
    orientation: {
      heading: CesiumMath.toRadians(state.heading),
      pitch: CesiumMath.toRadians(state.pitch),
      roll: 0,
    },
  });
}

function getInitialDestination(globeData: GlobeData | null): Rectangle {
  if (!globeData || globeData.locations.length === 0) {
    return DEFAULT_GLOBE_VIEW;
  }

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;

  for (const location of globeData.locations) {
    if (!Number.isFinite(location.lat) || !Number.isFinite(location.lng))
      continue;

    minLat = Math.min(minLat, location.lat);
    maxLat = Math.max(maxLat, location.lat);
    minLng = Math.min(minLng, location.lng);
    maxLng = Math.max(maxLng, location.lng);
  }

  if (!Number.isFinite(minLat) || !Number.isFinite(minLng)) {
    return DEFAULT_GLOBE_VIEW;
  }

  const latPad = Math.max((maxLat - minLat) * 0.2, 8);
  const lngPad = Math.max((maxLng - minLng) * 0.2, 12);

  return Rectangle.fromDegrees(
    Math.max(minLng - lngPad, -180),
    Math.max(minLat - latPad, -90),
    Math.min(maxLng + lngPad, 180),
    Math.min(maxLat + latPad, 90),
  );
}

export function useGlobeCamera({
  viewerRef,
  viewerReady,
  globeData,
  journeyMode,
  initialCamera,
}: UseGlobeCameraOptions) {
  const hasSetInitialViewRef = useRef(false);
  const renderKickTimersRef = useRef<number[]>([]);

  // Set initial camera view from URL state or by fitting the current dataset.
  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (
      !viewerReady ||
      !viewer ||
      journeyMode ||
      hasSetInitialViewRef.current
    ) {
      return;
    }

    renderKickTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    renderKickTimersRef.current = [];

    const forceRender = () => {
      if (viewer.isDestroyed()) return;

      viewer.scene.requestRender();
      // In some browsers/harnesses, Cesium never begins imagery tile fetches
      // until the scene is explicitly rendered at least once.
      viewer.scene.render();
    };

    if (initialCamera) {
      deserializeCamera(viewer, initialCamera);
    } else {
      viewer.camera.flyTo({
        destination: getInitialDestination(globeData),
        duration: 0,
      });
    }

    window.requestAnimationFrame(forceRender);

    const renderKickDelays = Array.from(
      { length: 15 },
      (_, index) => (index + 1) * 200,
    );
    renderKickTimersRef.current = renderKickDelays.map((delay) =>
      window.setTimeout(forceRender, delay),
    );

    hasSetInitialViewRef.current = true;

    return () => {
      renderKickTimersRef.current.forEach((timer) =>
        window.clearTimeout(timer),
      );
      renderKickTimersRef.current = [];
    };
  }, [viewerRef, viewerReady, journeyMode, globeData, initialCamera]);

  /**
   * Get the current camera state for serialization into the URL.
   */
  const getCurrentCamera = useCallback((): GlobeCameraState | null => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return null;
    return serializeCamera(viewer);
  }, [viewerRef]);

  return { getCurrentCamera };
}
