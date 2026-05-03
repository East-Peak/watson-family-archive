'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';

interface GlobeCardProps {
  src: string;
  alt: string;
  caption: string;
}

/**
 * Wraps the globe screenshot with a one-time fade-in. The fade triggers
 * only when:
 *   1. the card has entered the viewport (intersection observer), AND
 *   2. the underlying image has finished loading (`onLoad` fired)
 *
 * Both conditions must be met to avoid the fade racing ahead of image
 * decode (which would produce a visible pop on slow connections).
 *
 * The fade runs exactly once per page load. There is no looping animation.
 */
export function GlobeCard({ src, alt, caption }: GlobeCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [intersected, setIntersected] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const visible = intersected && loaded;

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    if (typeof IntersectionObserver === 'undefined') {
      // Defensive fallback — every modern browser ships IntersectionObserver,
      // but if it's missing we just show the image immediately.
      setIntersected(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setIntersected(true);
            observer.disconnect();
          }
        }
      },
      { threshold: 0.2 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <figure
      ref={containerRef}
      className="md:col-span-2 md:row-span-2 bg-white/5 border border-white/10 rounded-lg overflow-hidden flex flex-col min-h-[420px]"
    >
      {/* Image area grows to fill the card. The card height is set by
          the right column (tree + AI cards stacked); flex-1 here lets
          the globe fill whatever vertical space the card has, killing
          the dead space that would otherwise sit below a fixed-aspect
          image when the card is taller than the image. */}
      <div className="relative flex-1 bg-black/30">
        <Image
          src={src}
          alt={alt}
          fill
          sizes="(max-width: 768px) 100vw, 66vw"
          className={`object-cover transition-opacity duration-700 ease-out ${
            visible ? 'opacity-100' : 'opacity-0'
          }`}
          onLoad={() => setLoaded(true)}
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            boxShadow: 'inset 0 0 80px 0 rgba(255,255,255,0.06)',
          }}
        />
      </div>
      <figcaption className="p-4 text-sm text-white/70 shrink-0">
        {caption}
      </figcaption>
    </figure>
  );
}
