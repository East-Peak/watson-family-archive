'use client';

import { useMemo, Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PersonDrawer } from '@/components/PersonDrawer';
import { useChat } from '@/components/ChatProvider';
import { usePageContext } from '@/hooks/usePageContext';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useMe, hasViewerPerson } from '@/components/MeProvider';
import { siteConfig } from '@/lib/siteConfig';
import MobileTreeNavigator from '@/components/tree/mobile/MobileTreeNavigator';
import { useMobileTreePerson, type MobileTreePersonDetails } from '@/components/tree/mobile/useMobileTreePerson';
import { useMobileTreeRouteState } from '@/components/tree/mobile/useMobileTreeRouteState';
import { useTreeChartController } from './hooks/useTreeChartController';
import { FAMILY_CHART_THEME_CSS } from './lib/themeCss';
import TreeSearch from './TreeSearch';

import 'family-chart/styles/family-chart.css';

function collectMobileVisiblePersonIds(person: MobileTreePersonDetails | null, fallbackFocusId: string | null) {
  if (!person) {
    return fallbackFocusId ? [fallbackFocusId] : [];
  }

  return Array.from(new Set([
    person.id,
    person.father?.id,
    person.mother?.id,
    ...person.spouses.map((spouse) => spouse.id),
    ...person.children.map((child) => child.id),
    ...person.siblings.map((sibling) => sibling.id),
  ].filter((id): id is string => Boolean(id))));
}

function findMobileBranchPersonId(
  person: MobileTreePersonDetails | null,
  branch: string | undefined,
) {
  const normalizedBranch = branch?.trim().toLowerCase();
  if (!person || !normalizedBranch) return null;

  const candidates = Array.from(
    new Map(
      [
        { id: person.id, name: person.name },
        person.father,
        person.mother,
        ...person.spouses,
        ...person.children,
        ...person.siblings,
      ]
        .filter((candidate): candidate is { id: string; name: string } => Boolean(candidate?.id && candidate.name))
        .map((candidate) => [candidate.id, candidate]),
    ).values(),
  );

  const getSurname = (name: string) => name.trim().toLowerCase().split(/\s+/).at(-1) ?? '';

  const exactSurnameMatch = candidates.find((candidate) => getSurname(candidate.name) === normalizedBranch);
  if (exactSurnameMatch) return exactSurnameMatch.id;

  const partialSurnameMatch = candidates.find((candidate) => getSurname(candidate.name).includes(normalizedBranch));
  if (partialSurnameMatch) return partialSurnameMatch.id;

  const fullNameMatch = candidates.find((candidate) => candidate.name.toLowerCase().includes(normalizedBranch));
  return fullNameMatch?.id ?? null;
}

function DesktopTreeChartContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusId = searchParams.get('focus');
  const { visualizationCommand, clearVisualizationCommand, isSidebarOpen, closeSidebar } = useChat();
  const { me } = useMe();
  const viewerId = hasViewerPerson(me) ? me.id : null;

  const {
    containerRef,
    status,
    errorMsg,
    nodeCount,
    chartData,
    drawerPersonId,
    treeFocusPersonId,
    visiblePersonIds,
    handleCloseDrawer,
    handleFocusPerson,
    fitToScreen,
  } = useTreeChartController({
    focusId,
    viewerId,
    visualizationCommand,
    clearVisualizationCommand,
    push: router.push,
    isSidebarOpen,
  });

  useEffect(() => {
    if (drawerPersonId) {
      closeSidebar();
    }
  }, [drawerPersonId, closeSidebar]);

  const pageContext = useMemo(() => ({
    type: 'tree' as const,
    focusPersonId: treeFocusPersonId ?? undefined,
    visiblePersonIds,
  }), [treeFocusPersonId, visiblePersonIds]);

  usePageContext(pageContext);

  const searchPeople = useMemo(() => {
    return chartData.map(d => ({
      id: d.id,
      name: `${d.data['first name']} ${d.data['last name']}`.trim(),
      birthYear: d.data.birthday || undefined,
    }));
  }, [chartData]);

  return (
    <div className="flex flex-col relative bg-vignette h-full">
      <div
        data-testid="tree-floating-controls"
        className="absolute top-4 left-1/2 z-10 flex w-max -translate-x-1/2 flex-col items-center gap-3 md:flex-row"
      >
        <div className="bg-white/95 backdrop-blur-md shadow-lg border border-shield/10 px-6 py-3 rounded-full flex justify-between items-center gap-6">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-serif font-bold text-shield tracking-tight">Family Tree</h2>
            {status === 'ready' && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-shield/5 text-shield/70 border border-shield/10">
                {nodeCount} people
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            {status === 'ready' && (
              <TreeSearch people={searchPeople} onSelect={handleFocusPerson} />
            )}
            <span className="text-xs text-gray-500 hidden sm:inline italic">
              {typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent) ? '\u2318' : 'Ctrl'}+click for profile
            </span>
            <button
              onClick={fitToScreen}
              className="text-xs font-semibold px-4 py-1.5 bg-shield text-white rounded-full hover:bg-shield/90 hover:-translate-y-0.5 hover:shadow-lg transition-all"
            >
              Fit to Screen
            </button>
          </div>
        </div>
      </div>

      {status === 'loading' && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="inline-block w-8 h-8 border-4 border-shield/30 border-t-shield rounded-full animate-spin mb-4" />
            <p className="text-gray-600">Loading family tree data...</p>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md">
            <div className="text-red-500 text-4xl mb-4">!</div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">
              Failed to load tree
            </h3>
            <p className="text-gray-600 text-sm mb-4">{errorMsg}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-shield text-white rounded hover:bg-shield/90 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      <div
        ref={containerRef}
        className="flex-1 f3 f3-cont"
        style={{
          display: status === 'loading' || status === 'error' ? 'none' : 'flex',
        }}
      />

      <PersonDrawer
        personId={drawerPersonId}
        onClose={handleCloseDrawer}
        onFocusPerson={handleFocusPerson}
      />

      <style>{FAMILY_CHART_THEME_CSS}</style>
    </div>
  );
}

