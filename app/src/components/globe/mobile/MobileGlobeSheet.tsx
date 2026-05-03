'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

export type MobileGlobeSheetMode = 'controls' | 'location' | 'arc' | 'highlight';
export type MobileGlobeSheetSnap = 'collapsed' | 'half' | 'full';

interface MobileGlobeSheetProps {
  mode: MobileGlobeSheetMode;
  snap: MobileGlobeSheetSnap;
  title: string;
  onClose: () => void;
  onToggleSnap: () => void;
  children: ReactNode;
}

export default function MobileGlobeSheet({
  mode,
  snap,
  title,
  onClose,
  onToggleSnap,
  children,
}: MobileGlobeSheetProps) {
  const titleId = useId();
  const sheetRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (snap === 'collapsed') {
      return;
    }

    sheetRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, snap]);

  if (snap === 'collapsed') {
    return null;
  }

  const isFull = snap === 'full';
  const toggleLabel = isFull ? 'Minimize sheet' : 'Expand sheet';
  const sheetHeight = isFull
    ? 'min(68vh, calc(100dvh - 10rem - env(safe-area-inset-top) - env(safe-area-inset-bottom)))'
    : 'min(44vh, calc(100dvh - 10rem - env(safe-area-inset-top) - env(safe-area-inset-bottom)))';

  return (
    <section
      ref={sheetRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      tabIndex={-1}
      aria-label={`${title} panel`}
      className="absolute inset-x-3 z-20 flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-black/78 shadow-2xl backdrop-blur-md md:hidden"
      style={{
        bottom: 'calc(5.5rem + env(safe-area-inset-bottom))',
        height: sheetHeight,
      }}
      data-testid={`mobile-globe-sheet-${mode}`}
    >
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <div className="h-1.5 w-10 rounded-full bg-white/20" aria-hidden="true" />
        <div id={titleId} className="min-w-0 flex-1 text-sm font-semibold text-white">
          {title}
        </div>
        <button
          type="button"
          onClick={onToggleSnap}
          aria-label={toggleLabel}
          className="rounded-full p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        >
          {isFull ? (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          ) : (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${title}`}
          className="rounded-full p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4"
        style={{ touchAction: 'pan-y' }}
        data-testid="mobile-globe-sheet-scroll-region"
      >
        {children}
      </div>
    </section>
  );
}
