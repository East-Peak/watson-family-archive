'use client';

export interface JourneyStop {
  year: number | null;
  place: string;
  city: string | null;
  state: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  source: string | null;
  occupation: string | null;
}

interface JourneyPlayerProps {
  personName: string;
  birthYear: number | null;
  deathYear: number | null;
  stops: JourneyStop[];
  currentIndex: number;
  isPlaying: boolean;
  speed: 1 | 2 | 3;
  onIndexChange: (index: number) => void;
  onPlayPause: () => void;
  onSpeedChange: (speed: 1 | 2 | 3) => void;
  onClose: () => void;
}

export default function JourneyPlayer({
  personName,
  birthYear,
  deathYear,
  stops,
  currentIndex,
  isPlaying,
  speed,
  onIndexChange,
  onPlayPause,
  onSpeedChange,
  onClose,
}: JourneyPlayerProps) {
  const progress =
    stops.length > 1 ? (currentIndex / (stops.length - 1)) * 100 : 0;

  // Calculate age at current stop
  return (
    <div className="absolute bottom-0 left-0 right-0 z-20">
      {/* Gradient fade */}
      <div className="h-32 bg-gradient-to-t from-black/90 to-transparent" />

      {/* Controls bar */}
      <div className="bg-black/90 backdrop-blur-md px-6 pb-6 pt-2">
        {/* Progress bar - full width, minimal */}
        <div className="mb-6">
          <div
            className="h-1 bg-white/20 rounded-full cursor-pointer group"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const percent = (e.clientX - rect.left) / rect.width;
              const newIndex = Math.round(percent * (stops.length - 1));
              onIndexChange(Math.max(0, Math.min(stops.length - 1, newIndex)));
            }}
          >
            <div
              className="h-full bg-white rounded-full transition-all duration-300 relative"
              style={{ width: `${progress}%` }}
            >
              {/* Playhead */}
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>

          {/* Year markers below progress bar */}
          <div className="flex justify-between mt-2 text-xs text-white/40">
            {stops.map((stop, idx) => {
              const position =
                stops.length > 1 ? (idx / (stops.length - 1)) * 100 : 50;
              const isActive = idx === currentIndex;
              const isPast = idx < currentIndex;
              return (
                <button
                  key={idx}
                  onClick={() => onIndexChange(idx)}
                  className={`absolute transition-all ${
                    isActive
                      ? 'text-white font-medium scale-110'
                      : isPast
                        ? 'text-white/60'
                        : 'text-white/40 hover:text-white/70'
                  }`}
                  style={{
                    left: `${position}%`,
                    transform: `translateX(-50%) ${isActive ? 'scale(1.1)' : ''}`,
                  }}
                >
                  {stop.year || '?'}
                </button>
              );
            })}
          </div>
        </div>

        {/* Main controls row */}
        <div className="flex items-center justify-between">
          {/* Left: Person info */}
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-white">{personName}</h2>
            <p className="text-white/50 text-sm">
              {birthYear && deathYear
                ? `${birthYear}–${deathYear}`
                : birthYear
                  ? `b. ${birthYear}`
                  : ''}
            </p>
          </div>

          {/* Center: Play controls */}
          <div className="flex items-center gap-3">
            {/* Previous */}
            <button
              onClick={() => onIndexChange(Math.max(0, currentIndex - 1))}
              disabled={currentIndex === 0}
              className="p-2 text-white/70 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>

            {/* Play/Pause */}
            <button
              onClick={onPlayPause}
              className="p-3 rounded-full bg-white text-black hover:bg-white/90 transition-colors"
            >
              {isPlaying ? (
                <svg
                  className="w-6 h-6"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                </svg>
              ) : (
                <svg
                  className="w-6 h-6"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            {/* Next */}
            <button
              onClick={() =>
                onIndexChange(Math.min(stops.length - 1, currentIndex + 1))
              }
              disabled={currentIndex === stops.length - 1}
              className="p-2 text-white/70 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </div>

          {/* Right: Speed + Close */}
          <div className="flex-1 flex items-center justify-end gap-4">
            {/* Speed selector */}
            <div className="flex items-center gap-1 bg-white/10 rounded-full p-1">
              {([1, 2, 3] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => onSpeedChange(s)}
                  className={`px-2.5 py-0.5 rounded-full text-xs transition-colors ${
                    speed === s
                      ? 'bg-white text-black font-medium'
                      : 'text-white/50 hover:text-white'
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>

            {/* Close */}
            <button
              onClick={onClose}
              className="p-2 text-white/50 hover:text-white transition-colors"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
