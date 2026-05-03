/**
 * Schema for extracted genealogy data from verified_nodes markdown files
 * Used by Claude to structure extraction output
 */

export interface ExtractedPerson {
  // Identity
  id: string;                    // Derived from filename
  fullName: string;
  givenName?: string;
  surname?: string;
  suffix?: string;
  nickname?: string;
  sex: 'M' | 'F' | 'U';

  // Dates
  birthDate?: string;            // Full date if known
  birthYear?: number;
  deathDate?: string;
  deathYear?: number;
  isLiving: boolean;

  // Verification
  verificationStatus: 'VERIFIED' | 'PARTIAL' | 'BRICK_WALL' | 'UNVERIFIED';
  confidenceScore?: number;      // 0-1 based on sources

  // External IDs
  gedcomId?: string;
  wikitreeId?: string;
  findagraveId?: string;
  geniId?: string;
}

export interface ExtractedPlace {
  rawText: string;               // Original text from document
  name: string;                  // Normalized name
  type?: 'COUNTRY' | 'STATE' | 'COUNTY' | 'TOWN' | 'PARISH' | 'PLANTATION' | 'CEMETERY';
  parentPlace?: string;          // For hierarchy (e.g., "Maryland" for "Anne Arundel County")
  country?: string;
  state?: string;
  county?: string;
  town?: string;
}

export interface ExtractedOccupation {
  title: string;                 // e.g., "Boatwright", "Judge", "Farmer"
  category: 'JUDICIAL' | 'MILITARY' | 'AGRICULTURAL' | 'TRADE' | 'POLITICAL' | 'RELIGIOUS' | 'PROFESSIONAL' | 'OTHER';
  fromYear?: number;
  toYear?: number;
  organization?: string;         // e.g., "California Court of Appeal"
  notes?: string;
}

export interface ExtractedLegalStatus {
  status: 'FREE' | 'INDENTURED_SERVANT' | 'TRANSPORTED_CONVICT' | 'SLAVE' | 'FREEDMAN' | 'REDEMPTIONER';
  fromYear?: number;
  toYear?: number;
  notes?: string;                // e.g., "transported by Cornelius Lloyd"
  transportedBy?: string;        // Person who transported them
}

export interface ExtractedReligion {
  name: string;                  // e.g., "Quaker", "Methodist", "Anglican"
  denomination?: string;
  convertedYear?: number;
  role?: string;                 // e.g., "Deacon", "Trustee", "Member"
  church?: string;               // Specific church name
  notes?: string;
}

export interface ExtractedMilitaryService {
  war: string;                   // e.g., "Revolutionary War", "Civil War"
  unit?: string;                 // e.g., "George Rogers Clark's Illinois Regiment"
  rank?: string;
  fromYear?: number;
  toYear?: number;
  landGrantAcres?: number;       // If received land grant for service
  darNumber?: string;            // DAR application number if mentioned
  notes?: string;
}

export interface ExtractedEthnicity {
  name: string;                  // e.g., "Irish Gaelic", "Welsh", "English", "German"
  haplogroup?: string;           // Y-DNA or mtDNA haplogroup
  dnaConfirmed: boolean;         // Whether there's DNA evidence
  notes?: string;
}

export interface ExtractedSource {
  type: 'CENSUS' | 'BIRTH_RECORD' | 'DEATH_RECORD' | 'MARRIAGE_RECORD' | 'COURT_RECORD' |
        'LAND_PATENT' | 'WILL' | 'OBITUARY' | 'DNA' | 'WIKITREE' | 'FINDAGRAVE' | 'BOOK' | 'OTHER';
  title: string;
  citation?: string;
  url?: string;
  apid?: string;                 // Ancestry APID
  confidenceLevel: 'A' | 'B' | 'C' | 'D';
}

export interface ExtractedImmigration {
  fromPlace: string;
  toPlace: string;
  year?: number;
  ship?: string;
  port?: string;
  reason?: string;               // e.g., "religious persecution", "indentured servitude"
}

export interface ExtractedRelationship {
  type: 'FATHER' | 'MOTHER' | 'SPOUSE' | 'CHILD' | 'SIBLING';
  personName: string;
  personId?: string;             // If we can link to another file
  birthYear?: number;
  deathYear?: number;
  marriageYear?: number;         // For spouse relationships
  marriagePlace?: string;
  notes?: string;
}

export interface ExtractedLifeEvent {
  type: 'BIRTH' | 'DEATH' | 'MARRIAGE' | 'BAPTISM' | 'BURIAL' | 'IMMIGRATION' |
        'RESIDENCE' | 'MILITARY_SERVICE' | 'CONVERSION' | 'LAND_GRANT' | 'OTHER';
  year?: number;
  date?: string;
  place?: string;
  description?: string;
}

/**
 * Complete extraction from a single verified_node markdown file
 */
export interface ExtractedDocument {
  // Source file
  sourceFile: string;
  extractedAt: string;

  // FULL ORIGINAL MARKDOWN - preserves all context for AI
  markdownContent: string;

  // Core person data
  person: ExtractedPerson;

  // Places mentioned (for creating Place nodes)
  birthPlace?: ExtractedPlace;
  deathPlace?: ExtractedPlace;
  burialPlace?: ExtractedPlace;
  placesLived: ExtractedPlace[];

  // Rich attributes
  occupations: ExtractedOccupation[];
  legalStatuses: ExtractedLegalStatus[];
  religions: ExtractedReligion[];
  militaryService: ExtractedMilitaryService[];
  ethnicities: ExtractedEthnicity[];

  // Immigration/Migration
  immigrations: ExtractedImmigration[];

  // Relationships to other people
  relationships: ExtractedRelationship[];

  // Timeline of life events
  lifeEvents: ExtractedLifeEvent[];

  // Sources/Citations
  sources: ExtractedSource[];

  // Generated biography (for embeddings)
  biography?: string;

  // Connection to the configured root person
  relationshipToStuart?: string;  // e.g., "5th Great-Grandfather"
}
