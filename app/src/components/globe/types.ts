import type { JourneyStop } from '@/components/JourneyPlayer';

// --- Globe event normalization types ---

export type GlobeEventType =
  | 'birth'
  | 'death'
  | 'marriage'
  | 'census'
  | 'residence'
  | 'occupation'
  | 'migration'
  | 'military'
  | 'burial'
  | 'other';

export interface GlobeEvent {
  type: GlobeEventType;
  year: number | null;
}

export type ApproximatePrecision = 'exact' | 'city' | 'county' | 'state' | 'country';

export type EntityVisibility = 'full' | 'dimmed' | 'hidden';

// --- Globe data types ---

export interface Person {
  id: string;
  name: string;
  birth: number | null;
  death: number | null;
  type: string;
  events: GlobeEvent[];
}

export interface Location {
  id: number;
  name: string;
  lat: number;
  lng: number;
  city: string;
  state: string;
  country: string;
  isApproximate: boolean;
  precision: ApproximatePrecision;
  people: Person[];
}

export interface Arc {
  person_id: string;
  from: { place: string; lat: number; lng: number; year?: number; eventType?: GlobeEventType };
  to: { place: string; lat: number; lng: number; year?: number; eventType?: GlobeEventType };
}

export interface GlobeData {
  locations: Location[];
  arcs: Arc[];
}

// --- Filtered entity types (visibility-annotated) ---

export interface FilteredLocation extends Location {
  visibility: EntityVisibility;
  visiblePeople: Person[];
  visiblePeopleCount: number;
}

export interface FilteredArc extends Arc {
  visibility: EntityVisibility;
}

export interface JourneyModeData {
  personId: string;
  personName: string;
  birthYear: number | null;
  deathYear: number | null;
  stops: JourneyStop[];
}

// --- Globe view state (URL-backed) ---

export type GlobeViewMode = 'pins' | 'density' | 'generation' | 'origins';

export interface GlobeCameraState {
  lat: number;
  lng: number;
  height: number;
  heading: number;
  pitch: number;
}

export type ArcColorMode = 'default' | 'era' | 'family';

export interface GlobeViewState {
  branch: string;
  yearRange: [number, number] | null;
  eventTypes: string[];
  regions: string[];
  highlightPerson: string | null;  // personId
  viewMode: GlobeViewMode;
  showApproximate: boolean;
  showArcs: boolean;
  showLabels: boolean;
  arcColorMode: ArcColorMode;
  camera: GlobeCameraState | null;
}
