'use client';

export type MobileShellMode = 'standard' | 'immersive' | 'fullscreen-modal';

export interface MobileShellChrome {
  mode: MobileShellMode;
  immersiveExitHref?: string;
}

export function deriveMobileShellMode(pathname: string): MobileShellMode {
  if (pathname === '/globe') {
    return 'immersive';
  }

  return 'standard';
}

export function deriveMobileShellChrome(pathname: string): MobileShellChrome {
  const mode = deriveMobileShellMode(pathname);

  return {
    mode,
    immersiveExitHref: mode === 'immersive' ? '/' : undefined,
  };
}
