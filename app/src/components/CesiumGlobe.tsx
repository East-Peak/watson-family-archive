'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Viewer, useCesium } from 'resium';
import {
  Cartesian2,
  Color,
  ScreenSpaceEventType,
  defined,
  Ion,
  type Viewer as CesiumViewer,
} from 'cesium';

// Cesium Ion access token, read from NEXT_PUBLIC_CESIUM_ION_TOKEN (set in
// .env.local locally and in Vercel env for production). The token is
// domain-restricted in Cesium Ion, so it is safe to expose as a NEXT_PUBLIC value.
Ion.defaultAccessToken = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN ?? '';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import JourneyPlayer from './JourneyPlayer';
import JourneyCard from './JourneyCard';
import { REGION_COLORS } from './globe/constants';
import { getLocationRegion } from './globe/regions';
import type {
  Arc,
  GlobeViewState,
  JourneyModeData,
  Location,
  Person,
} from './globe/types';
import { useGlobeFilteredData } from './globe/hooks/useGlobeFilteredData';
import { useGlobeCamera } from './globe/hooks/useGlobeCamera';
import { useJourneyPlayback } from './globe/hooks/useJourneyPlayback';
import { usePersonHighlight } from './globe/hooks/usePersonHighlight';
import { useFitCamera } from './globe/hooks/useFitCamera';
import { useVisualizationMode } from './globe/hooks/useVisualizationMode';
import { useIsMobile } from '@/hooks/useIsMobile';
import ControlDock from './globe/ControlDock';
import TimelineSlider from './globe/TimelineSlider';
import DensityLayer from './globe/DensityLayer';
import LocationPins from './globe/LocationPins';
import MigrationArcs from './globe/MigrationArcs';
import OriginPins from './globe/OriginPins';
import LocationPanel from './globe/panels/LocationPanel';
import ArcDetailsPanel from './globe/panels/ArcDetailsPanel';
import PersonHighlightCard from './globe/panels/PersonHighlightCard';
import ApproximateRings from './globe/ApproximateRings';
import EmptyFilterState from './globe/panels/EmptyFilterState';
import MobileGlobeSheet, {
  type MobileGlobeSheetMode,
  type MobileGlobeSheetSnap,
} from './globe/mobile/MobileGlobeSheet';
import MobileGlobeControls from './globe/mobile/MobileGlobeControls';
import MobileLocationDetails from './globe/mobile/MobileLocationDetails';
import MobileArcDetails from './globe/mobile/MobileArcDetails';
import MobileHighlightDetails from './globe/mobile/MobileHighlightDetails';

function arcsEqual(a: Arc, b: Arc): boolean {
  return (
    a.person_id === b.person_id &&
    a.from.place === b.from.place &&
    a.from.lat === b.from.lat &&
    a.from.lng === b.from.lng &&
    a.from.year === b.from.year &&
    a.to.place === b.to.place &&
    a.to.lat === b.to.lat &&
    a.to.lng === b.to.lng &&
    a.to.year === b.to.year
  );
}

declare global {
  interface Window {
    CESIUM_BASE_URL?: string;
    __WATSON_GLOBE_VIEWER__?: CesiumViewer;
  }
}

// Set Cesium base URL for workers/assets
if (typeof window !== 'undefined') {
  window.CESIUM_BASE_URL = '/cesium';
}

/** Default event types matching useGlobeViewState defaults */
const DEFAULT_EVENT_TYPES = [
  'birth',
  'death',
  'marriage',
  'census',
  'residence',
];

interface CesiumGlobeProps {
  onPersonSelect?: (personId: string) => void;
  journeyMode?: JourneyModeData | null;
  onJourneyClose?: () => void;
  viewState: GlobeViewState;
  onViewStateChange: (partial: Partial<GlobeViewState>) => void;
  viewerSurnames?: Set<string>;
  viewerAncestorIds?: Set<string>;
  viewerId?: string | null;
  viewerAncestryLoading?: boolean;
  viewerAncestryError?: string | null;
  isSidebarOpen?: boolean;
  onCloseSidebar?: () => void;
  debugGlobe?: boolean;
}

