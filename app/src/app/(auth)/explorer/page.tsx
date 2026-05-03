'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useExplorerViewState } from '@/components/explorer/hooks/useExplorerViewState';
import { useRouteContextProvider } from '@/hooks/useRouteContextProvider';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useExplorerFilteredData } from '@/components/explorer/hooks/useExplorerFilteredData';
import { useExplorerRecordsData } from '@/components/explorer/hooks/useExplorerRecordsData';
import ExplorerHeader from '@/components/explorer/ExplorerHeader';
import ExplorerFilters from '@/components/explorer/ExplorerFilters';
import ExplorerTable from '@/components/explorer/ExplorerTable';
import RecordsTable from '@/components/explorer/RecordsTable';
import MobileExplorerSummaryBar from '@/components/explorer/mobile/MobileExplorerSummaryBar';
import MobileExplorerFilterSheet from '@/components/explorer/mobile/MobileExplorerFilterSheet';
import MobileExplorerPersonCard from '@/components/explorer/mobile/MobileExplorerPersonCard';
import MobileExplorerRecordCard from '@/components/explorer/mobile/MobileExplorerRecordCard';
import type { SortField, RecordSortField } from '@/components/explorer/types';

const PEOPLE_SORT_LABELS: Record<SortField, string> = {
  fullName: 'Name',
  birthYear: 'Birth year',
  deathYear: 'Death year',
  originCountry: 'Origin',
  sex: 'Sex',
  status: 'Record status',
  completenessScore: 'Completeness',
  sourceCount: 'Sources',
  researchScore: 'Research',
  validationStatus: 'Validation',
};

const RECORD_SORT_LABELS: Record<RecordSortField, string> = {
  type: 'Type',
  year: 'Year',
  collection: 'Collection',
  place: 'Place',
  participantCount: 'Participants',
  tier: 'Tier',
  evidenceClass: 'Evidence',
  linkedPeople: 'Linked people',
};

