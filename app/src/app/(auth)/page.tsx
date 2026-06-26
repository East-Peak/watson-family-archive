'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useChat } from '@/components/ChatProvider';
import { useMe, hasViewerPerson } from '@/components/MeProvider';
import { usePageContext } from '@/hooks/usePageContext';
import { useViewerAncestry } from '@/hooks/useViewerAncestry';
import { useViewerLines } from '@/hooks/useViewerLines';
import MotionWrapper from '@/components/ui/MotionWrapper';
import CountUp from '@/components/ui/CountUp';
import { siteConfig } from '@/lib/siteConfig';
import Footer from '@/components/Footer';

interface CollectionCard {
  type: string;
  title: string;
  emoji: string;
  description: string;
  category: string;
}

interface ViewerStats {
  totalIndividuals: number;
  earliestBirth: number;
  latestBirth: number;
}

interface TreeStats {
  totalIndividuals: number;
  earliestBirth: number | null;
  latestBirth: number | null;
  totalPlaces: number;
  totalCountries: number;
  totalRecords: number;
}

interface SpotlightAncestor {
  id: string;
  name: string;
  years: string;
  birthPlace?: string;
  deathPlace?: string;
  tagline: string;
  photoPath?: string;
  hasPhoto: boolean;
  sex: string;
}

interface Story {
  icon: string;
  category: string;
  title: string;
  description: string;
  personId?: string;
  collectionType?: string;
}

interface Photo {
  filename: string;
  path: string;
  type: string;
  isPortrait: boolean;
  caption: string;
  people: string[];
}

