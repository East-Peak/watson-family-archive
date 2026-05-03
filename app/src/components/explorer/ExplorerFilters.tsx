'use client';

import { useState, useEffect, useRef } from 'react';
import type { ExplorerViewState, ExplorerFilterOptions, RecordsFilterOptions } from './types';

interface ExplorerFiltersProps {
  viewState: ExplorerViewState;
  filterOptions: ExplorerFilterOptions;
  onStateChange: (partial: Partial<ExplorerViewState>) => void;
  recordsFilterOptions?: RecordsFilterOptions;
}

function toggleListItem(list: string[], item: string): string[] {
  return list.includes(item) ? list.filter((v) => v !== item) : [...list, item];
}

export default function ExplorerFilters({ viewState, filterOptions, onStateChange, recordsFilterOptions }: ExplorerFiltersProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [localQuery, setLocalQuery] = useState(viewState.query);
  const [localRecordQuery, setLocalRecordQuery] = useState(viewState.recordQuery);
  const [localCollectionSearch, setLocalCollectionSearch] = useState(viewState.collectionSearch);
  const [localParticipantSearch, setLocalParticipantSearch] = useState(viewState.participantSearch);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const collectionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const participantDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isRecordsMode = viewState.viewMode === 'records';

  // Keep local queries in sync if parent resets them externally
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

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onStateChange({ query: val });
    }, 200);
  };

  const handleRecordQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalRecordQuery(val);
    if (recordDebounceRef.current) clearTimeout(recordDebounceRef.current);
    recordDebounceRef.current = setTimeout(() => {
      onStateChange({ recordQuery: val });
    }, 200);
  };

  const handleCollectionSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalCollectionSearch(val);
    if (collectionDebounceRef.current) clearTimeout(collectionDebounceRef.current);
    collectionDebounceRef.current = setTimeout(() => {
      onStateChange({ collectionSearch: val });
    }, 200);
  };

  const handleParticipantSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalParticipantSearch(val);
    if (participantDebounceRef.current) clearTimeout(participantDebounceRef.current);
    participantDebounceRef.current = setTimeout(() => {
      onStateChange({ participantSearch: val });
    }, 200);
  };

  if (collapsed) {
    return (
      <div className="flex-shrink-0 flex items-start pt-4 pl-2">
        <button
          onClick={() => setCollapsed(false)}
          className="w-10 h-10 rounded-xl bg-amber-50/80 border border-amber-900/10 flex items-center justify-center text-shield/40 hover:text-shield hover:bg-amber-100/60 transition-all shadow-sm"
          title="Open filters"
        >
          {/* Filter funnel icon */}
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
          </svg>
        </button>
      </div>
    );
  }

  const sectionClass = 'px-4 py-3 border-b border-amber-900/5';
  const labelClass = 'text-xs text-shield/50 uppercase tracking-wider font-semibold';
  const inputClass =
    'mt-1.5 w-full bg-white/80 border border-amber-900/10 rounded-lg px-2.5 py-1.5 text-sm text-shield placeholder-shield/30 focus:outline-none focus:border-indigo-500/50 transition-colors';
  const checkboxClass =
    'rounded border-amber-900/15 bg-white/80 text-indigo-600 focus:ring-indigo-500/50 focus:ring-offset-0';
  const radioClass =
    'rounded-full border-amber-900/15 bg-white/80 text-indigo-600 focus:ring-indigo-500/50 focus:ring-offset-0';
  const itemLabelClass = 'ml-2 text-sm text-shield/70 cursor-pointer select-none';

  const tierOptions = ['A', 'B', 'C', 'D', 'E'];

  return (
    <div className="w-64 flex-shrink-0 bg-amber-50/80 border-r border-amber-900/8 overflow-y-auto flex flex-col">
      {/* 1. Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-amber-900/10 flex-shrink-0">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-shield/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
          </svg>
          <span className="text-sm font-semibold text-shield tracking-wide">Filters</span>
        </div>
        <button
          onClick={() => setCollapsed(true)}
          className="text-shield/40 hover:text-shield transition-colors"
          title="Collapse filters"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7M19 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {isRecordsMode ? (
        <>
          {/* Records mode filters */}

          {/* 2. Search */}
          <div className={sectionClass}>
            <label className={labelClass} htmlFor="explorer-record-search">Search</label>
            <input
              id="explorer-record-search"
              type="text"
              value={localRecordQuery}
              onChange={handleRecordQueryChange}
              placeholder="Collection, place, name..."
              className={inputClass}
            />
          </div>

          {/* 3. Record Type */}
          {recordsFilterOptions && recordsFilterOptions.types.length > 0 && (
            <div className={sectionClass}>
              <div className={labelClass + ' mb-2'}>Record Type</div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {recordsFilterOptions.types.map((type) => (
                  <label key={type} className="flex items-center">
                    <input
                      type="checkbox"
                      className={checkboxClass}
                      checked={viewState.recordTypes.includes(type)}
                      onChange={() => onStateChange({ recordTypes: toggleListItem(viewState.recordTypes, type) })}
                    />
                    <span className={itemLabelClass}>{type}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* 4. Tier */}
          <div className={sectionClass}>
            <div className={labelClass + ' mb-2'}>Tier</div>
            <div className="space-y-1.5">
              {tierOptions.map((tier) => (
                <label key={tier} className="flex items-center">
                  <input
                    type="checkbox"
                    className={checkboxClass}
                    checked={viewState.tiers.includes(tier)}
                    onChange={() => onStateChange({ tiers: toggleListItem(viewState.tiers, tier) })}
                  />
                  <span className={itemLabelClass}>Tier {tier}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 5. Year Range */}
          <div className={sectionClass}>
            <div className={labelClass + ' mb-2'}>Year Range</div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={viewState.yearMin || ''}
                onChange={(e) => {
                  const val = e.target.value === '' ? 0 : parseInt(e.target.value, 10);
                  if (!isNaN(val)) onStateChange({ yearMin: val });
                }}
                placeholder={recordsFilterOptions?.yearRange ? String(recordsFilterOptions.yearRange[0]) : 'Min'}
                className="w-full bg-white/80 border border-amber-900/10 rounded-lg px-2.5 py-1.5 text-sm text-shield placeholder-shield/30 focus:outline-none focus:border-indigo-500/50 transition-colors"
              />
              <span className="text-shield/30 text-sm">–</span>
              <input
                type="number"
                value={viewState.yearMax < 9999 ? viewState.yearMax : ''}
                onChange={(e) => {
                  const val = e.target.value === '' ? 9999 : parseInt(e.target.value, 10);
                  if (!isNaN(val)) onStateChange({ yearMax: val });
                }}
                placeholder={recordsFilterOptions?.yearRange ? String(recordsFilterOptions.yearRange[1]) : 'Max'}
                className="w-full bg-white/80 border border-amber-900/10 rounded-lg px-2.5 py-1.5 text-sm text-shield placeholder-shield/30 focus:outline-none focus:border-indigo-500/50 transition-colors"
              />
            </div>
            {recordsFilterOptions?.yearRange && (
              <div className="mt-1 text-xs text-shield/30">
                Dataset: {recordsFilterOptions.yearRange[0]}–{recordsFilterOptions.yearRange[1]}
              </div>
            )}
          </div>

          {/* 6. Collection */}
          <div className={sectionClass}>
            <label className={labelClass} htmlFor="explorer-collection-search">Collection</label>
            <input
              id="explorer-collection-search"
              type="text"
              value={localCollectionSearch}
              onChange={handleCollectionSearchChange}
              placeholder="Filter by collection..."
              className={inputClass}
            />
          </div>

          {/* 7. Participant */}
          <div className={sectionClass}>
            <label className={labelClass} htmlFor="explorer-participant-search">Participant</label>
            <input
              id="explorer-participant-search"
              type="text"
              value={localParticipantSearch}
              onChange={handleParticipantSearchChange}
              placeholder="Filter by participant name..."
              className={inputClass}
            />
          </div>
        </>
      ) : (
        <>
          {/* People mode filters (existing) */}

          {/* 2. Search */}
          <div className={sectionClass}>
            <label className={labelClass} htmlFor="explorer-search">Search</label>
            <input
              id="explorer-search"
              type="text"
              value={localQuery}
              onChange={handleQueryChange}
              placeholder="Name, place, notes..."
              className={inputClass}
            />
          </div>

          {/* 3. Birth Century */}
          {filterOptions.centuries.length > 0 && (
            <div className={sectionClass}>
              <div className={labelClass + ' mb-2'}>Birth Century</div>
              <div className="space-y-1.5">
                {filterOptions.centuries.map((century) => (
                  <label key={century} className="flex items-center">
                    <input
                      type="checkbox"
                      className={checkboxClass}
                      checked={viewState.centuries.includes(century)}
                      onChange={() => onStateChange({ centuries: toggleListItem(viewState.centuries, century) })}
                    />
                    <span className={itemLabelClass}>{century}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* 4. Country / Origin */}
          {filterOptions.countries.length > 0 && (
            <div className={sectionClass}>
              <div className={labelClass + ' mb-2'}>Country / Origin</div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {filterOptions.countries.map((country) => (
                  <label key={country} className="flex items-center">
                    <input
                      type="checkbox"
                      className={checkboxClass}
                      checked={viewState.countries.includes(country)}
                      onChange={() => onStateChange({ countries: toggleListItem(viewState.countries, country) })}
                    />
                    <span className={itemLabelClass}>{country}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* 5. Sex */}
          <div className={sectionClass}>
            <div className={labelClass + ' mb-2'}>Sex</div>
            <div className="space-y-1.5">
              {[
                { value: '', label: 'All' },
                { value: 'M', label: 'Male' },
                { value: 'F', label: 'Female' },
                ...(filterOptions.sexValues.includes('') ? [{ value: 'unknown', label: 'Unknown' }] : []),
              ].map(({ value, label }) => (
                <label key={value} className="flex items-center">
                  <input
                    type="radio"
                    className={radioClass}
                    name="explorer-sex"
                    checked={viewState.sex === value}
                    onChange={() => onStateChange({ sex: value })}
                  />
                  <span className={itemLabelClass}>{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 6. Record Status */}
          {filterOptions.statuses.length > 0 && (
            <div className={sectionClass}>
              <div className={labelClass + ' mb-2'}>Record Status</div>
              <div className="space-y-1.5">
                {filterOptions.statuses.map((status) => (
                  <label key={status} className="flex items-center">
                    <input
                      type="checkbox"
                      className={checkboxClass}
                      checked={viewState.statuses.includes(status)}
                      onChange={() => onStateChange({ statuses: toggleListItem(viewState.statuses, status) })}
                    />
                    <span className={itemLabelClass}>{status.replace(/_/g, ' ')}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* 7. Completeness Range */}
          <div className={sectionClass}>
            <div className={labelClass + ' mb-2'}>Completeness</div>
            <div className="space-y-3">
              <div>
                <label className="flex items-center justify-between text-xs text-shield/50 mb-1">
                  <span>Min</span>
                  <span className="text-indigo-600 font-medium">{viewState.completenessMin}%</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={viewState.completenessMin}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    onStateChange({ completenessMin: val, completenessMax: Math.max(val, viewState.completenessMax) });
                  }}
                  className="w-full accent-indigo-500 cursor-pointer"
                />
              </div>
              <div>
                <label className="flex items-center justify-between text-xs text-shield/50 mb-1">
                  <span>Max</span>
                  <span className="text-indigo-600 font-medium">{viewState.completenessMax}%</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={viewState.completenessMax}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    onStateChange({ completenessMax: val, completenessMin: Math.min(val, viewState.completenessMin) });
                  }}
                  className="w-full accent-indigo-500 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* 8. Validation */}
          <div className={sectionClass}>
            <div className={labelClass + ' mb-2'}>Validation</div>
            <div className="space-y-1.5">
              {[
                { value: '', label: 'All' },
                { value: 'pass', label: 'Pass' },
                { value: 'warn', label: 'Warn' },
              ].map(({ value, label }) => (
                <label key={value} className="flex items-center">
                  <input
                    type="radio"
                    className={radioClass}
                    name="explorer-validation"
                    checked={viewState.validation === value}
                    onChange={() => onStateChange({ validation: value })}
                  />
                  <span className={itemLabelClass}>{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 9. Has Sources */}
          <div className={sectionClass}>
            <div className={labelClass + ' mb-2'}>Has Sources</div>
            <div className="space-y-1.5">
              {[
                { value: '', label: 'All' },
                { value: 'yes', label: 'Yes' },
                { value: 'no', label: 'No' },
              ].map(({ value, label }) => (
                <label key={value} className="flex items-center">
                  <input
                    type="radio"
                    className={radioClass}
                    name="explorer-has-sources"
                    checked={viewState.hasSources === value}
                    onChange={() => onStateChange({ hasSources: value })}
                  />
                  <span className={itemLabelClass}>{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 10. Family Branch */}
          {filterOptions.surnames.length > 0 && (
            <div className={sectionClass}>
              <label className={labelClass} htmlFor="explorer-branch">Family Branch</label>
              <select
                id="explorer-branch"
                value={viewState.branch}
                onChange={(e) => onStateChange({ branch: e.target.value })}
                className={inputClass}
              >
                <option value="">All Families</option>
                {filterOptions.surnames.map((surname) => (
                  <option key={surname} value={surname}>{surname}</option>
                ))}
              </select>
            </div>
          )}
        </>
      )}

      {/* Bottom padding */}
      <div className="h-4 flex-shrink-0" />
    </div>
  );
}
