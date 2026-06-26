'use client';

import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import BottomSheet from '@/components/mobile/BottomSheet';
import {
  resetPeopleExplorerState,
  resetRecordsExplorerState,
} from '@/components/explorer/hooks/useExplorerViewState';
import type {
  ExplorerFilterOptions,
  ExplorerViewState,
  RecordsFilterOptions,
  RecordSortField,
  SortField,
  SortDirection,
} from '../types';

interface MobileExplorerFilterSheetProps {
  open: boolean;
  onClose: () => void;
  viewState: ExplorerViewState;
  filterOptions: ExplorerFilterOptions;
  recordsFilterOptions: RecordsFilterOptions;
  onStateChange: (partial: Partial<ExplorerViewState>) => void;
  onResetActive: () => void;
}

function toggleListItem(list: string[], item: string): string[] {
  return list.includes(item)
    ? list.filter((value) => value !== item)
    : [...list, item];
}

const PEOPLE_SORT_OPTIONS: Array<{ value: SortField; label: string }> = [
  { value: 'fullName', label: 'Name' },
  { value: 'birthYear', label: 'Birth year' },
  { value: 'deathYear', label: 'Death year' },
  { value: 'originCountry', label: 'Origin' },
  { value: 'sex', label: 'Sex' },
  { value: 'status', label: 'Record status' },
  { value: 'completenessScore', label: 'Completeness' },
  { value: 'sourceCount', label: 'Sources' },
  { value: 'researchScore', label: 'Research' },
  { value: 'validationStatus', label: 'Validation' },
];

const RECORD_SORT_OPTIONS: Array<{ value: RecordSortField; label: string }> = [
  { value: 'year', label: 'Year' },
  { value: 'type', label: 'Type' },
  { value: 'collection', label: 'Collection' },
  { value: 'place', label: 'Place' },
  { value: 'participantCount', label: 'Participants' },
  { value: 'tier', label: 'Tier' },
  { value: 'evidenceClass', label: 'Evidence' },
  { value: 'linkedPeople', label: 'Linked people' },
];

const SECTION_CLASS =
  'space-y-3 rounded-2xl border border-shield/10 bg-shield/[0.03] p-4';
const LABEL_CLASS =
  'block text-xs font-semibold uppercase tracking-[0.18em] text-shield/45';
const INPUT_CLASS =
  'mt-2 min-h-11 w-full rounded-2xl border border-shield/15 bg-white px-3 py-2 text-sm text-slate-700';

