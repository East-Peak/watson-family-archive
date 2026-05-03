'use client';

import { useEffect, useState } from 'react';

export interface MobileTreeFamilyMember {
  id: string;
  name: string;
  birthYear?: number;
}

export interface MobileTreePersonDetails {
  id: string;
  name: string;
  sex: 'M' | 'F' | 'U';
  birthYear?: number;
  deathYear?: number;
  isLiving?: boolean;
  photoUrl?: string | null;
  birthPlace?: string;
  deathPlace?: string;
  occupation?: string;
  father?: MobileTreeFamilyMember;
  mother?: MobileTreeFamilyMember;
  spouses: MobileTreeFamilyMember[];
  children: MobileTreeFamilyMember[];
  siblings: MobileTreeFamilyMember[];
}

function normalizeSex(raw: string | undefined | null): 'M' | 'F' | 'U' {
  if (!raw) return 'U';
  const normalized = raw.charAt(0).toUpperCase();
  if (normalized === 'M') return 'M';
  if (normalized === 'F') return 'F';
  return 'U';
}

function normalizeFamilyMember(member: {
  id: string;
  name?: string | null;
  fullName?: string | null;
  birthYear?: number;
} | null | undefined): MobileTreeFamilyMember | undefined {
  if (!member?.id) return undefined;

  return {
    id: member.id,
    name: member.name || member.fullName || 'Unknown',
    birthYear: member.birthYear,
  };
}

export function useMobileTreePerson(personId: string | null) {
  const [person, setPerson] = useState<MobileTreePersonDetails | null>(null);
  const [loading, setLoading] = useState(Boolean(personId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!personId) {
      setPerson(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/person/${encodeURIComponent(personId)}`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Failed to load family details');
        }

        return response.json();
      })
      .then((data) => {
        if (cancelled) return;

        setPerson({
          id: personId,
          name: data.fullName || data.name || 'Unknown',
          sex: normalizeSex(data.sex),
          birthYear: data.birthYear ?? undefined,
          deathYear: data.deathYear ?? undefined,
          isLiving: data.isLiving ?? undefined,
          photoUrl: data.photoUrl ?? null,
          birthPlace: data.birthPlace ?? undefined,
          deathPlace: data.deathPlace ?? undefined,
          occupation: data.occupation ?? undefined,
          father: normalizeFamilyMember(data.father),
          mother: normalizeFamilyMember(data.mother),
          spouses: (data.spouses ?? [])
            .map(normalizeFamilyMember)
            .filter((member: MobileTreeFamilyMember | undefined): member is MobileTreeFamilyMember => Boolean(member)),
          children: (data.children ?? [])
            .map(normalizeFamilyMember)
            .filter((member: MobileTreeFamilyMember | undefined): member is MobileTreeFamilyMember => Boolean(member)),
          siblings: (data.siblings ?? [])
            .map(normalizeFamilyMember)
            .filter((member: MobileTreeFamilyMember | undefined): member is MobileTreeFamilyMember => Boolean(member)),
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setPerson(null);
        setError(err instanceof Error ? err.message : 'Failed to load family details');
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [personId]);

  return { person, loading, error };
}
