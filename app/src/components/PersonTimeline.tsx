/**
 * Timeline component for person profile pages
 * Displays life events, journey stops, and family events
 */

import React from 'react';
import type { TimelineEvent, ParsedSource } from '@/types/person';

interface PersonTimelineProps {
  events: TimelineEvent[];
  sources?: ParsedSource[];
}

function findSourceForEvent(
  event: TimelineEvent,
  sources: ParsedSource[]
): ParsedSource | null {
  if (!event.year) return null;
  const typeMap: Record<string, string[]> = {
    birth: ['birth', 'vital'],
    death: ['death', 'vital', 'death_index', 'burial'],
    family: ['marriage', 'vital'],
    event: ['census', 'military', 'immigration'],
    place: ['census'],
  };
  const matchTypes = typeMap[event.type] || [];
  return sources.find(
    (s) => s.year === event.year && matchTypes.includes(s.recordType)
  ) ?? null;
}

export default function PersonTimeline({ events, sources = [] }: PersonTimelineProps) {
  if (events.length === 0) return null;

  return (
    <section className="bg-white/80 backdrop-blur-md rounded-2xl border border-white p-8 shadow-xl hover:shadow-2xl transition-shadow relative overflow-hidden group">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400/50 via-emerald-600/50 to-emerald-400/50"></div>
      <h2 className="text-sm font-bold text-shield uppercase tracking-widest mb-8 relative z-10">Timeline</h2>

      <div className="relative z-10">
        {/* Timeline line */}
        <div className="absolute left-3 top-2 bottom-2 w-px bg-gradient-to-b from-emerald-400 via-gray-300 to-gray-400" />

        <div className="space-y-6">
          {events.map((event, idx) => (
            <div key={idx} className={`relative flex gap-4 pl-10 ${event.isOutsideLifespan ? 'opacity-70' : ''}`}>
              {/* Dot */}
              <div className={`absolute left-0 w-6 h-6 rounded-full flex items-center justify-center ${event.type === 'birth'
                  ? 'bg-emerald-100 border border-emerald-400'
                  : event.type === 'death'
                    ? 'bg-gray-100 border border-gray-400'
                    : event.type === 'place'
                      ? 'bg-gray-100 border border-gray-300'
                      : event.type === 'family'
                        ? 'bg-amber-100 border border-amber-400'
                        : event.type === 'event'
                          ? 'bg-blue-100 border border-blue-300'
                          : 'bg-gray-100 border border-gray-300'
                }`}>
                {event.type === 'birth' ? (
                  <svg className="w-3 h-3 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" />
                  </svg>
                ) : event.type === 'death' ? (
                  <svg className="w-3 h-3 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <div className={`w-2 h-2 rounded-full ${event.type === 'place' ? 'bg-gray-400' : event.type === 'family' ? 'bg-amber-500' : event.type === 'event' ? 'bg-blue-400' : 'bg-gray-400'
                    }`} />
                )}
              </div>

              <div className="flex-1 pb-2">
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className={`text-lg font-semibold ${event.type === 'birth' ? 'text-emerald-600' : event.type === 'death' ? 'text-gray-500' : 'text-gray-900'}`}>
                    {event.year || '?'}
                  </span>
                  <span className={`font-medium ${event.type === 'birth' ? 'text-emerald-600' : event.type === 'death' ? 'text-gray-500' : event.isOutsideLifespan ? 'text-gray-400' : 'text-gray-700'}`}>
                    {event.title}
                  </span>
                  {event.type === 'family' && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-300">
                      Family
                    </span>
                  )}
                  {event.warning && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 border border-red-300 flex items-center gap-1">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      Data Issue
                    </span>
                  )}
                </div>
                {event.subtitle && (
                  <p className="text-gray-500 text-sm mt-1">{event.subtitle}</p>
                )}
                {event.warning && (
                  <p className="text-red-500 text-xs mt-1">{event.warning}</p>
                )}
                {(() => {
                  const citation = findSourceForEvent(event, sources);
                  if (!citation) return null;
                  return (
                    <span className="inline-flex items-center gap-1 mt-1 text-xs text-indigo-600 bg-indigo-50 border border-indigo-200 rounded px-1.5 py-0.5">
                      {citation.collection}
                      {citation.tier && <span className="text-indigo-400 ml-0.5">({citation.tier})</span>}
                    </span>
                  );
                })()}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
