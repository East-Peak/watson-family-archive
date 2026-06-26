'use client';

import { useLayoutEffect } from 'react';
import { useChat } from '@/components/ChatProvider';
import type {
  MobileShellChrome,
  MobileShellMode,
} from '@/components/mobile/MobileShellMode';

export function useMobileShellMode(
  chromeOrMode: MobileShellMode | MobileShellChrome,
) {
  const { setMobileShellChrome, clearMobileShellChrome } = useChat();
  const mode =
    typeof chromeOrMode === 'string' ? chromeOrMode : chromeOrMode.mode;
  const immersiveExitHref =
    typeof chromeOrMode === 'string'
      ? undefined
      : chromeOrMode.immersiveExitHref;

  useLayoutEffect(() => {
    const chrome =
      immersiveExitHref === undefined ? { mode } : { mode, immersiveExitHref };
    setMobileShellChrome(chrome);
    return () => clearMobileShellChrome();
  }, [clearMobileShellChrome, immersiveExitHref, mode, setMobileShellChrome]);
}
