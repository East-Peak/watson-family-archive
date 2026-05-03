/**
 * Types for person profile pages and related components
 */

export interface PhotoData {
  filename: string;
  path: string;
  type: string;
  isPortrait: boolean;
  caption?: string;
  date?: string;
  people: string[];
}

export interface PhotosJson {
  photos: PhotoData[];
  byPerson: Record<string, number[]>;
}

export interface Individual {
  id: string;
  gedcomId: string;
  fullName: string;
  givenName: string;
  surname: string;
  suffix: string | null;
  nickname: string | null;
  title: string | null;
  sex: string;
  birthDate: string | null;
  birthYear: number | null;
  birthPlace: string | null;
  birthCoords: { lat: number; lng: number } | null;
  deathDate: string | null;
  deathYear: number | null;
  deathPlace: string | null;
  deathCoords: { lat: number; lng: number } | null;
  isLiving: boolean;
  isDirectAncestor: boolean;
  generation: number | null;
  verificationStatus: string | null;
  confidenceGrade: string | null;
  wikitreeId: string | null;
  findagraveId: string | null;
  familysearchTreeId: string | null;
}

export interface Journey {
  year: number | null;
  place: string;
  city: string | null;
  state: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  source: string | null;
  occupation: string | null;
}

export interface FamilyMember {
  id: string;
  name: string;
  birthYear: number | null;
}

export interface FamilyRelationships {
  id: string;
  name: string;
  father: FamilyMember | null;
  mother: FamilyMember | null;
  spouses: (FamilyMember & { marriageDate?: string; marriageYear?: number })[];
  children: FamilyMember[];
  siblings: FamilyMember[];
}

export interface SurnameMatch {
  id: string;
  fullName: string;
  givenName?: string;
  surname?: string;
  birthYear?: number;
  deathYear?: number;
}

export interface Biography {
  notes?: string[];
  verifiedFacts?: string[];
  geographicJourney?: { place: string; period: string; description?: string }[];
  lifePeriods?: { period: string; events: string[] }[];
  relationshipToOwner?: string;
  occupations?: string[];
  researchStatus?: string;
  lastUpdated?: string;
  sourceCount?: number;
  keySources?: string[];
  timelineHighlights?: { year: number; event: string; location: string }[];
  wikitreeCandidacy?: string;
  externalLinks?: { label: string; url: string }[];
  researchedChildCount?: number;
  researchedChildCountMin?: number;
}

export interface Photo {
  filename: string;
  path: string;
  type: string;
  isPortrait: boolean;
  caption: string;
  date: string;
  people: string[];
}

export interface ContextualMediaItem {
  id: string;
  type: string;
  name: string;
  relevance: string;
  badge?: string;
  featured?: boolean;
  wikimedia?: {
    fileTitle?: string;
    imageUrl?: string;
    thumbnailUrl?: string;
    attribution?: string;
    license?: string;
  };
  wikipedia?: {
    url?: string;
    summary?: string;
    title?: string;
    coordinates?: { lat?: number; lng?: number };
  };
  googleMaps?: {
    url?: string;
    embedUrl?: string;
    coordinates?: { lat?: number; lng?: number };
  };
}

export interface ContextualMedia {
  personId: string;
  personName: string;
  generatedAt: string;
  items: ContextualMediaItem[];
}

export interface TimelineEvent {
  year: number | null;
  title: string;
  subtitle?: string;
  type: 'place' | 'event' | 'family' | 'birth' | 'death';
  isOutsideLifespan?: boolean;
  warning?: string;
}

export interface ParsedSource {
  collection: string;
  provider: string;
  url: string | null;
  recordType: string;
  year: number | null;
  keyFacts: string[];
  imageUrl: string | null;
  added: string | null;
  record_id?: string;
  // Record node enrichment fields
  participants?: Array<{
    name: string;
    role?: string;
    age?: number;
    occupation?: string;
    birthplace?: string;
  }>;
  details?: Record<string, unknown>;
  evidenceClass?: string;
  tier?: string;
}

export interface SearchRecordResult {
  id: string;
  ark: string | null;
  type: string;
  collection: string;
  year: number | null;
  place: string | null;
  tier: string | null;
  matchedParticipant: string | null;
  participantCount: number;
  linkedPersonCount: number;
}

export interface PersonProfile {
  person: Individual;
  family: FamilyRelationships;
  journey: Journey[];
  biography: Biography | null;
  photos: Photo[];
  surnameMatches: SurnameMatch[];
  contextualMedia: ContextualMediaItem[];
  markdownContent: string | null;
  narrativeBio: string | null;
  bioTier: string | null;
  sources: ParsedSource[];
}