function MobileTreeNavigatorContent() {
  const router = useRouter();
  const { visualizationCommand, clearVisualizationCommand } = useChat();
  const { me } = useMe();
  const viewerId = hasViewerPerson(me) ? me.id : null;
  const fallbackFocusId = siteConfig.rootPersonId;
  const {
    focusPersonId,
    defaultFocusPersonId,
    defaultFocusSource,
    hasExplicitFocusParam,
    detailPersonId,
    pushFocusPerson,
    replaceFocusPerson,
    openDetails,
    closeDetails,
    inspectPerson,
    viewHere,
  } = useMobileTreeRouteState({
    viewerId,
    fallbackFocusId,
  });

  const { person: focusPerson, loading, error } = useMobileTreePerson(focusPersonId);
  const { person: detailPerson, loading: detailLoading, error: detailError } = useMobileTreePerson(detailPersonId);

  useEffect(() => {
    if (!error || !hasExplicitFocusParam || !defaultFocusPersonId || focusPersonId === defaultFocusPersonId) {
      return;
    }

    replaceFocusPerson(defaultFocusPersonId);
  }, [defaultFocusPersonId, error, focusPersonId, hasExplicitFocusParam, replaceFocusPerson]);

  const recoveringInvalidFocus = Boolean(
    error &&
    hasExplicitFocusParam &&
    defaultFocusPersonId &&
    focusPersonId !== defaultFocusPersonId,
  );

  useEffect(() => {
    if (!visualizationCommand) {
      return;
    }

    if (visualizationCommand.target !== 'tree' && visualizationCommand.target !== 'both') {
      return;
    }

    const explicitPersonId =
      visualizationCommand.params.personId ??
      visualizationCommand.params.personIds?.[0] ??
      null;
    const branchPersonId = findMobileBranchPersonId(focusPerson, visualizationCommand.params.branch);

    if (
      visualizationCommand.action === 'filter' &&
      !explicitPersonId &&
      visualizationCommand.params.branch &&
      loading
    ) {
      return;
    }

    switch (visualizationCommand.action) {
      case 'focusOn':
      case 'highlight':
      case 'filter':
        if (explicitPersonId) {
          replaceFocusPerson(explicitPersonId);
        } else if (visualizationCommand.params.branch && branchPersonId) {
          replaceFocusPerson(branchPersonId);
        }
        break;
      case 'reset':
        if (viewerId) {
          replaceFocusPerson(viewerId);
        } else if (fallbackFocusId) {
          replaceFocusPerson(fallbackFocusId);
        }
        break;
      case 'showCollection':
        if (visualizationCommand.params.collectionType) {
          router.push(`/collection/${visualizationCommand.params.collectionType}`);
        }
        break;
    }

    clearVisualizationCommand();
  }, [
    clearVisualizationCommand,
    fallbackFocusId,
    focusPerson,
    loading,
    replaceFocusPerson,
    router,
    viewerId,
    visualizationCommand,
  ]);

  const defaultFocusLabel = defaultFocusSource === 'viewer'
    ? 'Return to viewer'
    : defaultFocusSource === 'home'
      ? 'Return to home person'
      : null;
  const showRecoveryAction = Boolean(
    defaultFocusPersonId &&
    focusPerson?.id &&
    focusPerson.id !== defaultFocusPersonId,
  );

  const effectiveFocusPersonId = error && hasExplicitFocusParam && defaultFocusPersonId
    ? defaultFocusPersonId
    : focusPerson?.id ?? focusPersonId ?? undefined;

  const pageContext = useMemo(() => ({
    type: 'tree' as const,
    focusPersonId: effectiveFocusPersonId,
    visiblePersonIds: collectMobileVisiblePersonIds(focusPerson, effectiveFocusPersonId ?? null),
  }), [effectiveFocusPersonId, focusPerson]);

  usePageContext(pageContext);

  return (
    <div className="min-h-full bg-vignette">
      <MobileTreeNavigator
        focusPerson={focusPerson}
        detailPerson={detailPerson}
        loading={loading || recoveringInvalidFocus}
        error={recoveringInvalidFocus ? null : error}
        detailLoading={detailLoading}
        detailError={detailError}
        detailOpen={Boolean(detailPersonId)}
        defaultFocusLabel={defaultFocusLabel}
        showRecoveryAction={showRecoveryAction}
        onSelectFocus={pushFocusPerson}
        onOpenDetails={openDetails}
        onCloseDetails={closeDetails}
        onInspectPerson={inspectPerson}
        onViewHere={viewHere}
        onReturnToDefault={() => {
          if (defaultFocusPersonId) {
            pushFocusPerson(defaultFocusPersonId);
          }
        }}
      />
    </div>
  );
}

function TreePageContent() {
  const isMobile = useIsMobile();

  if (isMobile === null) {
    return (
      <div className="min-h-full bg-vignette flex items-center justify-center">
        <div className="text-shield/60 font-serif text-xl animate-pulse">Loading family tree...</div>
      </div>
    );
  }

  return isMobile ? <MobileTreeNavigatorContent /> : <DesktopTreeChartContent />;
}

export default function TreePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-full bg-vignette flex items-center justify-center">
          <div className="text-shield/60 font-serif text-xl animate-pulse">Loading family tree...</div>
        </div>
      }
    >
      <TreePageContent />
    </Suspense>
  );
}
