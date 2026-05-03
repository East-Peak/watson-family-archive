'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { GlobeData } from './types';

// --- Constants ---

const DEFAULT_MIN_YEAR = 1600;
const DEFAULT_MAX_YEAR = 2030;
const DECADE_SIZE = 10;
const SLIDING_WINDOW = 50;
const PLAY_INTERVAL_MS = 100; // base interval for 1x speed
const DEBOUNCE_MS = 16; // ~60fps

interface TimelineSliderProps {
  globeData: GlobeData | null;
  yearRange: [number, number] | null;
  playbackYearBounds?: [number, number] | null;
  onChange: (yearRange: [number, number] | null) => void;
  controlsTrigger?: ReactNode;
}

interface PlaybackWindow {
  min: number;
  span: number;
  maxStart: number;
}

// --- Histogram computation ---

function computeHistogram(globeData: GlobeData | null): Map<number, number> {
  const counts = new Map<number, number>();
  if (!globeData) return counts;

  for (const location of globeData.locations) {
    for (const person of location.people) {
      for (const event of person.events) {
        if (event.year != null) {
          const decade = Math.floor(event.year / DECADE_SIZE) * DECADE_SIZE;
          counts.set(decade, (counts.get(decade) || 0) + 1);
        }
      }
    }
  }
  return counts;
}

function getHistogramBars(histogram: Map<number, number>): { decade: number; count: number; pct: number }[] {
  const bars: { decade: number; count: number; pct: number }[] = [];
  const maxCount = Math.max(...Array.from(histogram.values()), 1);

  const domainYears = Array.from(histogram.keys());
  const minYear = domainYears.length > 0 ? Math.min(...domainYears) : DEFAULT_MIN_YEAR;
  const maxYear = domainYears.length > 0 ? Math.max(...domainYears) : DEFAULT_MAX_YEAR;
  const domainStart = Math.floor(minYear / DECADE_SIZE) * DECADE_SIZE;
  const domainEnd = Math.ceil(maxYear / DECADE_SIZE) * DECADE_SIZE + DECADE_SIZE;

  for (let decade = domainStart; decade < domainEnd; decade += DECADE_SIZE) {
    const count = histogram.get(decade) || 0;
    bars.push({ decade, count, pct: count / maxCount });
  }
  return bars;
}

function deriveYearDomain(globeData: GlobeData | null): [number, number] {
  if (!globeData) {
    return [DEFAULT_MIN_YEAR, DEFAULT_MAX_YEAR];
  }

  const years: number[] = [];
  for (const location of globeData.locations) {
    for (const person of location.people) {
      for (const event of person.events) {
        if (event.year != null) {
          years.push(event.year);
        }
      }
    }
  }

  if (years.length === 0) {
    return [DEFAULT_MIN_YEAR, DEFAULT_MAX_YEAR];
  }

  const minYear = Math.floor(Math.min(...years) / DECADE_SIZE) * DECADE_SIZE;
  const maxYear = Math.ceil(Math.max(...years) / DECADE_SIZE) * DECADE_SIZE;

  return [minYear, Math.max(minYear + DECADE_SIZE, maxYear)];
}

function clampRangeToDomain(
  range: [number, number],
  domainMin: number,
  domainMax: number,
): [number, number] {
  const maxStart = Math.max(domainMin, domainMax - DECADE_SIZE);
  const start = Math.min(Math.max(range[0], domainMin), maxStart);
  const end = Math.min(domainMax, Math.max(range[1], start + DECADE_SIZE));
  return [start, end];
}

function getTickStep(totalSpan: number): number {
  if (totalSpan > 600) return 100;
  if (totalSpan > 250) return 50;
  if (totalSpan > 120) return 25;
  return 10;
}

function getTickYears(domainMin: number, domainMax: number): number[] {
  const totalSpan = domainMax - domainMin;
  const step = getTickStep(totalSpan);
  const ticks = new Set<number>([domainMin, domainMax]);
  const firstAligned = Math.ceil(domainMin / step) * step;

  for (let year = firstAligned; year <= domainMax; year += step) {
    ticks.add(year);
  }

  return Array.from(ticks).sort((a, b) => a - b);
}

function buildPlaybackWindow(
  bounds: [number, number] | null,
  domainMin: number,
  domainMax: number,
): PlaybackWindow {
  const min = bounds?.[0] ?? domainMin;
  const max = bounds?.[1] ?? domainMax;
  const safeMin = Math.min(min, max);
  const safeMax = Math.max(min, max);
  const availableSpan = Math.max(safeMax - safeMin, 0);

  let span: number;
  if (availableSpan > SLIDING_WINDOW) {
    span = SLIDING_WINDOW;
  } else if (availableSpan > 1) {
    span = Math.max(Math.floor(availableSpan / 2), 1);
  } else {
    span = 1;
  }

  const maxStart = availableSpan > 0 ? safeMax - span : safeMin;

  return { min: safeMin, span, maxStart };
}

// --- Component ---

