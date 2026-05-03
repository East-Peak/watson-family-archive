export type ExplorerViewMode = 'people' | 'records';

export interface ExplorerPerson {
  id: string;
  fullName: string;
  givenName: string;
  surname: string;
  maidenName: string | null;
  sex: string;
  birthYear: number | null;
  birthPlace: string | null;
  deathYear: number | null;
  deathPlace: string | null;
  originCountry: string | null;
  completenessScore: number;
  researchScore: number;
  sourceCount: number;
  validationStatus: string;
  completeness_tier: string;
  status: string;
  familysearchTreeId: string | null;
  wikitreeId: string | null;
  findagraveId: string | null;
  recordCounts?: Record<string, number>;
}

export interface ExplorerRecord {
  id: string;
  ark: string | null;
  type: string;
  provider: string;
  evidenceClass: string | null;
  collection: string;
  year: number | null;
  country: string | null;
  tier: string | null;
  place: string | null;
  participantCount: number;
  primaryParticipant: string | null;
  linkedPeople: Array<{ id: string; slug: string; name: string; role: string }>;
  participants: Array<{
    name: string;
    role: string | null;
    age: string | null;
    occupation: string | null;
    birthplace: string | null;
    matchedSlug: string | null;
  }>;
}

export type RecordSortField =
  | 'type' | 'year' | 'collection' | 'place'
  | 'participantCount' | 'tier' | 'evidenceClass' | 'linkedPeople';

export interface RecordsFilterOptions {
  types: string[];
  tiers: string[];
  yearRange: [number, number] | null;
  countries: string[];
}

export type SortField =
  | 'fullName'
  | 'birthYear'
  | 'deathYear'
  | 'originCountry'
  | 'sex'
  | 'status'
  | 'completenessScore'
  | 'sourceCount'
  | 'researchScore'
  | 'validationStatus';

export type SortDirection = 'asc' | 'desc';

export interface ExplorerViewState {
  query: string;
  centuries: string[];
  countries: string[];
  sex: string;
  statuses: string[];
  completenessMin: number;
  completenessMax: number;
  validation: string;
  hasSources: string;
  branch: string;
  sortField: SortField;
  sortDirection: SortDirection;
  viewMode: ExplorerViewMode;
  recordQuery: string;
  recordTypes: string[];
  tiers: string[];
  yearMin: number;
  yearMax: number;
  collectionSearch: string;
  participantSearch: string;
  recordSortField: RecordSortField;
  recordSortDirection: SortDirection;
}

export interface ExplorerFilterOptions {
  centuries: string[];
  countries: string[];
  sexValues: string[];
  statuses: string[];
  surnames: string[];
}
