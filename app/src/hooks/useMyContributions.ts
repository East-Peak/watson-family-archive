'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ContributionRecord } from '@/lib/contributions/types';

interface MyContributionsResponse {
  open?: ContributionRecord[];
  closed?: ContributionRecord[];
  error?: string;
}

interface UseMyContributionsResult {
  items: ContributionRecord[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useMyContributions(): UseMyContributionsResult {
  const [items, setItems] = useState<ContributionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/contributions/mine', {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal,
      });

      const body = await response.json() as MyContributionsResponse;
      if (!response.ok) {
        throw new Error(body.error || 'Failed to load contributions');
      }

      const open = Array.isArray(body.open) ? body.open : [];
      const closed = Array.isArray(body.closed) ? body.closed : [];
      setItems([...open, ...closed]);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      setItems([]);
      setError(error instanceof Error ? error.message : 'Failed to load contributions');
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const refetch = useCallback(async () => {
    await load();
  }, [load]);

  return { items, loading, error, refetch };
}
