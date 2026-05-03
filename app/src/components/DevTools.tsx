'use client';

import { Agentation } from 'agentation';

export default function DevTools() {
  // Only render on localhost (local dev/preview, never on Vercel)
  if (typeof window === 'undefined' || !window.location.hostname.match(/^(localhost|127\.0\.0\.1)$/)) {
    return null;
  }

  return <Agentation />;
}
