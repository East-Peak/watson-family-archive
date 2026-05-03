import type { PageContext } from '@/types/visualization';
import type { SidebarMessage } from '@/types/chat';

export type { PageContext, SidebarMessage };

// ---------------------------------------------------------------------------
// Query Planning
// ---------------------------------------------------------------------------

export interface QueryPlan {
  // What kind of answer does this query need?
  answerMode:
    | 'deterministic-fact'      // oldest ancestor, military list — use existing proven handlers
    | 'retrieval-qa'            // open-ended question needing retrieval + LLM
    | 'page-anchored-qa'        // question about the current page person (factual or summary)
    | 'visualization-tool'      // "show me X on the globe/tree" — tool use
    | 'stats'                   // "how many people are in the tree?" — aggregate query
    | 'tool-assisted'           // query where the LLM may invoke tools (research-gap, etc.)
    | 'clarification';          // can't determine intent — ask the user

  // Who is the subject?
  anchor: {
    type: 'viewer' | 'current-page-person' | 'named-person'
        | 'conversation-referent' | 'visible-set' | 'none';
    personId?: string;
    personName?: string;
    visiblePersonIds?: string[];   // for tree-screen "who is on screen" questions
    focusPersonId?: string;        // for tree-screen focused person
    confidence: 'resolved' | 'ambiguous' | 'unresolved';
    candidates?: Array<{ id: string; name: string; distinguisher: string }>;
  };

  // What subgraph should retrieval search?
  searchDomain:
    | 'viewer-ancestors'        // CHILD_OF*0..20 from viewer
    | 'person-ancestors'        // CHILD_OF*0..20 from a specific person
    | 'person-immediate-family' // parents, spouse, children, siblings
    | 'person-extended'         // ancestors + descendants + spouses
    | 'page-visible-set'        // people currently visible on the tree/globe screen
    | 'whole-tree'              // no constraint
    | 'none';                   // no retrieval needed (stats, visualization)

  // Subject filter for cluster queries (separate from person anchors)
  subjectFilter?: {
    type: 'surname' | 'place' | 'topic';
    value: string;               // "Gorney", "Wales", "military"
  };

  // Should the response ask for clarification before answering?
  needsClarification: boolean;
  clarificationReason?: string;

  // Parsed query constraints (passed to retrieval)
  constraints: string[];        // ["welsh", "military", "oldest"]

  // Retrieval contract (when answerMode requires retrieval)
  retrievalSpec?: RetrievalSpec;

  // Tool gating: which tools are available for this answer mode
  enabledTools?: ('control_visualization' | 'analyze_research_gaps')[];
}

// Typed retrieval contract — no string DSL
export interface RetrievalSpec {
  hardFilters: RetrievalFilter[];
  softBoosts: RetrievalFilter[];
  sort?: { field: 'birthYear' | 'deathYear' | 'age' | 'fullName'; direction: 'asc' | 'desc' };
  fallbackAllowed: boolean;
}

export interface RetrievalFilter {
  type: 'surname' | 'birthPlace' | 'deathPlace' | 'birthYear' | 'deathYear'
      | 'age' | 'occupation' | 'lifeEventType' | 'searchDomain' | 'hasRecord';
  operator: 'equals' | 'contains' | 'gte' | 'lte' | 'exists';
  value: string | number | boolean;
}

// ---------------------------------------------------------------------------
// Shared Data Contracts
// ---------------------------------------------------------------------------

export interface RetrievedPerson {
  id: string;
  fullName: string;
  surname: string;
  birthYear: number | null;
  deathYear: number | null;
  birthPlace: string | null;
  deathPlace: string | null;
  biography: string | null;
  marriagePlace: string | null;
  marriageYear: number | null;
  occupations: string[];
  lifeEvents: Array<{ event: string; year: number | null }>;
  parents?: Array<{ id: string; name: string }>;
  spouse?: { id: string; name: string };
  children?: Array<{ id: string; name: string }>;
  records?: RetrievedRecordSummary[];   // populated when record context is fetched
}

export interface RetrievedRecordSummary {
  type: string;           // "census", "death", "military_draft"
  collection: string;     // "1900 US Federal Census"
  year: number | null;
  tier: string | null;    // "A", "B", "C", "D", "E"
  place: string | null;
  role: string | null;
  participantCount: number;
}

export interface RelationshipPath {
  from: { id: string; name: string };
  to: { id: string; name: string };
  description: string;    // "Christine's paternal great-grandfather"
  hops: number;
}

export interface RetrievedContextBundle {
  people: RetrievedPerson[];
  relationshipPaths: RelationshipPath[];  // viewer → retrieved person paths
  queryPlan: QueryPlan;
}

export interface ValidationIssue {
  type: 'unknown-person' | 'unsupported-claim' | 'relationship-mismatch';
  text: string;           // the problematic sentence/phrase
  personId?: string;
  detail: string;         // what was wrong
}

// ---------------------------------------------------------------------------
// Module Dictionaries and Term Extraction
// ---------------------------------------------------------------------------

export interface GraphDictionaries {
  places: Set<string>;       // from places.json
  surnames: Set<string>;     // from distinct Person.surname
  occupations: Set<string>;  // from distinct Occupation.title
}

export interface QueryTerms {
  names: string[];
  places: string[];
  attributes: string[];
  relationships: string[];
  topics: string[];
  raw: string[];
}

// ---------------------------------------------------------------------------
// Conversation State
// ---------------------------------------------------------------------------

export interface ConversationAnchorState {
  lastResolvedPersonIds: string[];    // person IDs from the last resolved anchor
  lastQueryPlanSummary: string;       // "retrieval-qa about John Barrett"
  lastContextMarker: string | null;   // "[Context: Now viewing John Barrett's profile]"
  turnIndex: number;
}
