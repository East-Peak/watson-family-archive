'use client';

import type { Arc } from '../types';
import { haversineDistance } from '../utils';

interface ArcDetailsPanelProps {
  arc: Arc;
  onClose: () => void;
}

export default function ArcDetailsPanel({ arc, onClose }: ArcDetailsPanelProps) {
  return (
    <div className="absolute top-20 left-4 right-4 bg-black/90 backdrop-blur-sm rounded-lg p-4 text-white z-10 max-w-[calc(100vw-2rem)] sm:right-auto sm:max-w-sm">
      <div className="flex items-start justify-between mb-3">
        <div className="font-semibold text-lg">Migration Path</div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white p-1 -mr-2 -mt-1"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="space-y-3">
        {/* From */}
        <div className="flex items-start gap-3">
          <div className="w-3 h-3 rounded-full bg-green-500 mt-1.5 flex-shrink-0" />
          <div>
            <div className="text-xs text-gray-400 uppercase">From</div>
            <div className="font-medium">{arc.from.place}</div>
            {arc.from.year && (
              <div className="text-sm text-gray-400">{arc.from.year}</div>
            )}
          </div>
        </div>

        {/* Arrow */}
        <div className="flex justify-center">
          <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </div>

        {/* To */}
        <div className="flex items-start gap-3">
          <div className="w-3 h-3 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
          <div>
            <div className="text-xs text-gray-400 uppercase">To</div>
            <div className="font-medium">{arc.to.place}</div>
            {arc.to.year && (
              <div className="text-sm text-gray-400">{arc.to.year}</div>
            )}
          </div>
        </div>

        {/* Distance */}
        <div className="pt-2 border-t border-gray-700">
          <div className="text-sm text-gray-400">
            Distance: {Math.round(haversineDistance(
              arc.from.lat, arc.from.lng,
              arc.to.lat, arc.to.lng,
            )).toLocaleString()} km
          </div>
        </div>

        {/* View Person Link */}
        <a
          href={`/person/${arc.person_id}`}
          className="block w-full text-center bg-blue-600 hover:bg-blue-500 text-white py-2 px-4 rounded-lg transition-colors text-sm mt-2"
        >
          View Person Story &rarr;
        </a>
      </div>
    </div>
  );
}
