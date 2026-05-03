'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { MiniPedigreeTree } from '@/components/tree/MiniPedigreeTree';
import PhotoGallery from '@/components/PhotoGallery';
import RelationshipDisplay from '@/components/RelationshipDisplay';
import TheirWorld from '@/components/TheirWorld';
import PersonTimeline from '@/components/PersonTimeline';
import PersonResearch from '@/components/PersonResearch';
import HistoricalRecords from '@/components/HistoricalRecords';
// Navigation removed — using global SiteHeader instead
import Footer from '@/components/Footer';
import Skeleton, { PersonCardSkeleton } from '@/components/ui/Skeleton';
import { usePageContext } from '@/hooks/usePageContext';
import { useMe } from '@/components/MeProvider';
import type {
  PersonProfile,
  TimelineEvent,
} from '@/types/person';
import {
  generateHook,
  formatLifespan,
  calculateAge,
} from '@/lib/personHelpers';
import StorySection from '@/components/StorySection';
import dynamic from 'next/dynamic';

const MiniJourneyGlobe = dynamic(() => import('@/components/MiniJourneyGlobe'), { ssr: false });

const EMPTY_JOURNEY = [] as PersonProfile['journey'];
const EMPTY_SURNAME_MATCHES = [] as PersonProfile['surnameMatches'];
const EMPTY_PHOTOS = [] as PersonProfile['photos'];
const EMPTY_CONTEXTUAL_MEDIA = [] as PersonProfile['contextualMedia'];

