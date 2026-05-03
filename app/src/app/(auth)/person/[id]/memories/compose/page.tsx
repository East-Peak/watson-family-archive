'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import MemoryComposer from '@/components/memories/MemoryComposer';
import Skeleton from '@/components/ui/Skeleton';

export default function MemoryComposePage() {
  const params = useParams();
  const personId = params.id as string;
  const [personName, setPersonName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/person/${personId}/profile`)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        setPersonName(data?.person?.fullName ?? personId.replace(/_/g, ' '));
        setLoading(false);
      })
      .catch(() => {
        setPersonName(personId.replace(/_/g, ' '));
        setLoading(false);
      });
  }, [personId]);

  if (loading) {
    return (
      <div className="min-h-full bg-cream">
        <div className="max-w-2xl mx-auto px-6 py-12 space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  return <MemoryComposer personId={personId} personName={personName ?? personId} />;
}
