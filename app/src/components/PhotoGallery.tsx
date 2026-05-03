'use client';

import { useState } from 'react';
import Image from 'next/image';
import Lightbox from './Lightbox';

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

interface PhotoGalleryProps {
  photos: Photo[];
  allPeople?: Person[];
}

export default function PhotoGallery({ photos, allPeople = [] }: PhotoGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Separate photos from documents
  const visualPhotos = photos.filter((p) =>
    ['photo', 'wedding', 'family_group', 'gravestone'].includes(p.type)
  );
  const documents = photos.filter((p) =>
    ['census', 'certificate', 'obituary', 'newspaper', 'legal_document'].includes(p.type)
  );

  const openLightbox = (index: number, isDocument: boolean) => {
    // Calculate global index
    const globalIndex = isDocument ? visualPhotos.length + index : index;
    setLightboxIndex(globalIndex);
  };

  const allMedia = [...visualPhotos, ...documents];

  if (photos.length === 0) {
    return null;
  }

  return (
    <>
      {/* Photos Section */}
      {visualPhotos.length > 0 && (
        <section className="mb-12">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <span>📷</span> Photos ({visualPhotos.length})
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {visualPhotos.map((photo, idx) => (
              <button
                key={photo.filename}
                onClick={() => openLightbox(idx, false)}
                className="group relative aspect-square bg-gray-800 rounded-xl overflow-hidden hover:ring-2 hover:ring-blue-500 transition-all"
              >
                <Image
                  src={photo.path}
                  alt={photo.filename.replace(/\.(jpeg|jpg|png|pjpeg)$/i, '').replace(/_/g, ' ')}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                  sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 25vw"
                />
                {/* Overlay on hover */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-end">
                  <div className="p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="text-white text-sm font-medium truncate">
                      {photo.filename.replace(/\.(jpeg|jpg|png|pjpeg)$/i, '').replace(/_/g, ' ').slice(0, 30)}
                    </p>
                    {photo.type !== 'photo' && (
                      <span className="text-xs text-gray-300 capitalize">{photo.type.replace('_', ' ')}</span>
                    )}
                  </div>
                </div>
                {/* Type badge */}
                {photo.type === 'gravestone' && (
                  <div className="absolute top-2 right-2 bg-black/70 px-2 py-1 rounded text-xs text-gray-300">
                    🪦
                  </div>
                )}
                {photo.type === 'wedding' && (
                  <div className="absolute top-2 right-2 bg-black/70 px-2 py-1 rounded text-xs text-gray-300">
                    💒
                  </div>
                )}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Documents Section */}
      {documents.length > 0 && (
        <section className="mb-12">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <span>📄</span> Records & Documents ({documents.length})
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {documents.map((doc, idx) => (
              <button
                key={doc.filename}
                onClick={() => openLightbox(idx, true)}
                className="group relative aspect-[3/4] bg-gray-800 rounded-xl overflow-hidden hover:ring-2 hover:ring-orange-500 transition-all"
              >
                {doc.path.endsWith('.pdf') ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-700">
                    <span className="text-4xl mb-2">📄</span>
                    <span className="text-xs text-gray-400">PDF</span>
                  </div>
                ) : (
                  <Image
                    src={doc.path}
                    alt={doc.filename.replace(/\.(jpeg|jpg|png|pjpeg|pdf)$/i, '').replace(/_/g, ' ')}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                    sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 25vw"
                  />
                )}
                {/* Overlay */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-end">
                  <div className="p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="text-white text-sm font-medium truncate">
                      {doc.filename.replace(/\.(jpeg|jpg|png|pjpeg|pdf)$/i, '').replace(/_/g, ' ').slice(0, 30)}
                    </p>
                    <span className="text-xs text-gray-300 capitalize">{doc.type.replace('_', ' ')}</span>
                  </div>
                </div>
                {/* Type icon */}
                <div className="absolute top-2 right-2 bg-black/70 px-2 py-1 rounded text-xs text-gray-300">
                  {doc.type === 'census' && '📋'}
                  {doc.type === 'certificate' && '📜'}
                  {doc.type === 'obituary' && '📰'}
                  {doc.type === 'newspaper' && '🗞️'}
                  {doc.type === 'legal_document' && '⚖️'}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <Lightbox
          photos={allMedia}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onPrev={() => setLightboxIndex((lightboxIndex - 1 + allMedia.length) % allMedia.length)}
          onNext={() => setLightboxIndex((lightboxIndex + 1) % allMedia.length)}
          allPeople={allPeople}
        />
      )}
    </>
  );
}