export default function Home() {
  const [viewerStats, setViewerStats] = useState<ViewerStats | null>(null);
  const [treeStats, setTreeStats] = useState<TreeStats | null>(null);
  const [stories, setStories] = useState<Story[]>([]);
  const [allStories, setAllStories] = useState<Story[]>([]);
  const [allAncestors, setAllAncestors] = useState<SpotlightAncestor[]>([]);
  const [spotlightAncestor, setSpotlightAncestor] =
    useState<SpotlightAncestor | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [collections, setCollections] = useState<CollectionCard[]>([]);
  const { openSearch } = useChat();
  const { me, authIdentity } = useMe();
  const { ancestorIds, ancestorSurnames, ancestorCountries } =
    useViewerAncestry();
  const { lines } = useViewerLines();
  const pageContext = useMemo(() => ({ type: 'home' as const }), []);

  usePageContext(pageContext);

  const shuffleStories = useCallback(() => {
    if (allStories.length > 0) {
      const shuffled = [...allStories].sort(() => Math.random() - 0.5);
      setStories(shuffled.slice(0, 3));
    }
  }, [allStories]);

  const nextAncestor = useCallback(() => {
    if (allAncestors.length > 0) {
      const current = allAncestors.findIndex(
        (a) => a.id === spotlightAncestor?.id,
      );
      const next = (current + 1) % allAncestors.length;
      setSpotlightAncestor(allAncestors[next]);
    }
  }, [allAncestors, spotlightAncestor]);

  useEffect(() => {
    async function loadData() {
      try {
        // Fetch from Neo4j-powered home API, photos JSON, and recent discoveries
        const homeUrl = me?.id
          ? `/api/home?viewerId=${encodeURIComponent(me.id)}`
          : '/api/home';
        const [homeRes, photosRes] = await Promise.all([
          fetch(homeUrl),
          fetch('/data/photos.json').catch(() => ({
            json: () => ({ photos: [], byPerson: {} }),
          })),
        ]);

        if (!homeRes.ok) {
          console.error('Failed to fetch home data');
          setLoaded(true);
          return;
        }

        const homeData = await homeRes.json();
        const photosData: {
          photos: Photo[];
          byPerson: Record<string, number[]>;
        } = await photosRes.json();

        setViewerStats(homeData.viewerStats);
        setTreeStats(homeData.treeStats);

        // Enhance spotlight data with photos
        const spotlightWithPhotos: SpotlightAncestor[] = (
          homeData.spotlight || []
        ).map((person: SpotlightAncestor & { id: string }) => {
          const photoIndices = photosData.byPerson[person.id] || [];
          const personPhotos = photoIndices
            .map((idx: number) => photosData.photos?.[idx])
            .filter(
              (p: Photo | undefined): p is Photo =>
                p !== undefined && p.isPortrait,
            );

          return {
            ...person,
            photoPath: personPhotos[0]?.path,
            hasPhoto: personPhotos.length > 0,
          };
        });

        setAllAncestors(spotlightWithPhotos);
        setSpotlightAncestor(spotlightWithPhotos[0] || null);

        // Transform stories to use links
        const storiesWithLinks: Story[] = (homeData.stories || []).map(
          (story: Story) => ({
            ...story,
          }),
        );

        setAllStories(storiesWithLinks);
        setStories(
          storiesWithLinks.sort(() => Math.random() - 0.5).slice(0, 3),
        );

        setLoaded(true);

        // Load collections in background (non-blocking)
        fetch('/api/collection/list')
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (data?.collections) setCollections(data.collections);
          })
          .catch(() => {});
      } catch (err) {
        console.error('Failed to load data:', err);
        setLoaded(true);
      }
    }

    loadData();
  }, [me?.id]);

  const activeStats = viewerStats ?? treeStats;
  const generations =
    activeStats?.latestBirth != null && activeStats?.earliestBirth != null
      ? Math.ceil((activeStats.latestBirth - activeStats.earliestBirth) / 25)
      : 0;

  // Viewer-aware collection sorting: promote relevant collections to the top
  const sortedCollections = useMemo(() => {
    if (collections.length === 0) return collections;
    if (ancestorCountries.size === 0 && ancestorSurnames.size === 0)
      return collections;

    const isRelevant = (c: CollectionCard): boolean => {
      const type = c.type;
      // Heritage: "wales-heritage" → check ancestorCountries.has('wales')
      const heritageMatch = type.match(/^(.+)-heritage$/);
      if (heritageMatch && ancestorCountries.has(heritageMatch[1])) return true;
      // Immigration: "england-immigration" → check ancestorCountries.has('england')
      const immMatch = type.match(/^(.+)-immigration$/);
      if (immMatch && ancestorCountries.has(immMatch[1])) return true;
      // Surname: "surname-watson" → check ancestorSurnames.has('watson')
      const surnameMatch = type.match(/^surname-(.+)$/);
      if (surnameMatch && ancestorSurnames.has(surnameMatch[1])) return true;
      return false;
    };

    const relevant = collections.filter(isRelevant);
    const rest = collections.filter((c) => !isRelevant(c));
    return [...relevant, ...rest];
  }, [collections, ancestorCountries, ancestorSurnames]);

  if (!loaded) {
    return (
      <div className="min-h-full bg-cream flex items-center justify-center">
        <div className="text-shield">Loading...</div>
      </div>
    );
  }

  return (
    <main className="min-h-full bg-parchment">
      {/* Hero - Premium Gradient & Heraldic Watermark */}
      <section className="relative bg-hero-gradient overflow-hidden pt-16 pb-28 px-6 border-b border-shield shadow-2xl">
        {/* Heraldic Watermark Background */}
        <div className="absolute inset-0 pointer-events-none flex justify-center items-center opacity-10 mix-blend-screen scale-150 transform">
          <Image
            src="/images/tree_heraldry_watermark.png"
            alt=""
            fill
            className="object-contain"
            priority
          />
        </div>

        <div className="max-w-7xl mx-auto relative z-10">
          {/* Welcome */}
          <MotionWrapper className="text-center mb-16 flex flex-col items-center">
            <h2 className="font-serif text-5xl md:text-7xl text-white text-glow mb-6 leading-tight tracking-tight">
              {(() => {
                // After Task 1.3, AuthIdentity no longer carries displayName. Fall back
                // through me.name (real viewer) → email local part (null-sentinel viewer)
                // → generic "Traveler" so every authenticated user gets a friendly welcome.
                const welcomeName =
                  me?.name?.split(' ')[0] ||
                  authIdentity?.email?.split('@')[0] ||
                  'Traveler';
                return `Welcome, ${welcomeName}`;
              })()}
            </h2>
            <p className="text-white/80 text-lg md:text-xl max-w-2xl font-light">
              {siteConfig.description}
            </p>
          </MotionWrapper>

          {/* Stats Dashboard - Glassmorphic Panels */}
          {treeStats && (
            <MotionWrapper
              delay={0.2}
              className="grid grid-cols-2 md:grid-cols-6 gap-4 max-w-6xl mx-auto mb-16"
            >
              <div className="glass-panel rounded-2xl p-6 text-center transition-all duration-300 hover:bg-white/20 hover:-translate-y-1">
                <div className="text-4xl md:text-5xl font-serif font-bold text-white text-glow mb-2">
                  <CountUp
                    value={
                      viewerStats?.totalIndividuals ??
                      treeStats.totalIndividuals
                    }
                  />
                </div>
                <div className="text-white/70 text-xs font-semibold uppercase tracking-widest">
                  {viewerStats ? 'Direct Ancestors' : 'Individuals'}
                </div>
              </div>
              <div className="glass-panel rounded-2xl p-6 text-center transition-all duration-300 hover:bg-white/20 hover:-translate-y-1">
                <div className="text-4xl md:text-5xl font-serif font-bold text-white text-glow mb-2">
                  <CountUp value={generations} />
                </div>
                <div className="text-white/70 text-xs font-semibold uppercase tracking-widest">
                  Generations
                </div>
              </div>
              <div className="glass-panel rounded-2xl p-6 text-center transition-all duration-300 hover:bg-white/20 hover:-translate-y-1">
                <div className="text-4xl md:text-5xl font-serif font-bold text-white text-glow mb-2">
                  <CountUp value={treeStats.totalPlaces} />
                </div>
                <div className="text-white/70 text-xs font-semibold uppercase tracking-widest">
                  Places
                </div>
              </div>
              <div className="glass-panel rounded-2xl p-6 text-center transition-all duration-300 hover:bg-white/20 hover:-translate-y-1">
                <div className="text-4xl md:text-5xl font-serif font-bold text-white text-glow mb-2">
                  <CountUp value={treeStats.totalCountries} />
                </div>
                <div className="text-white/70 text-xs font-semibold uppercase tracking-widest">
                  Countries
                </div>
              </div>
              <div className="glass-panel rounded-2xl p-6 text-center transition-all duration-300 hover:bg-white/20 hover:-translate-y-1">
                <div className="text-4xl md:text-5xl font-serif font-bold text-white text-glow mb-2">
                  {(viewerStats ?? treeStats).earliestBirth}
                </div>
                <div className="text-white/70 text-xs font-semibold uppercase tracking-widest">
                  Earliest Record
                </div>
              </div>
              {treeStats.totalRecords > 0 && (
                <div className="glass-panel rounded-2xl p-6 text-center transition-all duration-300 hover:bg-white/20 hover:-translate-y-1">
                  <div className="text-4xl md:text-5xl font-serif font-bold text-white text-glow mb-2">
                    <CountUp value={treeStats.totalRecords} />
                  </div>
                  <div className="text-white/70 text-xs font-semibold uppercase tracking-widest">
                    Source Records
                  </div>
                </div>
              )}
            </MotionWrapper>
          )}

          {/* Quick Actions - Oak primary, Shield secondary */}
          <MotionWrapper
            delay={0.4}
            className="flex flex-wrap justify-center gap-4"
          >
            <Link
              href="/globe"
              className="flex items-center gap-2 bg-oak hover:bg-oak-light text-white px-8 py-4 rounded-xl font-medium transition-all shadow-lg hover:shadow-xl hover:-translate-y-1 text-lg"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              Explore Globe
            </Link>
            <button
              onClick={openSearch}
              className="flex items-center gap-2 bg-shield hover:bg-shield/90 text-white px-8 py-4 rounded-xl font-medium transition-all shadow-lg hover:shadow-xl hover:-translate-y-1 text-lg"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              Search or Ask AI
              <kbd className="ml-2 px-2 py-0.5 text-xs bg-white/20 rounded text-white/80 border border-white/10">
                ⌘K
              </kbd>
            </button>
          </MotionWrapper>
        </div>
      </section>

      {/* Ancestor Spotlight - Premium Card Overlap */}
      {spotlightAncestor && (
        <section className="py-16 px-6 -mt-16 relative z-20">
          <MotionWrapper className="max-w-4xl mx-auto">
            <div className="bg-white rounded-2xl shadow-2xl overflow-hidden border border-white/40 group">
              <div className="bg-shield/5 px-6 py-4 flex items-center justify-between border-b border-shield/10">
                <h3 className="text-amber-400 text-sm font-medium uppercase tracking-wide">
                  Ancestor Spotlight
                </h3>
                <button
                  onClick={nextAncestor}
                  className="text-shield hover:text-shield/70 text-sm font-medium flex items-center gap-1 transition-colors hover:translate-x-1"
                >
                  Next Story
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
              </div>
              <Link href={`/person/${spotlightAncestor.id}`} className="block">
                <div className="p-8 md:p-10 flex flex-col md:flex-row gap-8 items-center md:items-start transition-all duration-300">
                  {/* Photo or placeholder */}
                  <div className="w-36 h-48 md:w-48 md:h-64 rounded-xl overflow-hidden bg-parchment flex-shrink-0 relative shadow-inner shadow-trunk/20 ring-1 ring-shield/10">
                    {spotlightAncestor.photoPath ? (
                      <Image
                        src={spotlightAncestor.photoPath}
                        alt={spotlightAncestor.name}
                        fill
                        className="object-cover sepia-[.2]"
                        sizes="160px"
                      />
                    ) : (
                      <Image
                        src={
                          spotlightAncestor.sex === 'F'
                            ? '/images/silhouette-female.png'
                            : '/images/silhouette-male.png'
                        }
                        alt={`Silhouette for ${spotlightAncestor.name}`}
                        fill
                        className="object-cover"
                        sizes="160px"
                      />
                    )}
                  </div>
                  {/* Info */}
                  <div className="flex-1 text-center md:text-left">
                    <h4 className="font-serif text-3xl md:text-4xl text-shield mb-2 tracking-tight">
                      {spotlightAncestor.name}
                    </h4>
                    <p className="text-shield/60 font-serif text-lg mb-4 italic">
                      {spotlightAncestor.years}
                    </p>
                    <p className="text-gray-800 font-medium text-lg leading-relaxed mb-6 border-l-4 border-oak/30 pl-4">
                      {spotlightAncestor.tagline}
                    </p>
                    {spotlightAncestor.birthPlace && (
                      <p className="text-gray-600 text-sm">
                        <span className="text-gray-400">Born:</span>{' '}
                        {spotlightAncestor.birthPlace}
                      </p>
                    )}
                    {spotlightAncestor.deathPlace && (
                      <p className="text-gray-600 text-sm">
                        <span className="text-gray-400">Died:</span>{' '}
                        {spotlightAncestor.deathPlace}
                      </p>
                    )}
                    <div className="mt-4 inline-flex items-center gap-1 text-shield text-sm font-medium hover:text-shield/70">
                      View full profile
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </div>
                  </div>
                </div>
              </Link>
            </div>
          </MotionWrapper>
        </section>
      )}

      {/* Discoveries - Vignette background */}
      {stories.length > 0 && (
        <section className="py-20 px-6 bg-vignette">
          <MotionWrapper className="max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-8">
              <div>
                <Link href="/collections" className="hover:underline">
                  <h3 className="font-serif text-2xl text-shield">
                    Discoveries
                  </h3>
                </Link>
                <p className="text-gray-600 text-sm">
                  Interesting findings from the family archives
                </p>
              </div>
              <button
                onClick={shuffleStories}
                className="text-shield hover:text-shield/70 text-sm font-medium flex items-center gap-1"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                Shuffle
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {stories.map((story, idx) => (
                <div
                  key={idx}
                  className="bg-white/80 backdrop-blur-md rounded-2xl p-8 border border-white shadow-xl hover:-translate-y-2 hover:shadow-2xl hover:border-shield/20 transition-all duration-300 group"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-2xl">{story.icon}</span>
                    <span className="text-shield/70 text-xs font-medium uppercase tracking-wide">
                      {story.category}
                    </span>
                  </div>
                  <h4 className="font-serif text-xl text-gray-900 mb-2">
                    {story.title}
                  </h4>
                  <p className="text-gray-600 text-sm mb-4">
                    {story.description}
                  </p>
                  {(story.collectionType || story.personId) && (
                    <Link
                      href={
                        story.collectionType
                          ? `/collection/${story.collectionType}`
                          : `/person/${story.personId}`
                      }
                      className="text-shield hover:text-shield/70 text-sm font-semibold uppercase tracking-wider inline-flex items-center gap-2 group-hover:gap-3 transition-all"
                    >
                      Explore
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </MotionWrapper>
        </section>
      )}

      {/* Your Lines — viewer-relative ancestor branches */}
      <section className="py-20 px-6 bg-parchment border-b border-oak/10">
        <MotionWrapper className="max-w-6xl mx-auto">
          <Link href="/lines" className="hover:underline">
            <h3 className="font-serif text-2xl text-shield mb-2">
              {hasViewerPerson(me) ? 'Your Family Lines' : 'Family Lines'}
            </h3>
          </Link>
          <p className="text-gray-500 text-sm mb-6">
            {hasViewerPerson(me)
              ? 'Branches of your ancestry'
              : 'Major surname branches in the tree'}
          </p>
          {lines.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {lines.map((line) => (
                <Link
                  key={line.surname}
                  href={`/collection/surname-${line.surname.toLowerCase()}`}
                  className="bg-white rounded-2xl p-6 border border-white shadow-lg hover:-translate-y-2 hover:shadow-xl hover:border-shield/20 transition-all text-center group"
                >
                  <div className="font-serif text-2xl text-shield mb-2 group-hover:text-shield/80 transition-colors">
                    {line.surname}
                  </div>
                  <div className="text-sm text-gray-600">
                    {line.count} ancestors
                  </div>
                  {line.earliest && line.latest && (
                    <div className="text-xs text-gray-400 mt-1">
                      {line.earliest}–{line.latest}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-sm py-4">
              No family lines found yet.
            </p>
          )}
          <div className="mt-6 text-center">
            <Link href="/lines" className="text-sm text-shield hover:underline">
              View all lines &rarr;
            </Link>
          </div>
        </MotionWrapper>
      </section>

      {/* Collections — data-driven, viewer-aware sorting */}
      <section className="py-12 px-6 bg-cream border-b border-oak/10">
        <MotionWrapper className="max-w-6xl mx-auto">
          <Link href="/collections" className="hover:underline">
            <h3 className="font-serif text-2xl text-shield mb-6">
              Collections
            </h3>
          </Link>
          {sortedCollections.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {sortedCollections.slice(0, 12).map((c) => {
                const isViewerRelevant =
                  me &&
                  ((c.type.match(/^(.+)-heritage$/) &&
                    ancestorCountries.has(c.type.replace('-heritage', ''))) ||
                    (c.type.match(/^(.+)-immigration$/) &&
                      ancestorCountries.has(
                        c.type.replace('-immigration', ''),
                      )) ||
                    (c.type.match(/^surname-(.+)$/) &&
                      ancestorSurnames.has(c.type.replace('surname-', ''))));
                return (
                  <Link
                    key={c.type}
                    href={`/collection/${c.type}`}
                    className={`bg-white rounded-xl p-4 border hover:shadow-md transition-all ${
                      isViewerRelevant
                        ? 'border-emerald-300/50 hover:border-emerald-400/60'
                        : 'border-gray-200 hover:border-shield/30'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="text-2xl mb-2">{c.emoji}</div>
                      {isViewerRelevant && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-full">
                          Your heritage
                        </span>
                      )}
                    </div>
                    <div className="font-medium text-gray-900 text-sm">
                      {c.title}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {c.description}
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="text-gray-400 text-sm py-4">
              No collections available.
            </p>
          )}
          <div className="mt-6 text-center">
            <Link
              href="/collections"
              className="text-sm text-shield hover:underline"
            >
              View all collections &rarr;
            </Link>
          </div>
        </MotionWrapper>
      </section>

      {/* Explore Section */}
      <section className="py-16 px-6 bg-cream">
        <MotionWrapper className="max-w-6xl mx-auto">
          <h3 className="font-serif text-2xl text-shield mb-8 text-center">
            Ways to Explore
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Link
              href="/tree"
              className="group bg-white rounded-xl p-6 border border-gray-200 hover:border-shield/30 hover:shadow-md transition-all"
            >
              <div className="w-12 h-12 rounded-lg bg-shield/10 flex items-center justify-center mb-4 group-hover:bg-shield/20 transition-colors">
                <svg
                  className="w-6 h-6 text-shield"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
              </div>
              <h4 className="font-semibold text-gray-900 mb-1">Family Tree</h4>
              <p className="text-gray-600 text-sm">
                Explore the full family network with interactive pan, zoom, and
                filtering.
              </p>
            </Link>

            <Link
              href="/globe"
              className="group bg-white rounded-xl p-6 border border-gray-200 hover:border-shield/30 hover:shadow-md transition-all"
            >
              <div className="w-12 h-12 rounded-lg bg-shield/10 flex items-center justify-center mb-4 group-hover:bg-shield/20 transition-colors">
                <svg
                  className="w-6 h-6 text-shield"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <h4 className="font-semibold text-gray-900 mb-1">
                Interactive Globe
              </h4>
              <p className="text-gray-600 text-sm">
                See where your ancestors lived and their migration paths.
              </p>
            </Link>

            <Link
              href="/explorer"
              className="group bg-white rounded-xl p-6 border border-gray-200 hover:border-shield/30 hover:shadow-md transition-all"
            >
              <div className="w-12 h-12 rounded-lg bg-shield/10 flex items-center justify-center mb-4 group-hover:bg-shield/20 transition-colors">
                <svg
                  className="w-6 h-6 text-shield"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z"
                  />
                </svg>
              </div>
              <h4 className="font-semibold text-gray-900 mb-1">
                Data Explorer
              </h4>
              <p className="text-gray-600 text-sm">
                Browse the family tree by surname, birth decade, country, and
                more.
              </p>
            </Link>

            <Link
              href="/timeline"
              className="group bg-white rounded-xl p-6 border border-gray-200 hover:border-shield/30 hover:shadow-md transition-all"
            >
              <div className="w-12 h-12 rounded-lg bg-shield/10 flex items-center justify-center mb-4 group-hover:bg-shield/20 transition-colors">
                <svg
                  className="w-6 h-6 text-shield"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <h4 className="font-semibold text-gray-900 mb-1">Timeline</h4>
              <p className="text-gray-600 text-sm">
                Walk through history decade by decade with world events for
                context.
              </p>
            </Link>

            <Link
              href="/collections"
              className="group bg-white rounded-xl p-6 border border-gray-200 hover:border-shield/30 hover:shadow-md transition-all"
            >
              <div className="w-12 h-12 rounded-lg bg-shield/10 flex items-center justify-center mb-4 group-hover:bg-shield/20 transition-colors">
                <svg
                  className="w-6 h-6 text-shield"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                  />
                </svg>
              </div>
              <h4 className="font-semibold text-gray-900 mb-1">Collections</h4>
              <p className="text-gray-600 text-sm">
                Themed groupings: heritage, military service, immigration, and
                more.
              </p>
            </Link>

            <button
              onClick={openSearch}
              className="group bg-white rounded-xl p-6 border border-gray-200 hover:border-shield/30 hover:shadow-md transition-all text-left"
            >
              <div className="w-12 h-12 rounded-lg bg-shield/10 flex items-center justify-center mb-4 group-hover:bg-shield/20 transition-colors">
                <svg
                  className="w-6 h-6 text-shield"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
              <h4 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
                Search & AI
                <kbd className="px-1.5 py-0.5 text-[10px] bg-gray-100 rounded text-gray-500">
                  ⌘K
                </kbd>
              </h4>
              <p className="text-gray-600 text-sm">
                Find ancestors by name or ask AI questions about your family
                history.
              </p>
            </button>
          </div>
        </MotionWrapper>
      </section>

      <Footer
        stats={
          treeStats &&
          treeStats.earliestBirth != null &&
          treeStats.latestBirth != null
            ? {
                totalIndividuals: treeStats.totalIndividuals,
                earliestBirth: treeStats.earliestBirth,
                latestBirth: treeStats.latestBirth,
              }
            : undefined
        }
      />
    </main>
  );
}
