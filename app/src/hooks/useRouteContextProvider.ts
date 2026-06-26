import { useEffect } from 'react';
import { registerRouteContextProvider } from '@/lib/comments/routeContextStore';

export function useRouteContextProvider(
  provider: () => Record<string, unknown>,
): void {
  useEffect(() => {
    return registerRouteContextProvider(provider);
  }, [provider]);
}