function toTitleCase(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatExplorerSortSummary(viewMode: 'people' | 'records', viewState: ReturnType<typeof useExplorerViewState>['state']) {
  if (viewMode === 'records') {
    const label = RECORD_SORT_LABELS[viewState.recordSortField];
    return `Sort: ${label}${viewState.recordSortDirection === 'desc' ? ' desc' : ''}`;
  }

  const label = PEOPLE_SORT_LABELS[viewState.sortField];
  return `Sort: ${label}${viewState.sortDirection === 'desc' ? ' desc' : ''}`;
}

function countActiveExplorerFilters(viewState: ReturnType<typeof useExplorerViewState>['state']) {
  if (viewState.viewMode === 'records') {
    let count = 0;
    if (viewState.recordQuery.trim()) count += 1;
    count += viewState.recordTypes.length;
    count += viewState.tiers.length;
    if (viewState.yearMin !== 0 || viewState.yearMax !== 9999) count += 1;
    if (viewState.collectionSearch.trim()) count += 1;
    if (viewState.participantSearch.trim()) count += 1;
    return count;
  }

  let count = 0;
  if (viewState.query.trim()) count += 1;
  count += viewState.centuries.length;
  count += viewState.countries.length;
  if (viewState.sex) count += 1;
  count += viewState.statuses.length;
  if (viewState.completenessMin !== 0 || viewState.completenessMax !== 100) count += 1;
  if (viewState.validation) count += 1;
  if (viewState.hasSources) count += 1;
  return count;
}

function buildExplorerRouteContext(viewState: ReturnType<typeof useExplorerViewState>['state']): Record<string, unknown> {
  if (viewState.viewMode === 'records') {
    const context: Record<string, unknown> = {
      view: 'Records',
    };

    if (viewState.recordQuery.trim()) context.search = viewState.recordQuery.trim();
    if (viewState.recordTypes.length > 0) context.recordTypes = viewState.recordTypes;
    if (viewState.tiers.length > 0) context.tiers = viewState.tiers;
    if (viewState.yearMin !== 0 || viewState.yearMax !== 9999) {
      context.yearRange = {
        ...(viewState.yearMin !== 0 ? { startYear: viewState.yearMin } : {}),
        ...(viewState.yearMax !== 9999 ? { endYear: viewState.yearMax } : {}),
      };
    }
    if (viewState.collectionSearch.trim()) context.collectionSearch = viewState.collectionSearch.trim();
    if (viewState.participantSearch.trim()) context.participantSearch = viewState.participantSearch.trim();
    if (viewState.recordSortField !== 'year' || viewState.recordSortDirection !== 'asc') {
      context.sort = {
        label: RECORD_SORT_LABELS[viewState.recordSortField],
        direction: viewState.recordSortDirection,
      };
    }

    return context;
  }

  const context: Record<string, unknown> = {
    view: 'People',
  };

  if (viewState.query.trim()) context.search = viewState.query.trim();
  if (viewState.countries.length > 0) context.countries = viewState.countries;
  if (viewState.centuries.length > 0) context.centuries = viewState.centuries;
  if (viewState.statuses.length > 0) context.statuses = viewState.statuses.map((status) => toTitleCase(status));
  if (viewState.sex) {
    context.sex = viewState.sex === 'M' ? 'Male' : viewState.sex === 'F' ? 'Female' : 'Unknown';
  }
  if (viewState.completenessMin !== 0 || viewState.completenessMax !== 100) {
    context.completenessRange = {
      min: viewState.completenessMin,
      max: viewState.completenessMax,
    };
  }
  if (viewState.validation) context.validation = toTitleCase(viewState.validation);
  if (viewState.hasSources) {
    context.hasSources = viewState.hasSources === 'yes' ? 'Has sources' : 'No sources';
  }
  if (viewState.sortField !== 'fullName' || viewState.sortDirection !== 'asc') {
    context.sort = {
      label: PEOPLE_SORT_LABELS[viewState.sortField],
      direction: viewState.sortDirection,
    };
  }

  return context;
}

export default function ExplorerPage() {
  const {
    state: viewState,
    setState: setViewState,
    resetState,
    resetPeopleState,
    resetRecordsState,
  } = useExplorerViewState();
  const peopleResult = useExplorerFilteredData(viewState);
  const recordsResult = useExplorerRecordsData(viewState);
  const isMobile = useIsMobile();
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);

  const isRecordsMode = viewState.viewMode === 'records';
  const activeResultLabel = isRecordsMode ? 'records' : 'people';
  const routeContext = useMemo(() => buildExplorerRouteContext(viewState), [viewState]);
  const activeFilterCount = useMemo(() => countActiveExplorerFilters(viewState), [viewState]);
  const activeSummary = useMemo(() => {
    const sortSummary = formatExplorerSortSummary(viewState.viewMode, viewState);
    if (activeFilterCount < 1) return sortSummary;
    return `${activeFilterCount} filter${activeFilterCount === 1 ? '' : 's'} · ${sortSummary}`;
  }, [activeFilterCount, viewState]);

  useEffect(() => {
    if (isMobile === false) {
      setIsFilterSheetOpen(false);
    }
  }, [isMobile]);

  const routeContextProvider = useCallback(
    () => routeContext,
    [routeContext],
  );
  useRouteContextProvider(routeContextProvider);

  const handleSort = useCallback(
    (field: SortField) => {
      if (viewState.sortField === field) {
        setViewState({ sortDirection: viewState.sortDirection === 'asc' ? 'desc' : 'asc' });
      } else {
        setViewState({ sortField: field, sortDirection: 'asc' });
      }
    },
    [viewState.sortField, viewState.sortDirection, setViewState],
  );

  const handleRecordSort = useCallback(
    (field: RecordSortField) => {
      if (viewState.recordSortField === field) {
        setViewState({ recordSortDirection: viewState.recordSortDirection === 'asc' ? 'desc' : 'asc' });
      } else {
        setViewState({ recordSortField: field, recordSortDirection: 'asc' });
      }
    },
    [viewState.recordSortField, viewState.recordSortDirection, setViewState],
  );

  const loading = isRecordsMode ? recordsResult.loading : peopleResult.loading;
  const totalCount = isRecordsMode ? recordsResult.totalCount : peopleResult.totalCount;
  const filteredCount = isRecordsMode ? recordsResult.filteredCount : peopleResult.filteredCount;
  const activeReset = isRecordsMode ? resetRecordsState : resetPeopleState;

  if (loading || isMobile === null) {
    return (
      <div className="flex items-center justify-center h-full bg-parchment">
        <div className="text-shield/60 text-lg">Loading explorer...</div>
      </div>
    );
  }

  if (isMobile === true) {
    return (
      <main className="flex h-full flex-col bg-parchment text-shield">
        <MobileExplorerFilterSheet
          open={isFilterSheetOpen}
          onClose={() => setIsFilterSheetOpen(false)}
          viewState={viewState}
          filterOptions={peopleResult.filterOptions}
          recordsFilterOptions={recordsResult.filterOptions}
          onStateChange={setViewState}
          onResetActive={activeReset}
        />

        <div className="flex-1 overflow-y-auto md:hidden" data-testid="mobile-explorer-results">
          <MobileExplorerSummaryBar
            viewMode={viewState.viewMode}
            resultCount={filteredCount}
            resultLabel={activeResultLabel}
            activeSummary={activeSummary}
            onViewModeChange={(viewMode) => setViewState({ viewMode })}
            onOpenFilters={() => setIsFilterSheetOpen(true)}
          />

          <div className="space-y-3 px-4 py-4">
            {isRecordsMode ? (
              recordsResult.filteredData.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-shield/15 bg-white/70 px-4 py-10 text-center text-sm text-shield/50">
                  No records match your filters.
                </div>
              ) : (
                recordsResult.filteredData.map((record) => (
                  <MobileExplorerRecordCard key={record.id} record={record} />
                ))
              )
            ) : peopleResult.filteredData.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-shield/15 bg-white/70 px-4 py-10 text-center text-sm text-shield/50">
                No people match your filters.
              </div>
            ) : (
              peopleResult.filteredData.map((person) => (
                <MobileExplorerPersonCard key={person.id} person={person} />
              ))
            )}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="h-full flex flex-col bg-parchment text-shield">
      <ExplorerHeader
        totalCount={totalCount}
        filteredCount={filteredCount}
        viewState={viewState}
        onStateChange={setViewState}
        onReset={resetState}
      />
      <div className="flex flex-1 min-h-0">
        <ExplorerFilters
          viewState={viewState}
          filterOptions={peopleResult.filterOptions}
          onStateChange={setViewState}
          recordsFilterOptions={recordsResult.filterOptions}
        />
        {isRecordsMode ? (
          <RecordsTable
            data={recordsResult.filteredData}
            sortField={viewState.recordSortField}
            sortDirection={viewState.recordSortDirection}
            onSort={handleRecordSort}
          />
        ) : (
          <ExplorerTable
            data={peopleResult.filteredData}
            sortField={viewState.sortField}
            sortDirection={viewState.sortDirection}
            onSort={handleSort}
          />
        )}
      </div>
    </main>
  );
}