export default function MobileExplorerFilterSheet({
  open,
  onClose,
  viewState,
  filterOptions,
  recordsFilterOptions,
  onStateChange,
  onResetActive,
}: MobileExplorerFilterSheetProps) {
  const [localQuery, setLocalQuery] = useState(viewState.query);
  const [localRecordQuery, setLocalRecordQuery] = useState(
    viewState.recordQuery,
  );
  const [localCollectionSearch, setLocalCollectionSearch] = useState(
    viewState.collectionSearch,
  );
  const [localParticipantSearch, setLocalParticipantSearch] = useState(
    viewState.participantSearch,
  );
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const collectionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const participantDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const isRecordsMode = viewState.viewMode === 'records';

  const clearPendingCommits = () => {
    [
      debounceRef,
      recordDebounceRef,
      collectionDebounceRef,
      participantDebounceRef,
    ].forEach((ref) => {
      if (ref.current) {
        clearTimeout(ref.current);
        ref.current = null;
      }
    });
  };

  const syncLocalInputs = (nextState: ExplorerViewState) => {
    setLocalQuery(nextState.query);
    setLocalRecordQuery(nextState.recordQuery);
    setLocalCollectionSearch(nextState.collectionSearch);
    setLocalParticipantSearch(nextState.participantSearch);
  };

  useEffect(() => {
    setLocalQuery(viewState.query);
  }, [viewState.query]);

  useEffect(() => {
    setLocalRecordQuery(viewState.recordQuery);
  }, [viewState.recordQuery]);

  useEffect(() => {
    setLocalCollectionSearch(viewState.collectionSearch);
  }, [viewState.collectionSearch]);

  useEffect(() => {
    setLocalParticipantSearch(viewState.participantSearch);
  }, [viewState.participantSearch]);

  useEffect(() => {
    if (!open) {
      clearPendingCommits();
      syncLocalInputs(viewState);
    }
  }, [open, viewState]);

  useEffect(() => {
    return () => {
      clearPendingCommits();
    };
  }, []);

  const handleSearchCommit = (
    nextValue: string,
    setter: Dispatch<SetStateAction<string>>,
    ref: MutableRefObject<ReturnType<typeof setTimeout> | null>,
    partial: Partial<ExplorerViewState>,
  ) => {
    setter(nextValue);
    if (ref.current) clearTimeout(ref.current);
    ref.current = setTimeout(() => onStateChange(partial), 200);
  };

  const handleClose = () => {
    clearPendingCommits();
    syncLocalInputs(viewState);
    onClose();
  };

  const handleReset = () => {
    clearPendingCommits();
    const nextState = isRecordsMode
      ? resetRecordsExplorerState(viewState)
      : resetPeopleExplorerState(viewState);
    syncLocalInputs(nextState);
    onResetActive();
  };

  const renderSortControls = (
    sortField: string,
    sortDirection: SortDirection,
  ) => (
    <section className={SECTION_CLASS}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-shield">Sort</h3>
        <button
          type="button"
          onClick={handleReset}
          className="text-sm font-semibold text-shield transition-colors hover:text-shield/80"
        >
          Reset
        </button>
      </div>
      <label className="block">
        <span className={LABEL_CLASS}>Field</span>
        <select
          aria-label="Sort field"
          value={sortField}
          onChange={(event) => {
            const nextField = event.target.value;
            if (isRecordsMode) {
              onStateChange({
                recordSortField: nextField as RecordSortField,
                recordSortDirection: 'asc',
              });
            } else {
              onStateChange({
                sortField: nextField as SortField,
                sortDirection: 'asc',
              });
            }
          }}
          className={INPUT_CLASS}
        >
          {(isRecordsMode ? RECORD_SORT_OPTIONS : PEOPLE_SORT_OPTIONS).map(
            (option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ),
          )}
        </select>
      </label>

      <label className="block">
        <span className={LABEL_CLASS}>Direction</span>
        <select
          aria-label="Sort direction"
          value={sortDirection}
          onChange={(event) => {
            const nextDirection = event.target.value as SortDirection;
            if (isRecordsMode) {
              onStateChange({ recordSortDirection: nextDirection });
            } else {
              onStateChange({ sortDirection: nextDirection });
            }
          }}
          className={INPUT_CLASS}
        >
          <option value="asc">Ascending</option>
          <option value="desc">Descending</option>
        </select>
      </label>
    </section>
  );

  return (
    <BottomSheet
      open={open}
      onClose={handleClose}
      eyebrow="Explorer"
      title="Filters"
    >
      <div className="space-y-5">
        {isRecordsMode ? (
          <>
            <section className={SECTION_CLASS}>
              <label className="block">
                <span className={LABEL_CLASS}>Search records</span>
                <input
                  aria-label="Search records"
                  type="text"
                  value={localRecordQuery}
                  onChange={(event) =>
                    handleSearchCommit(
                      event.target.value,
                      setLocalRecordQuery,
                      recordDebounceRef,
                      { recordQuery: event.target.value },
                    )
                  }
                  placeholder="Collection, place, name..."
                  className={INPUT_CLASS}
                />
              </label>

              {recordsFilterOptions.types.length > 0 && (
                <div className="space-y-2">
                  <span className={LABEL_CLASS}>Record types</span>
                  <div className="flex flex-wrap gap-2">
                    {recordsFilterOptions.types.map((type) => {
                      const isActive = viewState.recordTypes.includes(type);
                      return (
                        <button
                          key={type}
                          type="button"
                          aria-pressed={isActive}
                          onClick={() =>
                            onStateChange({
                              recordTypes: toggleListItem(
                                viewState.recordTypes,
                                type,
                              ),
                            })
                          }
                          className={`min-h-10 rounded-full border px-3 py-2 text-sm font-medium transition-colors ${
                            isActive
                              ? 'border-shield bg-shield text-white'
                              : 'border-shield/15 bg-white text-shield hover:bg-shield/5'
                          }`}
                        >
                          {type}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <span className={LABEL_CLASS}>Tier</span>
                <div className="flex flex-wrap gap-2">
                  {['A', 'B', 'C', 'D', 'E'].map((tier) => {
                    const isActive = viewState.tiers.includes(tier);
                    return (
                      <button
                        key={tier}
                        type="button"
                        aria-pressed={isActive}
                        onClick={() =>
                          onStateChange({
                            tiers: toggleListItem(viewState.tiers, tier),
                          })
                        }
                        className={`min-h-10 rounded-full border px-3 py-2 text-sm font-medium transition-colors ${
                          isActive
                            ? 'border-shield bg-shield text-white'
                            : 'border-shield/15 bg-white text-shield hover:bg-shield/5'
                        }`}
                      >
                        Tier {tier}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className={LABEL_CLASS}>Start year</span>
                  <input
                    aria-label="Start year"
                    type="number"
                    value={viewState.yearMin || ''}
                    onChange={(event) => {
                      const value =
                        event.target.value === ''
                          ? 0
                          : Number.parseInt(event.target.value, 10);
                      onStateChange({
                        yearMin: Number.isNaN(value) ? 0 : value,
                      });
                    }}
                    placeholder={
                      recordsFilterOptions.yearRange
                        ? String(recordsFilterOptions.yearRange[0])
                        : 'Min'
                    }
                    className={INPUT_CLASS}
                  />
                </label>
                <label className="block">
                  <span className={LABEL_CLASS}>End year</span>
                  <input
                    aria-label="End year"
                    type="number"
                    value={viewState.yearMax < 9999 ? viewState.yearMax : ''}
                    onChange={(event) => {
                      const value =
                        event.target.value === ''
                          ? 9999
                          : Number.parseInt(event.target.value, 10);
                      onStateChange({
                        yearMax: Number.isNaN(value) ? 9999 : value,
                      });
                    }}
                    placeholder={
                      recordsFilterOptions.yearRange
                        ? String(recordsFilterOptions.yearRange[1])
                        : 'Max'
                    }
                    className={INPUT_CLASS}
                  />
                </label>
              </div>

              <label className="block">
                <span className={LABEL_CLASS}>Collection</span>
                <input
                  aria-label="Collection search"
                  type="text"
                  value={localCollectionSearch}
                  onChange={(event) =>
                    handleSearchCommit(
                      event.target.value,
                      setLocalCollectionSearch,
                      collectionDebounceRef,
                      { collectionSearch: event.target.value },
                    )
                  }
                  placeholder="Filter by collection..."
                  className={INPUT_CLASS}
                />
              </label>

              <label className="block">
                <span className={LABEL_CLASS}>Participant</span>
                <input
                  aria-label="Participant search"
                  type="text"
                  value={localParticipantSearch}
                  onChange={(event) =>
                    handleSearchCommit(
                      event.target.value,
                      setLocalParticipantSearch,
                      participantDebounceRef,
                      { participantSearch: event.target.value },
                    )
                  }
                  placeholder="Filter by participant name..."
                  className={INPUT_CLASS}
                />
              </label>
            </section>

            {renderSortControls(
              viewState.recordSortField,
              viewState.recordSortDirection,
            )}
          </>
        ) : (
          <>
            <section className={SECTION_CLASS}>
              <label className="block">
                <span className={LABEL_CLASS}>Search people</span>
                <input
                  aria-label="Search people"
                  type="text"
                  value={localQuery}
                  onChange={(event) =>
                    handleSearchCommit(
                      event.target.value,
                      setLocalQuery,
                      debounceRef,
                      { query: event.target.value },
                    )
                  }
                  placeholder="Name, place, notes..."
                  className={INPUT_CLASS}
                />
              </label>

              {filterOptions.centuries.length > 0 && (
                <div className="space-y-2">
                  <span className={LABEL_CLASS}>Birth century</span>
                  <div className="flex flex-wrap gap-2">
                    {filterOptions.centuries.map((century) => {
                      const isActive = viewState.centuries.includes(century);
                      return (
                        <button
                          key={century}
                          type="button"
                          aria-pressed={isActive}
                          onClick={() =>
                            onStateChange({
                              centuries: toggleListItem(
                                viewState.centuries,
                                century,
                              ),
                            })
                          }
                          className={`min-h-10 rounded-full border px-3 py-2 text-sm font-medium transition-colors ${
                            isActive
                              ? 'border-shield bg-shield text-white'
                              : 'border-shield/15 bg-white text-shield hover:bg-shield/5'
                          }`}
                        >
                          {century}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {filterOptions.countries.length > 0 && (
                <div className="space-y-2">
                  <span className={LABEL_CLASS}>Country / origin</span>
                  <div className="flex flex-wrap gap-2">
                    {filterOptions.countries.map((country) => {
                      const isActive = viewState.countries.includes(country);
                      return (
                        <button
                          key={country}
                          type="button"
                          aria-pressed={isActive}
                          onClick={() =>
                            onStateChange({
                              countries: toggleListItem(
                                viewState.countries,
                                country,
                              ),
                            })
                          }
                          className={`min-h-10 rounded-full border px-3 py-2 text-sm font-medium transition-colors ${
                            isActive
                              ? 'border-shield bg-shield text-white'
                              : 'border-shield/15 bg-white text-shield hover:bg-shield/5'
                          }`}
                        >
                          {country}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {filterOptions.statuses.length > 0 && (
                <div className="space-y-2">
                  <span className={LABEL_CLASS}>Record status</span>
                  <div className="flex flex-wrap gap-2">
                    {filterOptions.statuses.map((status) => {
                      const isActive = viewState.statuses.includes(status);
                      return (
                        <button
                          key={status}
                          type="button"
                          aria-pressed={isActive}
                          onClick={() =>
                            onStateChange({
                              statuses: toggleListItem(
                                viewState.statuses,
                                status,
                              ),
                            })
                          }
                          className={`min-h-10 rounded-full border px-3 py-2 text-sm font-medium transition-colors ${
                            isActive
                              ? 'border-shield bg-shield text-white'
                              : 'border-shield/15 bg-white text-shield hover:bg-shield/5'
                          }`}
                        >
                          {status.replace(/_/g, ' ')}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className={LABEL_CLASS}>Sex</span>
                  <select
                    aria-label="Sex"
                    value={viewState.sex}
                    onChange={(event) =>
                      onStateChange({ sex: event.target.value })
                    }
                    className={INPUT_CLASS}
                  >
                    <option value="">All</option>
                    <option value="M">Male</option>
                    <option value="F">Female</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </label>
                <label className="block">
                  <span className={LABEL_CLASS}>Sources</span>
                  <select
                    aria-label="Sources"
                    value={viewState.hasSources}
                    onChange={(event) =>
                      onStateChange({ hasSources: event.target.value })
                    }
                    className={INPUT_CLASS}
                  >
                    <option value="">All</option>
                    <option value="yes">Has sources</option>
                    <option value="no">No sources</option>
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className={LABEL_CLASS}>Completeness min</span>
                  <input
                    aria-label="Completeness min"
                    type="number"
                    min={0}
                    max={100}
                    value={viewState.completenessMin}
                    onChange={(event) => {
                      const value = Number.parseInt(event.target.value, 10);
                      onStateChange({
                        completenessMin: Number.isNaN(value) ? 0 : value,
                      });
                    }}
                    className={INPUT_CLASS}
                  />
                </label>
                <label className="block">
                  <span className={LABEL_CLASS}>Completeness max</span>
                  <input
                    aria-label="Completeness max"
                    type="number"
                    min={0}
                    max={100}
                    value={viewState.completenessMax}
                    onChange={(event) => {
                      const value = Number.parseInt(event.target.value, 10);
                      onStateChange({
                        completenessMax: Number.isNaN(value) ? 100 : value,
                      });
                    }}
                    className={INPUT_CLASS}
                  />
                </label>
              </div>

              <label className="block">
                <span className={LABEL_CLASS}>Validation</span>
                <select
                  aria-label="Validation"
                  value={viewState.validation}
                  onChange={(event) =>
                    onStateChange({ validation: event.target.value })
                  }
                  className={INPUT_CLASS}
                >
                  <option value="">All</option>
                  <option value="pass">Pass</option>
                  <option value="fail">Fail</option>
                </select>
              </label>
            </section>

            {renderSortControls(viewState.sortField, viewState.sortDirection)}
          </>
        )}
      </div>
    </BottomSheet>
  );
}
