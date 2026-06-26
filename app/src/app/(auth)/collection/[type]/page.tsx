'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMe, hasViewerPerson } from '@/components/MeProvider';

interface Person {
  id: string;
  fullName: string;
  birthYear?: number;
  deathYear?: number;
  birthPlace?: string;
  deathPlace?: string;
}

interface CollectionData {
  type: string;
  title: string;
  emoji: string;
  description: string;
  totalCount: number;
  viewerCount: number | null;
  people: Person[];
  viewerPeople: Person[] | null;
}

type Scope = 'viewer' | 'all';

export default function CollectionPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { me } = useMe();
  const type = params.type as string;
  const hasViewer = hasViewerPerson(me);

  const urlScope = searchParams.get('scope') as Scope | null;
  // Default: viewer scope if a viewer is set, otherwise all
  const scope: Scope = urlScope || (hasViewer ? 'viewer' : 'all');

  const [collection, setCollection] = useState<CollectionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const url =
          hasViewer && me?.id
            ? `/api/collection/${encodeURIComponent(type)}?viewerId=${encodeURIComponent(me.id)}`
            : `/api/collection/${encodeURIComponent(type)}`;
        const res = await fetch(url);

        if (!res.ok) {
          if (res.status === 404) {
            setError('Collection not found');
          } else {
            setError('Failed to load collection');
          }
          setLoading(false);
          return;
        }

        const data: CollectionData = await res.json();
        setCollection(data);
      } catch (err) {
        console.error('Failed to load collection:', err);
        setError('Failed to load collection');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [type, hasViewer, me?.id]);

  function setScopeParam(next: Scope) {
    const p = new URLSearchParams(searchParams.toString());
    p.set('scope', next);
    router.replace(`?${p.toString()}`, { scroll: false });
  }

  if (error || (!loading && !collection)) {
    return (
      <div className="min-h-full bg-cream flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            {error || 'Collection not found'}
          </h1>
          <Link href="/" className="text-shield hover:underline">
            Return home
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-full bg-cream flex items-center justify-center">
        <div className="text-center text-gray-500">Loading...</div>
      </div>
    );
  }

  // Decide which people list to show based on scope
  const isSurnameCollection = type.startsWith('surname-');
  const showToggle =
    hasViewer &&
    collection?.viewerCount !== null &&
    collection?.viewerCount !== undefined;
  const effectiveScope: Scope = showToggle ? scope : 'all';
  const peopleToShow =
    effectiveScope === 'viewer' && collection?.viewerPeople
      ? collection.viewerPeople
      : collection?.people || [];
  const countToShow =
    effectiveScope === 'viewer'
      ? (collection?.viewerCount ?? 0)
      : (collection?.totalCount ?? 0);

  return (
    <main className="min-h-full bg-cream">
      {/* Header */}
      <div className="bg-shield border-b border-shield">
        <div className="max-w-6xl mx-auto px-6 py-8">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm text-white/70 mb-4">
            <Link href="/" className="hover:text-white transition-colors">
              Home
            </Link>
            <span>/</span>
            {isSurnameCollection ? (
              <Link
                href="/lines"
                className="hover:text-white transition-colors"
              >
                Lines
              </Link>
            ) : (
              <Link
                href="/collections"
                className="hover:text-white transition-colors"
              >
                Collections
              </Link>
            )}
            <span>/</span>
            <span className="text-white">{collection?.title || type}</span>
          </div>

          <div className="flex items-center gap-4 mt-4">
            <span className="text-5xl">{collection?.emoji}</span>
            <div>
              <h1 className="text-3xl font-bold font-serif text-white">
                {collection?.title}
              </h1>
              <p className="text-white/70 mt-1">{collection?.description}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 py-12">
        {/* Scope toggle — only when a viewer is set */}
        {showToggle && (
          <div className="mb-6 flex items-center gap-1 bg-white rounded-full p-1 border border-gray-200 w-fit">
            <button
              type="button"
              onClick={() => setScopeParam('viewer')}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                effectiveScope === 'viewer'
                  ? 'bg-shield text-white'
                  : 'text-gray-600 hover:text-shield'
              }`}
            >
              Your line ({collection?.viewerCount ?? 0})
            </button>
            <button
              type="button"
              onClick={() => setScopeParam('all')}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                effectiveScope === 'all'
                  ? 'bg-shield text-white'
                  : 'text-gray-600 hover:text-shield'
              }`}
            >
              Everyone ({collection?.totalCount ?? 0})
            </button>
          </div>
        )}

        {peopleToShow.length === 0 ? (
          <div className="text-center text-gray-500 py-12">
            {effectiveScope === 'viewer'
              ? 'No one in your direct line matches this collection.'
              : 'No people found in this collection.'}
          </div>
        ) : (
          <>
            <p className="text-gray-500 mb-8">
              {countToShow} {countToShow === 1 ? 'person' : 'people'}
              {effectiveScope === 'viewer'
                ? ' in your direct line'
                : ' in this collection'}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {peopleToShow.map((person) => (
                <Link
                  key={person.id}
                  href={`/person/${person.id}`}
                  className="bg-white border border-gray-200 rounded-xl p-5 hover:border-shield/30 hover:shadow-md transition-all"
                >
                  <h3 className="font-semibold text-lg text-gray-900">
                    {person.fullName}
                  </h3>
                  <p className="text-gray-500 text-sm mt-1">
                    {person.birthYear && person.deathYear
                      ? `${person.birthYear}\u2013${person.deathYear}`
                      : person.birthYear
                        ? `b. ${person.birthYear}`
                        : 'Dates unknown'}
                  </p>
                  {person.birthPlace && (
                    <p className="text-gray-400 text-sm mt-2 truncate">
                      Born: {person.birthPlace}
                    </p>
                  )}
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
