'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import MotionWrapper from '@/components/ui/MotionWrapper';

interface CollectionMeta {
  type: string;
  title: string;
  emoji: string;
  description: string;
  memberCount?: number;
  category?: string;
}

export default function CollectionsPage() {
  const [collections, setCollections] = useState<CollectionMeta[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/collection/list?counts=true');
        if (!res.ok) return;
        const data = await res.json();
        const nonSurname = (data.collections || []).filter(
          (c: CollectionMeta) => !c.type.startsWith('surname-')
        );
        setCollections(nonSurname);
      } catch (err) {
        console.error('Failed to load collections:', err);
      } finally {
        setLoaded(true);
      }
    }
    load();
  }, []);

  if (!loaded) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream">
      <MotionWrapper className="max-w-6xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="font-serif text-3xl text-shield">Collections</h1>
          <p className="text-gray-500 mt-1">Themed groupings of ancestors</p>
        </div>

        {collections.length === 0 ? (
          <p className="text-gray-400 text-center py-12">
            No collections available yet.{' '}
            <Link href="/" className="text-shield hover:underline">Back to home</Link>
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {collections.map((c) => (
              <Link
                key={c.type}
                href={`/collection/${c.type}`}
                className="bg-white rounded-lg p-4 border border-gray-200 hover:shadow-sm hover:border-shield/30 transition-all"
              >
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-2xl">{c.emoji}</span>
                  <h3 className="font-medium text-gray-900">{c.title}</h3>
                </div>
                <p className="text-sm text-gray-500">{c.description}</p>
                {c.memberCount !== undefined && c.memberCount > 0 && (
                  <p className="text-xs text-gray-400 mt-2">
                    {c.memberCount} {c.memberCount === 1 ? 'person' : 'people'}
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}
      </MotionWrapper>
    </div>
  );
}
