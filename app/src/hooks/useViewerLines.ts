'use client';

import { useEffect, useState } from 'react';
import { useMe } from '@/components/MeProvider';

export interface AncestorLine {
  surname: string;
  count: number;
  earliest?: number;
  latest?: number;
}

interface ViewerLinesState {
  lines: AncestorLine[];
  loading: boolean;
}

interface UseViewerLinesOptions {
  limit?: number;
  minCount?: number;
}

export function useViewerLines(
  options?: UseViewerLinesOptions,
): ViewerLinesState {
  const { me } = useMe();
  const [lines, setLines] = useState<AncestorLine[]>([]);
  const [loading, setLoading] = useState(true);

  const { limit, minCount } = options ?? {};

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (me?.id) params.set('personId', me.id);
    if (limit !== undefined) params.set('limit', String(limit));
    if (minCount !== undefined) params.set('minCount', String(minCount));
    const query = params.toString();
    const linesUrl = `/api/viewer/lines${query ? `?${query}` : ''}`;

    setLoading(true);

    fetch(linesUrl)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) {
          setLines(data?.lines ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLines([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [me?.id, limit, minCount]);

  return { lines, loading };
}
