'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, Suspense } from 'react';
import { JourneyStop } from '@/components/JourneyPlayer';
import { useChat } from '@/components/ChatProvider';
import { useMe } from '@/components/MeProvider';
import { usePageContext } from '@/hooks/usePageContext';
import { useMobileShellMode } from '@/hooks/useMobileShellMode';
import { useRouteContextProvider } from '@/hooks/useRouteContextProvider';
import { useViewerAncestry } from '@/hooks/useViewerAncestry';
import { useGlobeViewState } from '@/components/globe/hooks/useGlobeViewState';
import { buildGlobeRouteContext } from '@/lib/comments/globeRouteContext';

// Dynamically import CesiumGlobe to avoid SSR issues
const CesiumGlobe = dynamic(() => import('@/components/CesiumGlobe'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-black">
      <div className="text-white/60 text-lg">Loading CesiumJS globe...</div>
    </div>
  ),
});

interface JourneyModeData {
  personId: string;
  personName: string;
  birthYear: number | null;
  deathYear: number | null;
  stops: JourneyStop[];
}

interface JourneyApiResponse {
  personId: string;
  personName: string;
  birthYear: number | null;
  deathYear: number | null;
  stops: JourneyStop[];
}

function GlobeV2PageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const {
    visualizationCommand,
    clearVisualizationCommand,
    isSidebarOpen,
    closeSidebar,
  } = useChat();
  const { me } = useMe();
  const {
    ancestorSurnames,
    ancestorIds,
    loading: viewerAncestryLoading,
    error: viewerAncestryError,
  } = useViewerAncestry();
  const journeyPersonId = searchParams.get('journey');
  const debugGlobe = searchParams.get('debugGlobe') === '1';

  const [journeyMode, setJourneyMode] = useState<JourneyModeData | null>(null);
  const [loading, setLoading] = useState(!!journeyPersonId);
  const pageContext = useMemo(() => ({ type: 'globe' as const }), []);
  const immersiveChrome = useMemo(
    () => ({
      mode: 'immersive' as const,
      immersiveExitHref: journeyMode ? `/person/${journeyMode.personId}` : '/',
    }),
    [journeyMode],
  );

  // URL-backed globe view state (for main globe, not journey mode)
  const {
    state: viewState,
    setState: setViewState,
    resetState: resetViewState,
  } = useGlobeViewState();

  usePageContext(pageContext);
  useMobileShellMode(immersiveChrome);

  const routeContextProvider = useCallback(
    () => buildGlobeRouteContext(viewState),
    [viewState],
  );
  useRouteContextProvider(routeContextProvider);

  // Handle visualization commands from AI chat
  useEffect(() => {
    if (!visualizationCommand) return;
    if (
      visualizationCommand.target !== 'globe' &&
      visualizationCommand.target !== 'both'
    )
      return;

    switch (visualizationCommand.action) {
      case 'filter':
        if (visualizationCommand.params.branch) {
          setViewState({ branch: visualizationCommand.params.branch });
        }
        break;
      case 'reset':
        resetViewState();
        break;
      case 'showCollection':
        // Navigate to collection page
        if (visualizationCommand.params.collectionType) {
          router.push(
            `/collection/${visualizationCommand.params.collectionType}`,
          );
        }
        break;
    }

    // Clear the command after handling
    clearVisualizationCommand();
  }, [
    visualizationCommand,
    clearVisualizationCommand,
    router,
    setViewState,
    resetViewState,
  ]);

  // Load journey data if journey param is present
  useEffect(() => {
    if (!journeyPersonId) {
      setJourneyMode(null);
      setLoading(false);
      return;
    }

    async function loadJourneyData() {
      try {
        const res = await fetch(
          `/api/person/${encodeURIComponent(journeyPersonId!)}/journey`,
        );

        if (!res.ok) {
          console.error('Failed to fetch journey data');
          setLoading(false);
          return;
        }

        const data: JourneyApiResponse = await res.json();

        // Filter to only stops with coordinates
        const stopsWithCoords = data.stops.filter(
          (stop) => stop.lat !== null && stop.lng !== null,
        );

        if (stopsWithCoords.length > 0) {
          setJourneyMode({
            personId: data.personId,
            personName: data.personName,
            birthYear: data.birthYear,
            deathYear: data.deathYear,
            stops: stopsWithCoords,
          });
        }
      } catch (err) {
        console.error('Failed to load journey data:', err);
      } finally {
        setLoading(false);
      }
    }

    loadJourneyData();
  }, [journeyPersonId]);

  const handleJourneyClose = () => {
    setJourneyMode(null);
    // Remove journey param from URL
    router.push('/globe');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-black">
        <div className="text-white/60 text-lg">Loading journey...</div>
      </div>
    );
  }

  return (
    <main className="h-full w-full overflow-hidden bg-black relative">
      {/* Back to home - hide during journey mode */}
      {!journeyMode && (
        <Link
          href="/"
          className="absolute top-4 left-4 z-50 hidden items-center gap-2 rounded-lg bg-black/50 px-4 py-2 text-white/60 backdrop-blur-sm transition-colors hover:text-white md:flex"
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
              d="M10 19l-7-7m0 0l7-7m-7 7h18"
            />
          </svg>
          Home
        </Link>
      )}

      {/* Back to person - show during journey mode */}
      {journeyMode && (
        <Link
          href={`/person/${journeyMode.personId}`}
          className="absolute top-4 left-4 z-50 hidden items-center gap-2 rounded-lg bg-black/50 px-4 py-2 text-white/60 backdrop-blur-sm transition-colors hover:text-white md:flex"
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
              d="M10 19l-7-7m0 0l7-7m-7 7h18"
            />
          </svg>
          Back to Profile
        </Link>
      )}

      <CesiumGlobe
        journeyMode={journeyMode}
        onJourneyClose={handleJourneyClose}
        viewState={viewState}
        onViewStateChange={setViewState}
        viewerSurnames={ancestorSurnames}
        viewerAncestorIds={ancestorIds}
        viewerId={me?.id ?? null}
        viewerAncestryLoading={viewerAncestryLoading}
        viewerAncestryError={viewerAncestryError}
        isSidebarOpen={isSidebarOpen}
        onCloseSidebar={closeSidebar}
        debugGlobe={debugGlobe}
      />
    </main>
  );
}

export default function GlobeV2Page() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-full bg-black">
          <div className="text-white/60 text-lg">Loading globe...</div>
        </div>
      }
    >
      <GlobeV2PageContent />
    </Suspense>
  );
}