export default function TimelineSlider({
  globeData,
  yearRange,
  playbackYearBounds = null,
  onChange,
  controlsTrigger,
}: TimelineSliderProps) {
  const [domainMin, domainMax] = useMemo(() => deriveYearDomain(globeData), [globeData]);
  const [localRange, setLocalRange] = useState<[number, number]>(() =>
    clampRangeToDomain(yearRange || [domainMin, domainMax], domainMin, domainMax),
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState<1 | 2 | 3>(1);
  const [playbackSessionWindow, setPlaybackSessionWindow] = useState<PlaybackWindow | null>(null);
  const playRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localRangeRef = useRef<[number, number]>(localRange);
  const livePlaybackWindow = useMemo(
    () => buildPlaybackWindow(playbackYearBounds, domainMin, domainMax),
    [playbackYearBounds, domainMin, domainMax],
  );
  const activePlaybackWindow = playbackSessionWindow ?? livePlaybackWindow;

  const buildPlaybackRange = useCallback(
    (startYear: number, playbackWindow: PlaybackWindow): [number, number] => {
      const clampedStart = Math.min(
        Math.max(startYear, playbackWindow.min),
        playbackWindow.maxStart,
      );
      return [clampedStart, clampedStart + playbackWindow.span];
    },
    [],
  );

  const normalizeRange = useCallback(
    (range: [number, number]): [number, number] | null => {
      if (range[0] <= domainMin && range[1] >= domainMax) {
        return null;
      }
      return range;
    },
    [domainMin, domainMax],
  );

  const emitRangeChange = useCallback(
    (range: [number, number]) => {
      onChange(normalizeRange(range));
    },
    [onChange, normalizeRange],
  );

  // Sync local range when prop changes externally
  useEffect(() => {
    if (yearRange) {
      setLocalRange(clampRangeToDomain(yearRange, domainMin, domainMax));
    } else {
      setLocalRange([domainMin, domainMax]);
    }
  }, [yearRange, domainMin, domainMax]);

  useEffect(() => {
    localRangeRef.current = localRange;
  }, [localRange]);

  const histogram = useMemo(() => computeHistogram(globeData), [globeData]);
  const bars = useMemo(() => getHistogramBars(histogram), [histogram]);
  const tickYears = useMemo(() => getTickYears(domainMin, domainMax), [domainMin, domainMax]);

  // Debounced commit to parent
  const commitRange = useCallback(
    (range: [number, number]) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        emitRangeChange(range);
      }, DEBOUNCE_MS);
    },
    [emitRangeChange],
  );

  // Handle dragging the start handle
  const handleStartChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newStart = parseInt(e.target.value, 10);
      const clamped = Math.min(newStart, localRange[1] - DECADE_SIZE);
      const next = clampRangeToDomain([clamped, localRange[1]], domainMin, domainMax);
      setLocalRange(next);
      commitRange(next);
    },
    [localRange, commitRange, domainMin, domainMax],
  );

  // Handle dragging the end handle
  const handleEndChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newEnd = parseInt(e.target.value, 10);
      const clamped = Math.max(newEnd, localRange[0] + DECADE_SIZE);
      const next = clampRangeToDomain([localRange[0], clamped], domainMin, domainMax);
      setLocalRange(next);
      commitRange(next);
    },
    [localRange, commitRange, domainMin, domainMax],
  );

  // Play animation
  useEffect(() => {
    if (!isPlaying) {
      if (playRef.current) {
        clearInterval(playRef.current);
        playRef.current = null;
      }
      return;
    }

    const interval = PLAY_INTERVAL_MS / playSpeed;
    playRef.current = setInterval(() => {
      const currentRange = localRangeRef.current;
      let newStart = currentRange[0] + 1;
      if (newStart > activePlaybackWindow.maxStart) {
        newStart = activePlaybackWindow.min;
      }

      const next = buildPlaybackRange(newStart, activePlaybackWindow);
      localRangeRef.current = next;
      setLocalRange(next);
      emitRangeChange(next);
    }, interval);

    return () => {
      if (playRef.current) {
        clearInterval(playRef.current);
        playRef.current = null;
      }
    };
  }, [isPlaying, playSpeed, emitRangeChange, activePlaybackWindow, buildPlaybackRange]);

  const handlePlayPause = useCallback(() => {
    if (!isPlaying) {
      setPlaybackSessionWindow(livePlaybackWindow);
      // If at full range, start from beginning
      if (localRange[0] <= domainMin && localRange[1] >= domainMax) {
        const next = buildPlaybackRange(livePlaybackWindow.min, livePlaybackWindow);
        localRangeRef.current = next;
        setLocalRange(next);
        emitRangeChange(next);
      }
    } else {
      setPlaybackSessionWindow(null);
    }
    setIsPlaying((prev) => !prev);
  }, [
    isPlaying,
    localRange,
    buildPlaybackRange,
    livePlaybackWindow,
    domainMin,
    domainMax,
    emitRangeChange,
  ]);

  const handleSpeedCycle = useCallback(() => {
    setPlaySpeed((prev) => {
      if (prev === 1) return 2;
      if (prev === 2) return 3;
      return 1;
    });
  }, []);

  const handleReset = useCallback(() => {
    setIsPlaying(false);
    setPlaybackSessionWindow(null);
    localRangeRef.current = [domainMin, domainMax];
    setLocalRange([domainMin, domainMax]);
    onChange(null);
  }, [onChange, domainMin, domainMax]);

  // Compute selected range as percentage for highlight bar
  const totalSpan = domainMax - domainMin;
  const leftPct = ((localRange[0] - domainMin) / totalSpan) * 100;
  const widthPct = ((localRange[1] - localRange[0]) / totalSpan) * 100;

  const isFiltered = yearRange !== null;
  const rangeLabel = isFiltered
    ? `${localRange[0]} \u2014 ${localRange[1]}`
    : 'All Years';

  return (
    <div className="bg-black/60 backdrop-blur-md border-t border-white/10 px-4 py-3">
      {/* Controls row */}
      <div className="mb-2 flex flex-wrap items-center gap-2 sm:flex-nowrap sm:gap-3">
        {controlsTrigger}
        {/* Play button */}
        <button
          onClick={handlePlayPause}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors flex-shrink-0"
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* Speed */}
        <button
          onClick={handleSpeedCycle}
          className="px-2 py-1 rounded text-xs font-mono text-white/60 hover:text-white bg-white/5 hover:bg-white/10 transition-colors flex-shrink-0"
          title="Playback speed"
        >
          {playSpeed}x
        </button>

        {/* Range label */}
        <span className="order-last w-full text-center text-xs font-medium tabular-nums text-white/80 sm:order-none sm:w-auto sm:min-w-[120px] sm:text-sm">
          {rangeLabel}
        </span>

        {/* Spacer */}
        <div className="hidden flex-1 sm:block" />

        {/* Reset */}
        {isFiltered && (
          <button
            onClick={handleReset}
            className="px-2.5 py-1 rounded text-xs text-white/60 hover:text-white bg-white/5 hover:bg-white/10 transition-colors flex-shrink-0"
          >
            Reset
          </button>
        )}
      </div>

      {/* Slider area with histogram */}
      <div className="relative h-16">
        {/* Histogram bars */}
        <div className="absolute inset-0 flex items-end gap-px">
          {bars.map(({ decade, pct, count }) => {
            const inRange = decade >= localRange[0] && decade < localRange[1];
            return (
              <div
                key={decade}
                className="flex-1 transition-opacity duration-100"
                style={{
                  height: `${Math.max(pct * 100, count > 0 ? 4 : 0)}%`,
                  backgroundColor: inRange ? 'rgba(99, 102, 241, 0.5)' : 'rgba(255, 255, 255, 0.1)',
                  borderRadius: '2px 2px 0 0',
                }}
                title={`${decade}s: ${count} events`}
              />
            );
          })}
        </div>

        {/* Selected range highlight overlay */}
        <div
          className="absolute bottom-0 h-1 bg-indigo-500/80 rounded-full pointer-events-none"
          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
        />

        {/* Range sliders — stacked on top of histogram */}
        <div className="absolute inset-0">
          {/* Start handle */}
          <input
            type="range"
            min={domainMin}
            max={domainMax}
            step={1}
            value={localRange[0]}
            onChange={handleStartChange}
            className="timeline-range-input absolute inset-0 w-full h-full appearance-none bg-transparent cursor-pointer pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-8 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded [&::-webkit-slider-thumb]:cursor-ew-resize [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:z-20 [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-8 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:rounded [&::-moz-range-thumb]:cursor-ew-resize [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:shadow-md"
            style={{ zIndex: localRange[0] > domainMax - 50 ? 30 : 20 }}
          />
          {/* End handle */}
          <input
            type="range"
            min={domainMin}
            max={domainMax}
            step={1}
            value={localRange[1]}
            onChange={handleEndChange}
            className="timeline-range-input absolute inset-0 w-full h-full appearance-none bg-transparent cursor-pointer pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-8 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded [&::-webkit-slider-thumb]:cursor-ew-resize [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:z-20 [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-8 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:rounded [&::-moz-range-thumb]:cursor-ew-resize [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:shadow-md"
            style={{ zIndex: 20 }}
          />
        </div>

        {/* Dynamic tick marks */}
        <div className="absolute bottom-0 left-0 right-0 pointer-events-none">
          {tickYears.map((tickYear) => {
            const pct = ((tickYear - domainMin) / totalSpan) * 100;
            return (
              <div
                key={tickYear}
                className="absolute bottom-0"
                style={{ left: `${pct}%` }}
              >
                <div className="w-px h-3 bg-white/30" />
                <span className="absolute top-full mt-0.5 text-[10px] text-white/40 -translate-x-1/2 tabular-nums">
                  {tickYear}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