function ViewerMountObserver({
  onViewerReady,
}: {
  onViewerReady: (viewer: CesiumViewer) => void;
}) {
  const { viewer } = useCesium();

  useEffect(() => {
    if (viewer) {
      onViewerReady(viewer);
    }
  }, [viewer, onViewerReady]);

  return null;
}

export default function CesiumGlobe({
  onPersonSelect,
  journeyMode,
  onJourneyClose,
  viewState,
  onViewStateChange,
  viewerSurnames,
  viewerAncestorIds,
  viewerId = null,
  viewerAncestryLoading = false,
  viewerAncestryError = null,
  isSidebarOpen,
  onCloseSidebar,
  debugGlobe = false,
}: CesiumGlobeProps) {
  const responsiveIsMobile = useIsMobile();
  const isMobile =
    responsiveIsMobile ??
    (typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(max-width: 767px)').matches);
  const viewerRef = useRef<{ cesiumElement?: CesiumViewer } | null>(null);
  const [mountedViewer, setMountedViewer] = useState<CesiumViewer | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(
    null,
  );
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [hoveredLocationId, setHoveredLocationId] = useState<number | null>(
    null,
  );
  const [selectedArc, setSelectedArc] = useState<Arc | null>(null);
  const [mobileSheetMode, setMobileSheetMode] =
    useState<MobileGlobeSheetMode>('controls');
  const [mobileSheetSnap, setMobileSheetSnap] =
    useState<MobileGlobeSheetSnap>('collapsed');
  const [lastControlsSnap, setLastControlsSnap] = useState<'half' | 'full'>(
    'half',
  );
  const prevMobileHighlightRef = useRef<string | null | undefined>(undefined);

  const { globeData, filteredLocations, filteredArcs } = useGlobeFilteredData({
    viewState,
    viewerSurnames,
    viewerAncestorIds,
  });

  const vizMode = useVisualizationMode(
    viewState.viewMode,
    viewerId ?? null,
    globeData,
    filteredLocations,
    viewState.yearRange,
  );

  useGlobeCamera({
    viewerRef,
    viewerReady: mountedViewer !== null,
    globeData,
    journeyMode,
    initialCamera: viewState.camera,
  });

  const {
    journeyIndex,
    isPlaying,
    playSpeed,
    handleJourneyPlayPause,
    handleJourneyIndexChange,
    handleJourneySpeedChange,
    handleJourneyClose,
  } = useJourneyPlayback({ journeyMode, viewerRef, onJourneyClose });

  const personHighlight = usePersonHighlight(
    viewState.highlightPerson,
    globeData,
  );
  const { fitToLocations, fitToVisible } = useFitCamera({ viewerRef });

  // Auto-fly to person locations when a person is selected via search
  const prevHighlightRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      viewState.highlightPerson &&
      viewState.highlightPerson !== prevHighlightRef.current &&
      personHighlight.isActive &&
      personHighlight.locationIds.size > 0
    ) {
      const personLocations = filteredLocations.filter((loc) =>
        personHighlight.locationIds.has(loc.id),
      );
      if (personLocations.length > 0) {
        fitToLocations(personLocations);
      }
    }
    prevHighlightRef.current = viewState.highlightPerson;
  }, [
    viewState.highlightPerson,
    personHighlight,
    filteredLocations,
    fitToLocations,
  ]);

  // Active filters check
  const hasActiveFilters = useMemo(() => {
    const hasNonDefaultEvents =
      viewState.eventTypes.length !== DEFAULT_EVENT_TYPES.length ||
      !DEFAULT_EVENT_TYPES.every((t) => viewState.eventTypes.includes(t));
    return (
      viewState.regions.length > 0 ||
      viewState.highlightPerson !== null ||
      viewState.yearRange !== null ||
      hasNonDefaultEvents ||
      (viewState.branch !== '' && viewState.branch !== 'all')
    );
  }, [
    viewState.regions,
    viewState.highlightPerson,
    viewState.yearRange,
    viewState.eventTypes,
    viewState.branch,
  ]);

  const handleFitToView = useCallback(() => {
    fitToVisible(filteredLocations);
  }, [fitToVisible, filteredLocations]);

  const handleResetFilters = useCallback(() => {
    // Preserve the active branch (e.g. "My Lines") — resetting should only
    // clear the *constraint* filters (year range, regions, highlighted person,
    // event types), not the user's chosen scope.
    onViewStateChange({
      regions: [],
      highlightPerson: null,
      yearRange: null,
      eventTypes: ['birth', 'death', 'marriage', 'census', 'residence'],
    });
  }, [onViewStateChange]);

  // Visible (non-hidden) entities
  const visibleLocations = useMemo(
    () => filteredLocations.filter((loc) => loc.visibility !== 'hidden'),
    [filteredLocations],
  );

  const visibleArcs = useMemo(
    () => filteredArcs.filter((arc) => arc.visibility !== 'hidden'),
    [filteredArcs],
  );

  // Stats
  const fullLocationCount = useMemo(
    () => filteredLocations.filter((loc) => loc.visibility === 'full').length,
    [filteredLocations],
  );
  const fullArcCount = useMemo(
    () => filteredArcs.filter((arc) => arc.visibility === 'full').length,
    [filteredArcs],
  );
  const dimmedLocationCount = useMemo(
    () => filteredLocations.filter((loc) => loc.visibility === 'dimmed').length,
    [filteredLocations],
  );
  const hiddenLocationCount = useMemo(
    () => filteredLocations.filter((loc) => loc.visibility === 'hidden').length,
    [filteredLocations],
  );
  const dimmedArcCount = useMemo(
    () => filteredArcs.filter((arc) => arc.visibility === 'dimmed').length,
    [filteredArcs],
  );
  const hiddenArcCount = useMemo(
    () => filteredArcs.filter((arc) => arc.visibility === 'hidden').length,
    [filteredArcs],
  );

  const selectedLocation = useMemo(() => {
    if (selectedLocationId === null) return null;

    const location =
      filteredLocations.find((entry) => entry.id === selectedLocationId) ??
      null;
    if (
      !location ||
      location.visibility !== 'full' ||
      location.visiblePeopleCount === 0
    ) {
      return null;
    }

    return location;
  }, [filteredLocations, selectedLocationId]);

  const selectedArcIsVisible = useMemo(() => {
    if (!selectedArc) {
      return false;
    }

    return filteredArcs.some(
      (arc) => arc.visibility === 'full' && arcsEqual(arc, selectedArc),
    );
  }, [filteredArcs, selectedArc]);

  const restoreControlsSheet = useCallback(() => {
    setMobileSheetMode('controls');
    setMobileSheetSnap(lastControlsSnap);
  }, [lastControlsSnap]);

  const collapseControlsSheet = useCallback(() => {
    setMobileSheetMode('controls');
    setMobileSheetSnap('collapsed');
  }, []);

  const openControlsSheet = useCallback(() => {
    setSelectedLocationId(null);
    setSelectedArc(null);
    setMobileSheetMode('controls');
    setMobileSheetSnap(lastControlsSnap);
    onCloseSidebar?.();
  }, [lastControlsSnap, onCloseSidebar]);

  const handleSheetSnapToggle = useCallback(() => {
    setMobileSheetSnap((current) => {
      const next = current === 'full' ? 'half' : 'full';

      if (mobileSheetMode === 'controls') {
        setLastControlsSnap(next);
      }

      return next;
    });
  }, [mobileSheetMode]);

  const waitingOnViewerLines =
    viewState.branch === 'my-lines' &&
    Boolean(viewerId) &&
    viewerAncestryLoading;

  const isEmptyState = useMemo(
    () =>
      globeData !== null &&
      fullLocationCount === 0 &&
      hasActiveFilters &&
      !waitingOnViewerLines,
    [globeData, fullLocationCount, hasActiveFilters, waitingOnViewerLines],
  );

  // Approximate locations for ring rendering
  const approximateLocations = useMemo(() => {
    if (!viewState.showApproximate) return [];
    return visibleLocations.filter(
      (loc) => loc.isApproximate && loc.precision !== 'exact',
    );
  }, [visibleLocations, viewState.showApproximate]);
  const playbackYearBounds = useMemo<[number, number] | null>(() => {
    const years: number[] = [];

    for (const location of filteredLocations) {
      if (location.visibility !== 'full') {
        continue;
      }

      for (const person of location.visiblePeople) {
        for (const event of person.events) {
          if (event.year === null) {
            continue;
          }
          if (!viewState.eventTypes.includes(event.type)) {
            continue;
          }
          years.push(event.year);
        }
      }
    }

    if (years.length === 0) {
      return null;
    }

    return [Math.min(...years), Math.max(...years)];
  }, [filteredLocations, viewState.eventTypes]);

  const isDensityMode = viewState.viewMode === 'density';
  const isGenerationMode = viewState.viewMode === 'generation';
  const isOriginsMode = viewState.viewMode === 'origins';

  // Hover event handler — needs direct viewer access
  useEffect(() => {
    if (!mountedViewer || !globeData) return;

    const handler = mountedViewer.screenSpaceEventHandler;
    const locationNameToId = new Map<string, number>();
    visibleLocations.forEach((loc) => {
      locationNameToId.set(loc.name, loc.id);
    });

    handler.setInputAction((movement: { endPosition: Cartesian2 }) => {
      const picked = mountedViewer.scene.pick(movement.endPosition);
      if (defined(picked) && defined(picked.id)) {
        const entity = picked.id;
        if (
          entity.name &&
          locationNameToId.has(entity.name._value || entity.name)
        ) {
          const name = entity.name._value || entity.name;
          setHoveredLocationId(locationNameToId.get(name) || null);
        } else {
          setHoveredLocationId(null);
        }
      } else {
        setHoveredLocationId(null);
      }
    }, ScreenSpaceEventType.MOUSE_MOVE);

    return () => {
      handler.removeInputAction(ScreenSpaceEventType.MOUSE_MOVE);
    };
  }, [globeData, mountedViewer, visibleLocations]);

  useEffect(() => {
    if (journeyMode) {
      setSelectedLocationId(null);
      setSelectedPersonId(null);
      setSelectedArc(null);
      collapseControlsSheet();
    }
  }, [journeyMode, collapseControlsSheet]);

  useEffect(() => {
    if (isSidebarOpen) {
      setSelectedLocationId(null);
      setSelectedPersonId(null);
      setSelectedArc(null);
      collapseControlsSheet();
    }
  }, [isSidebarOpen, collapseControlsSheet]);

  useEffect(() => {
    if (selectedLocationId !== null && !selectedLocation) {
      setSelectedLocationId(null);
      setSelectedPersonId(null);
      if (isMobile) {
        restoreControlsSheet();
      }
    }
  }, [selectedLocationId, selectedLocation, isMobile, restoreControlsSheet]);

  useEffect(() => {
    if (!selectedArc || selectedArcIsVisible) {
      return;
    }

    setSelectedArc(null);
    if (isMobile) {
      restoreControlsSheet();
    }
  }, [isMobile, restoreControlsSheet, selectedArc, selectedArcIsVisible]);

  useEffect(() => {
    if (!isMobile || journeyMode) {
      return;
    }

    if (
      viewState.highlightPerson &&
      viewState.highlightPerson !== prevMobileHighlightRef.current
    ) {
      setSelectedLocationId(null);
      setSelectedArc(null);
      setSelectedPersonId(null);
      setMobileSheetMode('highlight');
      setMobileSheetSnap('half');
    } else if (!viewState.highlightPerson && mobileSheetMode === 'highlight') {
      restoreControlsSheet();
    }

    prevMobileHighlightRef.current = viewState.highlightPerson;
  }, [
    isMobile,
    journeyMode,
    mobileSheetMode,
    restoreControlsSheet,
    viewState.highlightPerson,
  ]);

  useEffect(() => {
    if (
      !isMobile ||
      journeyMode ||
      mobileSheetMode !== 'highlight' ||
      !viewState.highlightPerson ||
      personHighlight.personName !== null
    ) {
      return;
    }

    setSelectedLocationId(null);
    setSelectedArc(null);
    setSelectedPersonId(null);
  }, [
    isMobile,
    journeyMode,
    mobileSheetMode,
    personHighlight.personName,
    viewState.highlightPerson,
  ]);

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      window.location.hostname !== 'localhost'
    ) {
      return;
    }

    if (!mountedViewer) return;

    window.__WATSON_GLOBE_VIEWER__ = mountedViewer;
    return () => {
      if (window.__WATSON_GLOBE_VIEWER__ === mountedViewer) {
        delete window.__WATSON_GLOBE_VIEWER__;
      }
    };
  }, [mountedViewer]);

  const getLocationColor = useCallback(
    (
      location: Pick<
        Location,
        'country' | 'name' | 'city' | 'state' | 'lat' | 'lng'
      >,
    ): Color => {
      const region = getLocationRegion(location);
      return REGION_COLORS[region] || REGION_COLORS['default'];
    },
    [],
  );

  const handleLocationClick = useCallback(
    (location: Location) => {
      setSelectedLocationId(location.id);
      setSelectedPersonId(null);
      setSelectedArc(null);
      if (isMobile) {
        setMobileSheetMode('location');
        setMobileSheetSnap('half');
      }
      onCloseSidebar?.();
    },
    [isMobile, onCloseSidebar],
  );

  const handlePersonClick = useCallback(
    (person: Person) => {
      setSelectedPersonId(person.id);
      onCloseSidebar?.();
      if (onPersonSelect) {
        onPersonSelect(person.id);
      }
    },
    [onPersonSelect, onCloseSidebar],
  );

  const handleMobilePersonHighlight = useCallback(
    (person: Person) => {
      setSelectedLocationId(null);
      setSelectedArc(null);
      setSelectedPersonId(null);
      onViewStateChange({ highlightPerson: person.id });
      onCloseSidebar?.();
    },
    [onCloseSidebar, onViewStateChange],
  );

  const closePanel = useCallback(() => {
    setSelectedLocationId(null);
    setSelectedPersonId(null);
    setSelectedArc(null);
  }, []);

  const closeLocationDetail = useCallback(() => {
    setSelectedLocationId(null);
    restoreControlsSheet();
  }, [restoreControlsSheet]);

  const closeArcDetail = useCallback(() => {
    setSelectedArc(null);
    restoreControlsSheet();
  }, [restoreControlsSheet]);

  const closeHighlightDetail = useCallback(() => {
    restoreControlsSheet();
  }, [restoreControlsSheet]);

  const handleArcClick = useCallback(
    (arc: Arc) => {
      setSelectedArc(arc);
      setSelectedLocationId(null);
      setSelectedPersonId(null);
      if (isMobile) {
        setMobileSheetMode('arc');
        setMobileSheetSnap('half');
      }
      onCloseSidebar?.();
    },
    [isMobile, onCloseSidebar],
  );

  const handleYearRangeChange = useCallback(
    (yearRange: [number, number] | null) => {
      onViewStateChange({ yearRange });
    },
    [onViewStateChange],
  );

  const clearHighlight = useCallback(() => {
    onViewStateChange({ highlightPerson: null });
    restoreControlsSheet();
  }, [onViewStateChange, restoreControlsSheet]);

  const mobileSheetTitle = useMemo(() => {
    switch (mobileSheetMode) {
      case 'location':
        return selectedLocation?.name ?? 'Location';
      case 'arc':
        return 'Migration Path';
      case 'highlight':
        return personHighlight.personName ?? 'Highlighted Person';
      default:
        return 'Globe Controls';
    }
  }, [mobileSheetMode, personHighlight.personName, selectedLocation?.name]);

  if (!globeData) {
    return (
      <div className="flex items-center justify-center h-full bg-black">
        <div className="text-white/60">Loading family history...</div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-black flex flex-col">
      <div className="flex-1 relative min-h-0">
        <Viewer
          ref={viewerRef}
          full
          timeline={false}
          animation={false}
          baseLayerPicker={false}
          geocoder={false}
          homeButton={false}
          sceneModePicker={false}
          selectionIndicator={false}
          navigationHelpButton={false}
          infoBox={false}
        >
          <ViewerMountObserver onViewerReady={setMountedViewer} />
          {isOriginsMode && (
            <OriginPins
              originPins={vizMode.originPins}
              onLocationClick={handleLocationClick}
            />
          )}
          {isDensityMode && <DensityLayer bubbles={vizMode.densityBubbles} />}
          {!isDensityMode && !isOriginsMode && (
            <LocationPins
              locations={visibleLocations}
              hoveredLocationId={hoveredLocationId}
              selectedLocation={selectedLocation}
              journeyMode={journeyMode ?? null}
              isGenerationMode={isGenerationMode}
              generationDepthMap={vizMode.generationDepthMap}
              getLocationColor={getLocationColor}
              onLocationClick={handleLocationClick}
              showLabels={viewState.showLabels}
            />
          )}
          <ApproximateRings
            locations={approximateLocations}
            isDensityMode={isDensityMode}
            getLocationColor={getLocationColor}
          />
          {!isOriginsMode && viewState.showArcs && (
            <MigrationArcs
              arcs={visibleArcs}
              selectedPersonId={selectedPersonId}
              selectedArc={selectedArc}
              journeyMode={journeyMode ?? null}
              isDensityMode={isDensityMode}
              arcColorMode={viewState.arcColorMode}
              globeData={globeData}
              onArcClick={handleArcClick}
            />
          )}
        </Viewer>

        {journeyMode && journeyMode.stops[journeyIndex] && (
          <JourneyCard
            stop={journeyMode.stops[journeyIndex]}
            personName={journeyMode.personName}
            birthYear={journeyMode.birthYear}
            isFirst={journeyIndex === 0}
            isLast={journeyIndex === journeyMode.stops.length - 1}
          />
        )}
        {journeyMode && (
          <JourneyPlayer
            personName={journeyMode.personName}
            birthYear={journeyMode.birthYear}
            deathYear={journeyMode.deathYear}
            stops={journeyMode.stops}
            currentIndex={journeyIndex}
            isPlaying={isPlaying}
            speed={playSpeed}
            onIndexChange={handleJourneyIndexChange}
            onPlayPause={handleJourneyPlayPause}
            onSpeedChange={handleJourneySpeedChange}
            onClose={handleJourneyClose}
          />
        )}
        {!journeyMode && !isMobile && (
          <ControlDock
            viewState={viewState}
            onViewStateChange={onViewStateChange}
            locationCount={fullLocationCount}
            arcCount={fullArcCount}
            viewerSurnames={viewerSurnames}
            globeData={globeData}
            hasActiveFilters={hasActiveFilters}
            onFitToView={handleFitToView}
            hasViewer={vizMode.hasViewer}
            viewerAncestryLoading={viewerAncestryLoading}
            viewerAncestryError={viewerAncestryError}
            isSidebarOpen={isSidebarOpen}
            onCloseSidebar={onCloseSidebar}
          />
        )}
        {!journeyMode && waitingOnViewerLines && (
          <div className="absolute inset-x-4 top-20 z-10 rounded-xl border border-white/10 bg-black/55 px-4 py-3 text-sm text-white/70 backdrop-blur-sm sm:left-auto sm:right-4 sm:w-64">
            Loading your ancestor lines...
          </div>
        )}
        {!journeyMode && debugGlobe && (
          <aside
            data-testid="globe-debug-hud"
            className="pointer-events-none absolute bottom-4 left-4 z-10 max-w-md rounded-xl border border-emerald-400/30 bg-black/80 px-4 py-3 font-mono text-xs leading-5 text-emerald-100 shadow-2xl backdrop-blur-sm"
          >
            <div>Branch: {viewState.branch || 'all'}</div>
            <div>
              Year range:{' '}
              {viewState.yearRange
                ? `${viewState.yearRange[0]}-${viewState.yearRange[1]}`
                : 'all'}
            </div>
            <div>Viewer: {viewerId ?? 'none'}</div>
            <div>Ancestor IDs: {viewerAncestorIds?.size ?? 0}</div>
            <div>Surnames: {viewerSurnames?.size ?? 0}</div>
            <div>Has active filters: {hasActiveFilters ? 'yes' : 'no'}</div>
            <div>Empty state: {isEmptyState ? 'yes' : 'no'}</div>
            <div>
              Locations: {fullLocationCount} full / {dimmedLocationCount} dimmed
              / {hiddenLocationCount} hidden
            </div>
            <div>
              Arcs: {fullArcCount} full / {dimmedArcCount} dimmed /{' '}
              {hiddenArcCount} hidden
            </div>
          </aside>
        )}
        {!journeyMode && isEmptyState && (
          <EmptyFilterState
            onReset={handleResetFilters}
            viewState={viewState}
            onClearFilter={onViewStateChange}
          />
        )}
        {!journeyMode &&
          !isMobile &&
          personHighlight.isActive &&
          personHighlight.personName &&
          viewState.highlightPerson && (
            <PersonHighlightCard
              personName={personHighlight.personName}
              birthYear={personHighlight.birthYear}
              deathYear={personHighlight.deathYear}
              locationCount={personHighlight.locationIds.size}
              arcCount={personHighlight.arcIndices.size}
              highlightPersonId={viewState.highlightPerson}
              onClear={() => onViewStateChange({ highlightPerson: null })}
            />
          )}
        {selectedArc && !journeyMode && !isMobile && (
          <ArcDetailsPanel arc={selectedArc} onClose={closePanel} />
        )}

        {isMobile && !journeyMode && mobileSheetSnap !== 'collapsed' && (
          <MobileGlobeSheet
            mode={mobileSheetMode}
            snap={mobileSheetSnap}
            title={mobileSheetTitle}
            onClose={
              mobileSheetMode === 'controls'
                ? collapseControlsSheet
                : mobileSheetMode === 'location'
                  ? closeLocationDetail
                  : mobileSheetMode === 'arc'
                    ? closeArcDetail
                    : closeHighlightDetail
            }
            onToggleSnap={handleSheetSnapToggle}
          >
            {mobileSheetMode === 'controls' && (
              <MobileGlobeControls
                viewState={viewState}
                onViewStateChange={onViewStateChange}
                locationCount={fullLocationCount}
                arcCount={fullArcCount}
                viewerSurnames={viewerSurnames}
                viewerAncestryLoading={viewerAncestryLoading}
                viewerAncestryError={viewerAncestryError}
                globeData={globeData}
                hasActiveFilters={hasActiveFilters}
                hasViewer={vizMode.hasViewer}
                onFitToView={handleFitToView}
              />
            )}
            {mobileSheetMode === 'location' && selectedLocation && (
              <MobileLocationDetails
                location={selectedLocation}
                onPersonHighlight={handleMobilePersonHighlight}
              />
            )}
            {mobileSheetMode === 'arc' && selectedArc && (
              <MobileArcDetails arc={selectedArc} />
            )}
            {mobileSheetMode === 'highlight' && viewState.highlightPerson && (
              <MobileHighlightDetails
                personName={personHighlight.personName}
                birthYear={personHighlight.birthYear}
                deathYear={personHighlight.deathYear}
                locationCount={personHighlight.locationIds.size}
                arcCount={personHighlight.arcIndices.size}
                highlightPersonId={viewState.highlightPerson}
                onClear={clearHighlight}
              />
            )}
          </MobileGlobeSheet>
        )}
      </div>

      {!journeyMode && (
        <TimelineSlider
          globeData={globeData}
          yearRange={viewState.yearRange}
          playbackYearBounds={playbackYearBounds}
          onChange={handleYearRangeChange}
          controlsTrigger={
            isMobile ? (
              <button
                type="button"
                onClick={openControlsSheet}
                aria-label="Open globe controls"
                className="inline-flex h-8 flex-shrink-0 items-center gap-2 rounded-full bg-white/10 px-3 text-xs font-medium text-white transition-colors hover:bg-white/20"
                data-testid="mobile-globe-controls-trigger"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M7 12h10M10 18h4"
                  />
                </svg>
                <span>Controls</span>
              </button>
            ) : null
          }
        />
      )}
      {selectedLocation && !journeyMode && !isMobile && (
        <LocationPanel
          location={selectedLocation}
          selectedPersonId={selectedPersonId}
          onPersonClick={handlePersonClick}
          onClose={closePanel}
        />
      )}
    </div>
  );
}
