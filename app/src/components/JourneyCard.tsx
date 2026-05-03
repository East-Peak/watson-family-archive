'use client';

import { JourneyStop } from './JourneyPlayer';

interface JourneyCardProps {
  stop: JourneyStop;
  personName: string;
  birthYear: number | null;
  isFirst: boolean;
  isLast: boolean;
}

export default function JourneyCard({
  stop,
  personName,
  birthYear,
  isFirst,
  isLast,
}: JourneyCardProps) {
  const firstName = personName.split(' ')[0];
  const age = stop.year && birthYear ? stop.year - birthYear : null;

  // Generate narrative text based on context
  const getNarrative = (): string => {
    if (stop.source === 'birth') {
      return `${firstName} was born here`;
    }

    if (stop.source === 'death') {
      return `${firstName}'s final resting place`;
    }

    if (stop.source === 'marriage') {
      return `${firstName} was married here`;
    }

    if (stop.source === 'census') {
      return age ? `${firstName} at age ${age} (Census)` : `${firstName} lived here (Census)`;
    }

    if (isFirst && stop.year && birthYear && Math.abs(stop.year - birthYear) <= 1) {
      return `${firstName} was born here`;
    }

    if (isFirst) {
      return `The earliest record of ${firstName}`;
    }

    if (isLast && !stop.occupation) {
      return `${firstName}'s final recorded location`;
    }

    if (stop.occupation) {
      return `Working as ${stop.occupation.toLowerCase()}`;
    }

    if (age && age < 18) {
      return `${firstName} at age ${age}`;
    }

    if (age && age >= 65) {
      return `In ${firstName}'s later years`;
    }

    return `${firstName} lived here`;
  };

  // Get location display
  const getLocation = () => {
    if (stop.city && stop.city !== stop.country) {
      return stop.city;
    }
    return stop.place.split(',')[0];
  };

  const getSubLocation = () => {
    const parts = [stop.state, stop.country].filter(Boolean);
    return parts.join(', ') || stop.place;
  };

  return (
    <div className="absolute top-6 left-4 right-4 z-20 sm:top-8 sm:left-8 sm:right-auto">
      {/* Large year display */}
      <div className="mb-4">
        <span className="text-5xl font-bold text-white tracking-tight sm:text-7xl">
          {stop.year || '?'}
        </span>
      </div>

      {/* Location card */}
      <div className="bg-black/60 backdrop-blur-md rounded-xl px-5 py-4 max-w-sm border border-white/10">
        <h3 className="text-xl font-semibold text-white mb-1 sm:text-2xl">
          {getLocation()}
        </h3>
        <p className="text-white/50 text-sm mb-3">
          {getSubLocation()}
        </p>

        <p className="text-white/80">
          {getNarrative()}
          {age !== null && stop.source !== 'birth' && (
            <span className="text-white/40 ml-2">Age {age}</span>
          )}
        </p>
      </div>
    </div>
  );
}
