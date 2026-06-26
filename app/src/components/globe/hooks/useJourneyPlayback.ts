'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { Cartesian3, type Viewer as CesiumViewer } from 'cesium';
import type { JourneyStop } from '@/components/JourneyPlayer';
import type { JourneyModeData } from '../types';

interface UseJourneyPlaybackOptions {
  journeyMode?: JourneyModeData | null;
  viewerRef: RefObject<{ cesiumElement?: CesiumViewer } | null>;
  onJourneyClose?: () => void;
}

function isSameLocation(
  stop1: JourneyStop | undefined,
  stop2: JourneyStop | undefined,
): boolean {
  if (!stop1 || !stop2 || !stop1.lat || !stop1.lng || !stop2.lat || !stop2.lng)
    return false;
  const latDiff = Math.abs(stop1.lat - stop2.lat);
  const lngDiff = Math.abs(stop1.lng - stop2.lng);
  return latDiff < 0.1 && lngDiff < 0.1;
}

export function useJourneyPlayback({
  journeyMode,
  viewerRef,
  onJourneyClose,
}: UseJourneyPlaybackOptions) {
  const [journeyIndex, setJourneyIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState<1 | 2 | 3>(1);
  const playTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (journeyMode) {
      setJourneyIndex(0);
      setIsPlaying(false);
    }
  }, [journeyMode]);

  useEffect(() => {
    if (journeyMode && viewerRef.current?.cesiumElement) {
      const stop = journeyMode.stops[journeyIndex];
      const prevStop =
        journeyIndex > 0 ? journeyMode.stops[journeyIndex - 1] : null;

      if (stop?.lat && stop?.lng) {
        const viewer = viewerRef.current.cesiumElement;
        const sameLocation = isSameLocation(prevStop || undefined, stop);
        if (sameLocation) return;

        const duration = journeyIndex === 0 ? 2.0 / playSpeed : 1.5 / playSpeed;
        viewer.camera.flyTo({
          destination: Cartesian3.fromDegrees(stop.lng, stop.lat, 50000),
          duration,
        });
      }
    }
  }, [journeyMode, journeyIndex, playSpeed, viewerRef]);

  useEffect(() => {
    if (journeyMode && isPlaying) {
      const advanceToNext = () => {
        setJourneyIndex((prev) => {
          if (prev >= journeyMode.stops.length - 1) {
            setIsPlaying(false);
            return prev;
          }

          const currentStop = journeyMode.stops[prev];
          const nextStop = journeyMode.stops[prev + 1];
          const sameLocation =
            currentStop &&
            nextStop &&
            Math.abs((currentStop.lat || 0) - (nextStop.lat || 0)) < 0.1 &&
            Math.abs((currentStop.lng || 0) - (nextStop.lng || 0)) < 0.1;

          const nextDelay = sameLocation ? 800 / playSpeed : 3500 / playSpeed;

          playTimeoutRef.current = setTimeout(advanceToNext, nextDelay);
          return prev + 1;
        });
      };

      const firstStop = journeyMode.stops[journeyIndex];
      const secondStop = journeyMode.stops[journeyIndex + 1];
      const firstSameLocation =
        firstStop &&
        secondStop &&
        Math.abs((firstStop.lat || 0) - (secondStop.lat || 0)) < 0.1 &&
        Math.abs((firstStop.lng || 0) - (secondStop.lng || 0)) < 0.1;

      const initialDelay = firstSameLocation
        ? 800 / playSpeed
        : 3500 / playSpeed;
      playTimeoutRef.current = setTimeout(advanceToNext, initialDelay);
    }

    return () => {
      if (playTimeoutRef.current) {
        clearTimeout(playTimeoutRef.current);
      }
    };
  }, [journeyMode, isPlaying, playSpeed, journeyIndex]);

  const handleJourneyPlayPause = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  const handleJourneyIndexChange = useCallback((index: number) => {
    setJourneyIndex(index);
  }, []);

  const handleJourneySpeedChange = useCallback((speed: 1 | 2 | 3) => {
    setPlaySpeed(speed);
  }, []);

  const handleJourneyClose = useCallback(() => {
    setIsPlaying(false);
    if (playTimeoutRef.current) {
      clearTimeout(playTimeoutRef.current);
    }
    onJourneyClose?.();
  }, [onJourneyClose]);

  return {
    journeyIndex,
    isPlaying,
    playSpeed,
    handleJourneyPlayPause,
    handleJourneyIndexChange,
    handleJourneySpeedChange,
    handleJourneyClose,
  };
}
