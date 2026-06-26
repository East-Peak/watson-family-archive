'use client';

import { useEffect, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';

interface Photo {
  filename: string;
  path: string;
  type: string;
  isPortrait: boolean;
  caption: string;
  date: string;
  people: string[];
}

interface Person {
  id: string;
  fullName: string;
}

interface LightboxProps {
  photos: Photo[];
  currentIndex: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  allPeople?: Person[];
}

export default function Lightbox({
  photos,
  currentIndex,
  onClose,
  onPrev,
  onNext,
  allPeople = [],
}: LightboxProps) {
  const photo = photos[currentIndex];

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onPrev();
      if (e.key === 'ArrowRight') onNext();
    },
    [onClose, onPrev, onNext],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [handleKeyDown]);

  // Get person names for tagged people
  const taggedPeople = photo.people
    .map((id) => allPeople.find((p) => p.id === id))
    .filter(Boolean) as Person[];

  // Format filename for display
  const displayName = photo.filename
    .replace(/\.(jpeg|jpg|png|pjpeg|pdf)$/i, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 text-white">
        <button
          onClick={onClose}
          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
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
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
        <span className="text-white/60">
          {currentIndex + 1} of {photos.length}
        </span>
        <div className="w-10" /> {/* Spacer */}
      </div>

      {/* Main image area */}
      <div className="flex-1 flex items-center justify-center relative px-16">
        {/* Previous button */}
        {photos.length > 1 && (
          <button
            onClick={onPrev}
            className="absolute left-4 p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
          >
            <svg
              className="w-6 h-6 text-white"
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
        )}

        {/* Image */}
        <div className="relative max-w-4xl max-h-[70vh] w-full h-full flex items-center justify-center">
          {photo.path.endsWith('.pdf') ? (
            <div className="bg-gray-800 rounded-lg p-8 text-center">
              <div className="text-6xl mb-4">📄</div>
              <p className="text-white mb-4">{displayName}</p>
              <a
                href={photo.path}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg"
              >
                Open PDF
              </a>
            </div>
          ) : (
            <Image
              src={photo.path}
              alt={displayName}
              fill
              className="object-contain"
              sizes="(max-width: 1024px) 100vw, 80vw"
              priority
            />
          )}
        </div>

        {/* Next button */}
        {photos.length > 1 && (
          <button
            onClick={onNext}
            className="absolute right-4 p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
          >
            <svg
              className="w-6 h-6 text-white"
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
        )}
      </div>

      {/* Footer with caption and tags */}
      <div className="p-6 text-center">
        <h3 className="text-xl text-white font-medium mb-2">{displayName}</h3>

        {photo.caption && <p className="text-gray-400 mb-3">{photo.caption}</p>}

        {photo.date && (
          <p className="text-gray-500 text-sm mb-3">{photo.date}</p>
        )}

        {taggedPeople.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2 mt-4">
            <span className="text-gray-500 text-sm">People in this photo:</span>
            {taggedPeople.map((person) => (
              <Link
                key={person.id}
                href={`/person/${person.id}`}
                onClick={onClose}
                className="px-3 py-1 bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 rounded-full text-sm transition-colors"
              >
                {person.fullName}
              </Link>
            ))}
          </div>
        )}

        <p className="text-gray-600 text-xs mt-4">
          Press ← → to navigate, Esc to close
        </p>
      </div>
    </div>
  );
}
