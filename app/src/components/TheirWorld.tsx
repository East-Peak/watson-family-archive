'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import type { ContextualMediaItem } from '@/types/person';

interface TheirWorldProps {
  items: ContextualMediaItem[];
  personName: string;
}

// Badge display priority for chronological ordering
const BADGE_ORDER: Record<string, number> = {
  'Birth Place': 0,
  'Birthplace': 0,
  'Birth place': 0,
  'Marriage': 1,
  'Residence': 2,
  'Death Place': 3,
  'Burial': 4,
  'Memorial': 5,
};

function getBadgeOrder(badge?: string): number {
  if (!badge) return 99;
  return BADGE_ORDER[badge] ?? 99;
}

const typeIcons: Record<string, string> = {
  battle: '⚔️',
  military_unit: '🎖️',
  church: '⛪',
  town: '🏘️',
  ship: '⛵',
  building: '🏛️',
  cemetery: '🪦',
  event: '📜',
  region: '🗺️',
};

const typeColors: Record<string, string> = {
  town: 'bg-blue-100 border-blue-200 text-blue-700',
  church: 'bg-purple-100 border-purple-200 text-purple-700',
  cemetery: 'bg-gray-100 border-gray-200 text-gray-600',
  region: 'bg-emerald-100 border-emerald-200 text-emerald-700',
  building: 'bg-amber-100 border-amber-200 text-amber-700',
  event: 'bg-orange-100 border-orange-200 text-orange-700',
  battle: 'bg-red-100 border-red-200 text-red-700',
  military_unit: 'bg-amber-100 border-amber-200 text-amber-700',
  ship: 'bg-cyan-100 border-cyan-200 text-cyan-700',
};

function ContextCard({ item }: { item: ContextualMediaItem }) {
  const [showMap, setShowMap] = useState(false);
  const [imageError, setImageError] = useState(false);

  const icon = typeIcons[item.type] || '📍';
  const colorClass = typeColors[item.type] || 'bg-gray-100 border-gray-200 text-gray-600';
  const badgeLabel = item.badge ?? item.type.replace(/_/g, ' ');

  // Build Street View URL from googleMaps coordinates
  const coords = item.googleMaps?.coordinates;
  const streetViewUrl =
    coords?.lat != null && coords?.lng != null
      ? `https://www.google.com/maps?q=${coords.lat},${coords.lng}&layer=c`
      : null;

  return (
    <div className={`bg-white/80 backdrop-blur-md rounded-2xl overflow-hidden border border-white shadow-lg hover:shadow-xl transition-all group${item.featured ? ' md:col-span-2' : ''}`}>
      {/* Image or Map */}
      <div className="aspect-video relative bg-gray-100">
        {showMap && item.googleMaps?.embedUrl ? (
          <iframe
            src={item.googleMaps.embedUrl}
            width="100%"
            height="100%"
            style={{ border: 0 }}
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            className="absolute inset-0"
          />
        ) : item.wikimedia?.thumbnailUrl && !imageError ? (
          <>
            <Image
              src={item.wikimedia.thumbnailUrl}
              alt={item.name}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-500"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              onError={() => setImageError(true)}
            />
            {/* Subtle gradient overlay at bottom */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-6xl opacity-20">
            {icon}
          </div>
        )}

        {/* Type badge */}
        <div className={`absolute top-3 left-3 px-2 py-1 rounded-full text-xs font-medium border ${colorClass}`}>
          {icon} {badgeLabel}
        </div>

        {/* Toggle map button */}
        {item.googleMaps?.embedUrl && (
          <button
            onClick={() => setShowMap(!showMap)}
            className="absolute top-3 right-3 p-2 rounded-full bg-white/90 hover:bg-white border border-gray-200 text-gray-500 hover:text-gray-800 transition-colors shadow-sm"
            title={showMap ? 'Show image' : 'Show map'}
          >
            {showMap ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
            )}
          </button>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="font-semibold text-gray-900 text-lg mb-1 line-clamp-1">{item.name}</h3>
        {item.relevance && (
          <p className="text-shield font-medium text-sm mb-3">{item.relevance}</p>
        )}

        {/* Wikipedia summary */}
        {item.wikipedia?.summary && (
          <p className="text-gray-500 text-xs mb-3 line-clamp-2">
            {item.wikipedia.summary}
          </p>
        )}

        {/* Links */}
        <div className="flex flex-wrap gap-2">
          {item.wikipedia?.url && (
            <a
              href={item.wikipedia.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs text-gray-600 transition-colors"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm-.998 4h1.996v2h-1.996V6zm4.91 2.793l-1.414 1.414-1.415-1.414 1.414-1.414 1.415 1.414zM14 11v7h-4v-7h4zm-6.293.707l-1.414 1.414-1.414-1.414 1.414-1.414 1.414 1.414z"/>
              </svg>
              Wikipedia
            </a>
          )}
          {item.googleMaps?.url && (
            <a
              href={item.googleMaps.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 rounded-lg text-xs text-emerald-700 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Open in Maps
            </a>
          )}
          {streetViewUrl && (
            <a
              href={streetViewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 rounded-lg text-xs text-blue-700 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
              </svg>
              Street View
            </a>
          )}
        </div>

        {/* Attribution */}
        {item.wikimedia?.attribution && !showMap && (
          <p className="text-gray-400 text-[10px] mt-3 line-clamp-1">
            Photo: {item.wikimedia.attribution} ({item.wikimedia.license})
          </p>
        )}
      </div>
    </div>
  );
}

export default function TheirWorld({ items, personName }: TheirWorldProps) {
  if (!items || items.length === 0) return null;

  // Sort items chronologically by badge priority, then by available year
  const sorted = [...items].sort((a, b) => {
    const orderDiff = getBadgeOrder(a.badge) - getBadgeOrder(b.badge);
    if (orderDiff !== 0) return orderDiff;
    // Within same badge, sort by year from wikipedia coordinates (no year field on item itself)
    return 0;
  });

  return (
    <section>
      <div className="flex items-center gap-3 mb-6">
        <h2 className="text-sm font-bold text-shield uppercase tracking-widest">Their World</h2>
        <span className="text-gray-500 text-xs">Places &amp; events from {personName.split(' ')[0]}&apos;s life</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sorted.map((item) => (
          <ContextCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}
