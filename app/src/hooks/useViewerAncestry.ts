'use client';

import { useEffect, useState } from 'react';
import { useMe } from '@/components/MeProvider';

interface ViewerAncestry {
  ancestorIds: Set<string>;
  ancestorSurnames: Set<string>;
  ancestorCountries: Set<string>;
  isAncestor: (id: string) => boolean;
  loading: boolean;
  error: string | null;
}

const EMPTY_SET = new Set<string>();

export function useViewerAncestry(): ViewerAncestry {
  const { me } = useMe();
  const [ancestorIds, setAncestorIds] = useState<Set<string>>(EMPTY_SET);
  const [ancestorSurnames, setAncestorSurnames] = useState<Set<string>>(EMPTY_SET);
  const [ancestorCountries, setAncestorCountries] = useState<Set<string>>(EMPTY_SET);
  const [loading, setLoading] = useState(Boolean(me?.id));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!me?.id) {
      setAncestorIds(EMPTY_SET);
      setAncestorSurnames(EMPTY_SET);
      setAncestorCountries(EMPTY_SET);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setAncestorIds(EMPTY_SET);
    setAncestorSurnames(EMPTY_SET);
    setAncestorCountries(EMPTY_SET);
    setError(null);
    setLoading(true);

    fetch(`/api/viewer/ancestors?personId=${encodeURIComponent(me.id)}`)
      .then(async (res) => {
        if (!res.ok) {
          let body = '';
          try {
            body = await res.text();
          } catch {
            // Ignore secondary read failures — the status is enough context.
          }
          throw new Error(`Viewer ancestry request failed (${res.status})${body ? `: ${body}` : ''}`);
        }
        return res.json();
      })
      .then(data => {
        if (cancelled) {
          return;
        }

        setAncestorIds(new Set(data?.ancestorIds ?? []));
        setAncestorSurnames(new Set(data?.ancestorSurnames ?? []));
        setAncestorCountries(new Set(data?.ancestorCountries ?? []));
      })
      .catch(err => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to fetch viewer ancestry');
          console.error('Failed to fetch viewer ancestry:', err);
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
  }, [me?.id]);

  const hasViewer = Boolean(me?.id);

  return {
    ancestorIds: hasViewer ? ancestorIds : EMPTY_SET,
    ancestorSurnames: hasViewer ? ancestorSurnames : EMPTY_SET,
    ancestorCountries: hasViewer ? ancestorCountries : EMPTY_SET,
    isAncestor: (id: string) => (hasViewer ? ancestorIds : EMPTY_SET).has(id),
    loading: hasViewer ? loading : false,
    error: hasViewer ? error : null,
  };
}