export default function PersonPage() {
  const params = useParams();
  const [profile, setProfile] = useState<PersonProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const personId = params.id as string;

        const profileRes = await fetch(`/api/person/${personId}/profile`);

        if (!profileRes.ok) {
          console.error('Person not found');
          setLoading(false);
          return;
        }

        const profileData: PersonProfile = await profileRes.json();
        setProfile(profileData);
      } catch (err) {
        console.error('Failed to load person data:', err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [params.id]);

  const person = profile?.person ?? null;
  const journey = profile?.journey ?? EMPTY_JOURNEY;
  const family = profile?.family ?? null;
  const surnameMatches = profile?.surnameMatches ?? EMPTY_SURNAME_MATCHES;
  const biography = profile?.biography ?? null;
  const photos = profile?.photos ?? EMPTY_PHOTOS;
  const contextualMedia = profile?.contextualMedia ?? EMPTY_CONTEXTUAL_MEDIA;
  const sources = profile?.sources ?? [];
  const markdownContent = profile?.markdownContent ?? null;
  const narrativeBio = profile?.narrativeBio ?? null;
  const bioTier = profile?.bioTier ?? null;


  const pageContext = useMemo(
    () => person ? {
      type: 'person' as const,
      personId: person.id,
      personName: person.fullName,
    } : undefined,
    [person]
  );

  usePageContext(pageContext);
  const { me, setMe } = useMe();
  const isCurrentViewer = me?.id === person?.id;

  const hook = useMemo(() => {
    if (!person) return '';
    return generateHook(person, family, biography);
  }, [person, family, biography]);

  // Combine journey data with timeline highlights for unified timeline
  const unifiedTimeline = useMemo(() => {
    const events: TimelineEvent[] = [];

    const birthYear = person?.birthYear;
    const deathYear = person?.deathYear;

    // Helper to check if event is within person's lifespan
    const isWithinLifespan = (year: number | null) => {
      if (year === null) return true;
      if (birthYear && year < birthYear) return false;
      if (deathYear && year > deathYear) return false;
      return true;
    };

    // Add birth event automatically
    if (person?.birthYear) {
      events.push({
        year: person.birthYear,
        title: 'Born',
        subtitle: person.birthPlace || undefined,
        type: 'birth',
        isOutsideLifespan: false,
      });
    }

    // Add death event automatically (if not living)
    if (person?.deathYear && !person?.isLiving) {
      events.push({
        year: person.deathYear,
        title: 'Died',
        subtitle: person.deathPlace || undefined,
        type: 'death',
        isOutsideLifespan: false,
      });
    }

    // Add journey stops - only within lifespan, skip if same year+place as birth/death
    journey.forEach(j => {
      if (!isWithinLifespan(j.year)) return;

      // Skip if this duplicates the birth or death event (same year and overlapping place name)
      const isDupOfBirthDeath = events.some(e =>
        (e.type === 'birth' || e.type === 'death') &&
        e.year === j.year &&
        e.subtitle && j.place && (
          e.subtitle.includes(j.place) || j.place.includes(e.subtitle)
        )
      );
      if (isDupOfBirthDeath) return;

      // Skip if we already have an event at this year with the same place
      const isDupOfExisting = events.some(e =>
        e.year === j.year && (e.title === j.place || e.subtitle === j.place)
      );
      if (isDupOfExisting) return;

      events.push({
        year: j.year,
        title: j.place,
        subtitle: j.occupation ? `Working as ${j.occupation.toLowerCase()}` : undefined,
        type: 'place',
        isOutsideLifespan: false,
      });
    });

    // Add timeline highlights - but skip birth/death/occupation since we already have those
    biography?.timelineHighlights?.forEach(h => {
      // Skip birth/death events - we add those manually above
      const eventLower = h.event.toLowerCase();
      if (eventLower === 'born' || eventLower === 'died' || eventLower === 'buried') return;

      // Skip occupation events - they're already in journey
      if (eventLower.startsWith('began working as')) return;

      // Skip if we already have this exact year AND event
      const isDuplicate = events.some(e => e.year === h.year && e.title === h.event);
      if (isDuplicate) return;

      const outside = !isWithinLifespan(h.year);
      // Check for data quality warnings
      let warning: string | undefined;
      if (outside && deathYear && h.year > deathYear) {
        warning = `Event after death (${deathYear})`;
      }
      events.push({
        year: h.year,
        title: h.event,
        subtitle: h.location,
        type: outside ? 'family' : 'event', // Mark family events differently
        isOutsideLifespan: outside,
        warning,
      });
    });

    // Sort by year
    return events.sort((a, b) => (a.year || 0) - (b.year || 0));
  }, [journey, biography, person?.birthYear, person?.deathYear, person?.birthPlace, person?.deathPlace, person?.isLiving]);

  if (loading) {
    return (
      <div className="min-h-full bg-cream">
        {/* Hero skeleton */}
        <section className="pt-8 pb-8 px-6" style={{ background: 'linear-gradient(135deg, #1e1496 0%, #2a1cb3 50%, #1e1496 100%)' }}>
          <div className="max-w-4xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-center gap-6 md:gap-8">
              <Skeleton className="w-28 h-32 md:w-32 md:h-36 rounded-2xl flex-shrink-0 mx-auto md:mx-0" />
              <div className="flex-1 text-center md:text-left space-y-4">
                <Skeleton className="h-4 w-32 mx-auto md:mx-0" />
                <Skeleton className="h-12 w-64 mx-auto md:mx-0" />
                <Skeleton className="h-6 w-48 mx-auto md:mx-0" />
                <div className="flex flex-wrap justify-center md:justify-start gap-2">
                  <Skeleton className="h-8 w-20 rounded-full" />
                  <Skeleton className="h-8 w-24 rounded-full" />
                  <Skeleton className="h-8 w-20 rounded-full" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Content skeleton */}
        <div className="max-w-6xl mx-auto px-6 py-12">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
            <div className="lg:col-span-2 space-y-12">
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <Skeleton className="h-4 w-20 mb-6" />
                <div className="space-y-4">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-5/6" />
                </div>
              </div>
            </div>
            <div className="space-y-12">
              <PersonCardSkeleton />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!person) {
    return (
      <div className="min-h-full bg-cream">
        <div className="pt-16 flex flex-col items-center justify-center px-6">
          <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold mb-2 text-gray-900">Person Not Found</h1>
          <p className="text-gray-500 mb-6 text-center">The person you&apos;re looking for doesn&apos;t exist in the tree.</p>
          <Link href="/" className="bg-oak text-white px-6 py-3 rounded-lg font-semibold hover:bg-oak-light transition-colors shadow-lg">
            Back to Family Tree
          </Link>
        </div>
      </div>
    );
  }

  const lifespan = formatLifespan(person.birthYear, person.deathYear);
  const age = calculateAge(person.birthYear, person.deathYear);

  const portrait = photos.find(p => p.isPortrait);

  return (
    <div
      className="min-h-full bg-parchment flex flex-col"
      data-comment-anchor-type="person"
      data-comment-anchor-id={person.id}
    >
      {/* Hero Section - Premium Gradient & Heraldic Watermark */}
      <section className="pt-12 pb-12 px-6 relative bg-hero-gradient overflow-hidden shadow-xl border-b border-shield/80">
        {/* Heraldic Watermark Background */}
        <div className="absolute inset-0 pointer-events-none flex justify-end items-center opacity-10 mix-blend-screen scale-[2.0] origin-right translate-x-1/4">
          <Image
            src="/images/tree_heraldry_watermark.png"
            alt=""
            fill
            className="object-contain"
            priority
          />
        </div>
        {/* Action links */}
        <div className="max-w-4xl mx-auto mb-4 flex flex-wrap gap-2">
          {journey.some(j => j.lat !== null && j.lng !== null) && (
            <Link
              href={`/globe?person=${person.id}`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/20 text-sm text-white/70 hover:text-white transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              View on Globe
            </Link>
          )}
          {!isCurrentViewer && (
            <button
              onClick={() => setMe({ id: person.id, name: person.fullName, familyBranch: person.surname?.toLowerCase() })}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/20 text-sm text-white/70 hover:text-white transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              View tree as {person.fullName.split(' ')[0]}
            </button>
          )}
          {isCurrentViewer && (
            <button
              onClick={() => setMe(null)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/15 hover:bg-red-500/15 border border-emerald-500/30 hover:border-red-500/30 text-sm text-emerald-300 hover:text-red-300 transition-all cursor-pointer group"
              title="Click to clear viewer"
            >
              <svg className="w-4 h-4 group-hover:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <svg className="w-4 h-4 hidden group-hover:inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Viewing as {person.fullName.split(' ')[0]}
            </button>
          )}
        </div>
        <div className="max-w-4xl mx-auto">
          {/* Two-column layout on desktop */}
          <div className="flex flex-col md:flex-row md:items-center gap-6 md:gap-8">
            {/* Portrait or Avatar */}
            <div className="flex-shrink-0 flex justify-center md:justify-start relative z-10">
              {portrait ? (
                <div className="relative w-32 h-40 md:w-40 md:h-52 rounded-xl overflow-hidden shadow-2xl border-4 border-white/90 bg-parchment">
                  <Image
                    src={portrait.path}
                    alt={`Portrait of ${person.fullName}`}
                    fill
                    className="object-contain"
                    sizes="(max-width: 768px) 112px, 128px"
                    priority
                  />
                </div>
              ) : (
                <div className="w-28 h-32 md:w-32 md:h-36 rounded-2xl ring-2 ring-white/20 bg-white/10 flex items-center justify-center">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
              )}
            </div>

            {/* Name and info */}
            <div className="flex-1 text-center md:text-left">
              {/* Title badge */}
              {person.title && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 border border-amber-500/40 text-amber-300 mb-1">
                  {person.title}
                </span>
              )}
              {/* Name */}
              <h1 className="text-4xl md:text-5xl lg:text-7xl font-serif font-bold mb-2 tracking-tight text-white text-glow">
                {person.fullName}
              </h1>

              {/* Relationship badge - prominent below name */}
              <RelationshipDisplay personId={person.id} personName={person.fullName} personSex={person.sex} variant="hero" />

              <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 mb-3">
                {lifespan && (
                  <p className="text-lg text-white/70">{lifespan}</p>
                )}
                {hook && (
                  <>
                    <span className="text-white/30 hidden md:inline">•</span>
                    <p className="text-amber-300 italic">{hook}</p>
                  </>
                )}
              </div>

              {/* Quick stats as pills */}
              <div className="flex flex-wrap justify-center md:justify-start gap-2">
                {age && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 border border-white/20 text-sm">
                    <span className="font-semibold text-white">{age}</span>
                    <span className="text-white/70">years</span>
                  </div>
                )}
                {(biography?.researchedChildCount || (family?.children && family.children.length > 0)) && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 border border-white/20 text-sm">
                    <span className="font-semibold text-white">
                      {biography?.researchedChildCount
                        ? (biography.researchedChildCountMin && biography.researchedChildCountMin !== biography.researchedChildCount
                          ? `${biography.researchedChildCountMin}-${biography.researchedChildCount}`
                          : biography.researchedChildCount)
                        : family?.children?.length}
                    </span>
                    <span className="text-white/70">
                      {(biography?.researchedChildCount || family?.children?.length || 0) === 1 ? 'child' : 'children'}
                    </span>
                  </div>
                )}
                {family?.siblings && family.siblings.length > 0 && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 border border-white/20 text-sm">
                    <span className="font-semibold text-white">{family.siblings.length}</span>
                    <span className="text-white/70">{family.siblings.length === 1 ? 'sibling' : 'siblings'}</span>
                  </div>
                )}
                {unifiedTimeline.length > 0 && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 border border-white/20 text-sm">
                    <span className="font-semibold text-white">{unifiedTimeline.length}</span>
                    <span className="text-white/70">events</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

      </section>

      {/* Main Content - Two column on desktop */}
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          {/* Left column - Story */}
          <div className="lg:col-span-2 space-y-12">
            {/* Biography / Story */}
            <StorySection
              bioTier={bioTier}
              narrativeBio={narrativeBio}
              person={person}
              family={family}
              biography={biography}
            />


            {/* Timeline - Unified journey + events */}
            <PersonTimeline events={unifiedTimeline} sources={sources} />

            <HistoricalRecords
              sources={sources}
              personName={person?.fullName || ''}
            />

            {/* Mini Journey Globe */}
            {journey.filter(j => j.lat != null && j.lng != null).length >= 2 && (
              <section className="bg-white/80 backdrop-blur-md rounded-2xl border border-white p-6 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-shield/20 via-shield/40 to-shield/20"></div>
                <div className="flex items-center justify-between mb-4 mt-2">
                  <h2 className="text-sm font-bold text-shield uppercase tracking-widest">Journey</h2>
                </div>
                <MiniJourneyGlobe
                  personId={person.id}
                  journeyStops={journey.filter(j => j.lat != null && j.lng != null).map(j => ({
                    lat: j.lat!, lng: j.lng!, place: j.place, year: j.year, type: 'stop'
                  }))}
                />
              </section>
            )}

            {/* Photos */}
            {photos.length > 0 && (
              <section>
                <PhotoGallery
                  photos={photos}
                  allPeople={surnameMatches.map(p => ({ id: p.id, fullName: p.fullName }))}
                />
              </section>
            )}

            {/* Their World - Contextual Media */}
            {contextualMedia.length > 0 && (
              <TheirWorld items={contextualMedia} personName={person.fullName} />
            )}
          </div>

          {/* Right column - Research */}
          <div className="space-y-12">
            <section className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-parchment p-6 shadow-lg">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-800">
                Family Memory
              </p>
              <h2 className="mt-3 font-serif text-2xl text-gray-900">
                Share a memory of {person.givenName || person.fullName.split(' ')[0]}
              </h2>
              <p className="mt-3 text-sm leading-6 text-gray-600">
                Stories, photos, and family details help keep this branch of the tree alive. Your submission goes straight to Stuart for review.
              </p>
              <Link
                href={`/person/${person.id}/memories/compose`}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-amber-600"
              >
                Share a memory
                <span aria-hidden="true">→</span>
              </Link>
            </section>

            {/* Research & Sources */}
            <PersonResearch
              biography={biography}
              wikitreeId={person.wikitreeId}
              findagraveId={person.findagraveId}
              familysearchTreeId={person.familysearchTreeId ?? null}
              biographyMarkdown={markdownContent}
              personFullName={person.fullName}
              sources={sources}
            />

            {/* Family Tree */}
            {family && (
              <section className="bg-white/80 backdrop-blur-md rounded-2xl border border-white p-6 shadow-xl hover:shadow-2xl transition-shadow relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-shield/20 via-shield/40 to-shield/20"></div>

                <div className="flex items-center justify-between mb-4 mt-2">
                  <h2 className="text-sm font-bold text-shield uppercase tracking-widest">Family</h2>
                  <Link
                    href={`/tree?focus=${person.id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-shield bg-shield/5 hover:bg-shield/10 rounded-lg transition-colors"
                  >
                    View Full Tree
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </Link>
                </div>

                <div className="bg-parchment rounded-xl border border-gray-200 overflow-hidden h-[300px] w-full">
                  <MiniPedigreeTree
                    personId={person.id}
                    maxGenerations={3}
                    height={300}
                    className="w-full h-full"
                  />
                </div>
                <p className="text-center text-xs text-gray-400 mt-2">Drag to pan, use buttons to zoom</p>
              </section>
            )}

            {/* More from family */}
            {surnameMatches.length > 0 && (
              <section className="bg-white/80 backdrop-blur-md rounded-2xl border border-white p-6 shadow-lg relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-oak/20"></div>
                <h2 className="text-xs font-bold text-shield/70 uppercase tracking-widest mb-4 mt-1">
                  More {person.surname}s
                </h2>
                <div className="flex flex-wrap gap-2">
                  {surnameMatches
                    .sort((a, b) => (a.birthYear || 9999) - (b.birthYear || 9999))
                    .slice(0, 8)
                    .map((relative) => (
                      <Link
                        key={relative.id}
                        href={`/person/${relative.id}`}
                        className="px-4 py-2 bg-parchment hover:bg-shield border border-trunk/10 hover:border-transparent hover:text-white rounded-xl text-sm font-medium text-shield/80 transition-all shadow-sm hover:shadow hover:-translate-y-0.5"
                      >
                        {relative.givenName || relative.fullName.split(' ')[0]}
                        {relative.birthYear && (
                          <span className="opacity-60 ml-1">{relative.birthYear}</span>
                        )}
                      </Link>
                    ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <Footer className="mt-auto" />
    </div>
  );
}
