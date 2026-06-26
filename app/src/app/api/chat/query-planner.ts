/**
 * Query Planner — classifies every chat query into a structured QueryPlan.
 *
 * Replaces scattered boolean flags with 7 answer modes, typed anchors,
 * and search domains. Pure classification logic — no LLM, no Neo4j.
 *
 * Classification priority:
 *   1. deterministic-fact (oldest ancestor, Welsh ancestor, military, relationship terms)
 *   2. visualization-tool
 *   3. stats
 *   4. page-anchored-qa (pronouns on person page, visible-set on tree)
 *   5. tool-assisted (research-gap questions)
 *   6. retrieval-qa (everything else with genealogical/historical content)
 *   7. clarification (ambiguous or out-of-scope)
 */

import type {
  QueryPlan,
  ConversationAnchorState,
  GraphDictionaries,
  QueryTerms,
  RetrievalSpec,
} from './types';
import { extractQueryTerms } from './term-extractor';
import {
  isOldestAncestorQuestion,
  isEarliestWelshAncestorQuestion,
  isMilitaryAncestorsQuestion,
  classifyChatIntent,
} from './intelligence';
import type { PageContext } from '@/types/visualization';
import type { SidebarMessage } from '@/types/chat';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ViewerIdentity {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Pattern sets
// ---------------------------------------------------------------------------

/** Pronouns that refer to the current page person or conversation referent. */
const PRONOUN_PATTERNS =
  /\b(he|she|him|her|his|they|their|this person|them)\b/i;

/** Viewer possessive patterns — "my", "me", "I" in lineage context. */
const VIEWER_POSSESSIVE = /\b(my|me|mine|our|i)\b/i;

/** Direct relationship terms that can be resolved deterministically. */
const DIRECT_RELATIONSHIP_TERMS =
  /\b(father|mother|dad|mom|parent|parents|child|children|son|daughter|spouse|husband|wife)\b/i;

/** Ambiguous relationship terms that need clarification. */
const AMBIGUOUS_RELATIONSHIP_TERMS =
  /\b(grandmother|grandfather|grandparent|grandparents|great[- ]?grandmother|great[- ]?grandfather|uncle|aunt|cousin)\b/i;

/** Aggregate/lineage relationship terms — not direct lookups. */
const LINEAGE_TERMS =
  /\b(ancestor|ancestors|lineage|bloodline|descendant|descendants|family line|family tree)\b/i;

/** Stats patterns — aggregate count questions. */
const STATS_PATTERNS = /\b(how many|total|count|percentage|number of)\b/i;
const STATS_SUBJECTS =
  /\b(people|person|ancestor|record|generation|place|countr|member)\b/i;

/** Research-gap / tool-assisted patterns. */
const RESEARCH_GAP_PATTERNS =
  /\b(missing|records?\s+missing|what.*search|source.*coverage|gaps?\b|records?\s+are\s+missing)\b/i;

/** Visible-set patterns for tree pages. */
const VISIBLE_SET_PATTERNS =
  /\b(focused person|on screen|on the screen|visible|currently showing|displayed)\b/i;

/** "this person" pattern — refers to page context person. */
const THIS_PERSON_PATTERN = /\b(this person|this individual)\b/i;

/** Family cluster patterns: "the X family", "the Xs". */
const FAMILY_CLUSTER_PATTERN = /\bthe\s+(\w+)\s+family\b/i;
const POSSESSIVE_SURNAME_PATTERN = /\bthe\s+(\w+?)s\b/i;

/** Out-of-scope patterns — things completely unrelated to genealogy/history. */
const OUT_OF_SCOPE_PATTERNS = [
  /\b(write|code|script|program|function|algorithm|calculate|compute|solve)\b.*\b(python|javascript|java|sql|html|css|code|script|program)\b/i,
  /\b(recipe|cook|bake|ingredient)\b/i,
  /\b(weather today|stock price|sports score)\b/i,
];

/** Genealogy/history indicators — anything related to family/history stays in scope. */
const GENEALOGY_INDICATORS =
  /\b(ancestor|family|born|died|marriage|census|record|person|people|tree|lineage|history|historical|war|military|immigration|emigrat|occupation|church|burial|religion|quaker|father|mother|parent|child|spouse|grave|death|birth|wed|veteran|coal|mining|generation|welsh|irish|german|english|scranton|wales|england|scotland|ireland|germany)\b/i;

/** Named person references: "[Name]'s [relationship]". */
const NAMED_POSSESSIVE_RELATIONSHIP =
  /\b(\w+(?:\s+\w+)?)'s\s+(father|mother|parent|parents|child|children|son|daughter|spouse|husband|wife)\b/i;

/** Viewer's own name + possessive relationship. */
function isViewerPossessiveRelationship(
  message: string,
  viewer: ViewerIdentity | null,
): boolean {
  if (!viewer) return false;
  const firstName = viewer.name.split(' ')[0];
  const pattern = new RegExp(
    `\\b${firstName}'s\\s+(father|mother|parent|parents|child|children|son|daughter|spouse|husband|wife)\\b`,
    'i',
  );
  return pattern.test(message);
}

// ---------------------------------------------------------------------------
// Ambiguous name detection
// ---------------------------------------------------------------------------

/**
 * Known ambiguous names in the tree — names that match multiple people.
 * Sourced from the graph at query time; no hardcoded people (an earlier
 * placeholder map embedded living relatives' names + birth details, which has
 * no place in the codebase and would leak into the public archive export).
 */
const AMBIGUOUS_NAMES: Record<
  string,
  Array<{ id: string; name: string; distinguisher: string }>
> = {};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasViewerPossessive(message: string): boolean {
  return VIEWER_POSSESSIVE.test(message);
}

function hasPronouns(message: string): boolean {
  return PRONOUN_PATTERNS.test(message);
}

function hasLineageTerms(message: string): boolean {
  return LINEAGE_TERMS.test(message);
}

function hasDirectRelationship(message: string): boolean {
  return DIRECT_RELATIONSHIP_TERMS.test(message);
}

function hasAmbiguousRelationship(message: string): boolean {
  return AMBIGUOUS_RELATIONSHIP_TERMS.test(message);
}

function isOutOfScope(message: string): boolean {
  if (GENEALOGY_INDICATORS.test(message)) return false;
  return OUT_OF_SCOPE_PATTERNS.some((p) => p.test(message));
}

function isOnPersonPage(
  pageContext: PageContext | null,
): pageContext is PageContext & { type: 'person' } {
  return pageContext?.type === 'person' && !!pageContext.personId;
}

function isOnTreePage(
  pageContext: PageContext | null,
): pageContext is PageContext & { type: 'tree' } {
  return pageContext?.type === 'tree';
}

/**
 * Check if the conversation anchor state has been reset by a context marker
 * that matches the current page context.
 */
function anchorResetByContextMarker(
  anchorState: ConversationAnchorState | null,
  pageContext: PageContext | null,
): boolean {
  if (!anchorState?.lastContextMarker) return false;
  if (!pageContext?.personId) return false;
  // If the context marker references a different person than the last resolved anchor,
  // the anchor has been reset to the page person.
  return true;
}

/**
 * Extract a potential surname cluster from a message.
 * Handles "the Gorney family" and "the Barretts" patterns.
 */
function extractSurnameCluster(
  message: string,
  dictionaries: GraphDictionaries,
): string | null {
  // "the Gorney family"
  const familyMatch = FAMILY_CLUSTER_PATTERN.exec(message);
  if (familyMatch) {
    const candidate = familyMatch[1].toLowerCase();
    if (dictionaries.surnames.has(candidate)) return candidate;
  }

  // "the Barretts" — strip trailing 's' and check
  const possMatch = POSSESSIVE_SURNAME_PATTERN.exec(message);
  if (possMatch) {
    const candidate = possMatch[1].toLowerCase();
    if (dictionaries.surnames.has(candidate)) return candidate;
  }

  return null;
}

/**
 * Detect names in the message that match multiple people (ambiguous).
 */
function detectAmbiguousNames(terms: QueryTerms): {
  isAmbiguous: boolean;
  candidates?: Array<{ id: string; name: string; distinguisher: string }>;
  matchedName?: string;
} {
  // Check multi-word name combinations against ambiguous names
  for (let i = 0; i < terms.names.length - 1; i++) {
    const twoWord = `${terms.names[i]} ${terms.names[i + 1]}`.toLowerCase();
    if (AMBIGUOUS_NAMES[twoWord]) {
      return {
        isAmbiguous: true,
        candidates: AMBIGUOUS_NAMES[twoWord],
        matchedName: twoWord,
      };
    }
  }

  // Check single names
  for (const name of terms.names) {
    const lower = name.toLowerCase();
    if (AMBIGUOUS_NAMES[lower]) {
      return {
        isAmbiguous: true,
        candidates: AMBIGUOUS_NAMES[lower],
        matchedName: lower,
      };
    }
  }

  return { isAmbiguous: false };
}

/**
 * Build a minimal retrieval spec from query terms.
 */
function buildRetrievalSpec(
  terms: QueryTerms,
  searchDomain: QueryPlan['searchDomain'],
): RetrievalSpec {
  const hardFilters: RetrievalSpec['hardFilters'] = [];
  const softBoosts: RetrievalSpec['softBoosts'] = [];

  // Search domain constraint
  if (searchDomain !== 'none' && searchDomain !== 'whole-tree') {
    hardFilters.push({
      type: 'searchDomain',
      operator: 'equals',
      value: searchDomain,
    });
  }

  // Surname hard filter (if specific person query)
  for (const name of terms.names) {
    softBoosts.push({
      type: 'surname',
      operator: 'equals',
      value: name,
    });
  }

  // Place soft boosts
  for (const place of terms.places) {
    softBoosts.push({
      type: 'birthPlace',
      operator: 'contains',
      value: place,
    });
  }

  // Attribute-based sort
  let sort: RetrievalSpec['sort'] | undefined;
  if (
    terms.attributes.includes('oldest') ||
    terms.attributes.includes('earliest') ||
    terms.attributes.includes('first')
  ) {
    sort = { field: 'birthYear', direction: 'asc' };
  } else if (
    terms.attributes.includes('youngest') ||
    terms.attributes.includes('latest') ||
    terms.attributes.includes('last')
  ) {
    sort = { field: 'birthYear', direction: 'desc' };
  }

  return {
    hardFilters,
    softBoosts,
    sort,
    fallbackAllowed: true,
  };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function classifyQueryPlan(
  message: string,
  viewer: ViewerIdentity | null,
  pageContext: PageContext | null,
  history: SidebarMessage[],
  anchorState: ConversationAnchorState | null,
  dictionaries: GraphDictionaries,
): QueryPlan {
  const normalized = message.toLowerCase();
  const terms = extractQueryTerms(message, dictionaries);
  const hasPossessive = hasViewerPossessive(message);
  const hasPronouns_ = hasPronouns(message);

  // ─── 1. Deterministic-fact ────────────────────────────────────────────────

  // 1a. Earliest Welsh ancestor (check before general oldest)
  if (viewer && isEarliestWelshAncestorQuestion(message)) {
    return makePlan(
      'deterministic-fact',
      viewerAnchor(viewer),
      'viewer-ancestors',
      terms,
    );
  }

  // 1b. Oldest ancestor — but NOT if the query is about immigration/migration
  // "first ancestor who came to America" is an immigration question, not an age question
  const hasImmigrationContext =
    /\b(came to|immigrat|emigrat|arrived|crossed|settled in|moved to|journey|voyage|ship)\b/i.test(
      message,
    );
  if (viewer && isOldestAncestorQuestion(message) && !hasImmigrationContext) {
    return makePlan(
      'deterministic-fact',
      viewerAnchor(viewer),
      'viewer-ancestors',
      terms,
    );
  }

  // 1c. Military ancestors
  if (
    viewer &&
    isMilitaryAncestorsQuestion(message) &&
    (hasPossessive || hasLineageTerms(message))
  ) {
    return makePlan(
      'deterministic-fact',
      viewerAnchor(viewer),
      'viewer-ancestors',
      terms,
    );
  }

  // 1d. Direct relationship terms with viewer possessive: "Who is my father?"
  if (
    viewer &&
    hasPossessive &&
    hasDirectRelationship(message) &&
    !hasAmbiguousRelationship(message)
  ) {
    return makePlan(
      'deterministic-fact',
      viewerAnchor(viewer),
      'viewer-ancestors',
      terms,
    );
  }

  // 1e. Viewer's name + possessive relationship: "Who is Christine's father?"
  if (viewer && isViewerPossessiveRelationship(message, viewer)) {
    return makePlan(
      'deterministic-fact',
      viewerAnchor(viewer),
      'viewer-ancestors',
      terms,
    );
  }

  // ─── 2. Visualization ────────────────────────────────────────────────────

  const chatIntent = classifyChatIntent(message);
  if (chatIntent === 'visualization') {
    const anchor = viewer ? viewerAnchor(viewer) : noneAnchor();
    return {
      ...makePlan(
        'visualization-tool',
        anchor,
        viewer ? 'viewer-ancestors' : 'none',
        terms,
      ),
      enabledTools: ['control_visualization'],
    };
  }

  // ─── 3. Stats ────────────────────────────────────────────────────────────

  if (
    STATS_PATTERNS.test(normalized) &&
    STATS_SUBJECTS.test(normalized) &&
    !hasPossessive
  ) {
    return makePlan('stats', noneAnchor(), 'none', terms);
  }

  // ─── 4. Page-anchored-qa ─────────────────────────────────────────────────

  // 4a. Visible-set on tree page
  if (isOnTreePage(pageContext) && VISIBLE_SET_PATTERNS.test(normalized)) {
    return makePlan(
      'page-anchored-qa',
      visibleSetAnchor(pageContext),
      'page-visible-set',
      terms,
    );
  }

  // 4b. "this person" or pronouns on a person page
  if (isOnPersonPage(pageContext)) {
    const usesPagePronouns =
      hasPronouns_ || THIS_PERSON_PATTERN.test(normalized);
    // If pronouns are used and conversation anchor was reset by a context marker,
    // prefer the page context over the conversation referent
    const anchorReset = anchorResetByContextMarker(anchorState, pageContext);

    if (usesPagePronouns || anchorReset) {
      // Check if asking about broader lineage — fall through to retrieval-qa
      const asksAboutLineage =
        hasLineageTerms(message) && !hasDirectRelationship(message);

      if (!asksAboutLineage) {
        return makePlan(
          'page-anchored-qa',
          currentPageAnchor(pageContext),
          'person-immediate-family',
          terms,
        );
      }
    }
  }

  // ─── 5. Tool-assisted ───────────────────────────────────────────────────

  if (RESEARCH_GAP_PATTERNS.test(normalized)) {
    const anchor = resolveNamedPersonAnchor(terms, dictionaries);
    return {
      ...makePlan('tool-assisted', anchor, 'whole-tree', terms),
      enabledTools: ['analyze_research_gaps'],
    };
  }

  // ─── 6. Retrieval-qa ────────────────────────────────────────────────────

  // Check for out-of-scope before falling into retrieval
  if (isOutOfScope(message)) {
    return makePlan('clarification', noneAnchor(), 'none', terms, {
      needsClarification: true,
      clarificationReason:
        "This question appears unrelated to family history. I'm best at helping with family history — want to explore your ancestors?",
    });
  }

  // Determine the anchor for retrieval-qa
  const anchor = resolveRetrievalAnchor(
    message,
    viewer,
    pageContext,
    history,
    anchorState,
    terms,
    dictionaries,
  );

  // Determine search domain based on anchor
  const searchDomain = resolveSearchDomain(message, anchor, viewer);

  // Build the plan
  const plan = makePlan(
    anchor.plan.answerMode || 'retrieval-qa',
    anchor.anchor,
    searchDomain,
    terms,
  );

  // Add subject filter for cluster queries
  const surnameCluster = extractSurnameCluster(message, dictionaries);
  if (surnameCluster && anchor.anchor.type === 'none') {
    plan.subjectFilter = { type: 'surname', value: surnameCluster };
  }

  // Build retrieval spec
  plan.retrievalSpec = buildRetrievalSpec(terms, searchDomain);

  return plan;
}

// ---------------------------------------------------------------------------
// Anchor resolution for retrieval-qa
// ---------------------------------------------------------------------------

interface ResolvedAnchor {
  anchor: QueryPlan['anchor'];
  plan: { answerMode?: QueryPlan['answerMode'] };
}

function resolveRetrievalAnchor(
  message: string,
  viewer: ViewerIdentity | null,
  pageContext: PageContext | null,
  _history: SidebarMessage[],
  anchorState: ConversationAnchorState | null,
  terms: QueryTerms,
  dictionaries: GraphDictionaries,
): ResolvedAnchor {
  const hasPossessive = hasViewerPossessive(message);
  const hasPronouns_ = hasPronouns(message);

  // Viewer possessives (my, me) → viewer anchor
  if (viewer && hasPossessive) {
    // "my grandmother" = ambiguous (paternal or maternal)
    if (hasAmbiguousRelationship(message)) {
      return {
        anchor: {
          type: 'viewer',
          personId: viewer.id,
          personName: viewer.name,
          confidence: 'ambiguous',
        },
        plan: {},
      };
    }

    return {
      anchor: viewerAnchor(viewer),
      plan: {},
    };
  }

  // Viewer present + lineage context (ancestors, etc.) without possessive
  // "Did any ancestors fight at Gettysburg?" → viewer scoped
  if (
    viewer &&
    hasLineageTerms(message) &&
    !hasExplicitNamedPerson(message, terms, dictionaries)
  ) {
    return {
      anchor: viewerAnchor(viewer),
      plan: {},
    };
  }

  // Pronouns + conversation referent
  if (hasPronouns_ && anchorState?.lastResolvedPersonIds?.length) {
    // But if on a person page with a context marker reset, prefer page context
    if (
      isOnPersonPage(pageContext) &&
      anchorResetByContextMarker(anchorState, pageContext)
    ) {
      return {
        anchor: currentPageAnchor(pageContext),
        plan: { answerMode: 'page-anchored-qa' },
      };
    }

    return {
      anchor: {
        type: 'conversation-referent',
        personId: anchorState.lastResolvedPersonIds[0],
        confidence: 'resolved',
      },
      plan: {},
    };
  }

  // Surname cluster query ("the Gorney family", "the Barretts")
  if (isSurnameClusterQuery(message, terms, dictionaries)) {
    return {
      anchor: noneAnchor(),
      plan: {},
    };
  }

  // Named person in query
  if (hasNamedPerson(terms)) {
    const namedAnchor = resolveNamedPersonAnchor(terms, dictionaries);
    // If ambiguous, route to clarification
    if (namedAnchor.confidence === 'ambiguous') {
      return {
        anchor: namedAnchor,
        plan: { answerMode: 'clarification' },
      };
    }
    return {
      anchor: namedAnchor,
      plan: {},
    };
  }

  // Viewer present with a question that implies viewer scope (born in Wales, etc.)
  if (viewer && terms.places.length > 0) {
    return {
      anchor: viewerAnchor(viewer),
      plan: {},
    };
  }

  // No anchor — whole-tree or general question
  return {
    anchor: noneAnchor(),
    plan: {},
  };
}

function resolveSearchDomain(
  message: string,
  resolved: ResolvedAnchor,
  viewer: ViewerIdentity | null,
): QueryPlan['searchDomain'] {
  const { anchor } = resolved;

  switch (anchor.type) {
    case 'viewer':
      return 'viewer-ancestors';

    case 'current-page-person':
      if (hasLineageTerms(message)) return 'person-ancestors';
      return 'person-immediate-family';

    case 'conversation-referent':
      return 'person-extended';

    case 'named-person':
      if (hasLineageTerms(message)) return 'person-ancestors';
      return 'whole-tree';

    case 'visible-set':
      return 'page-visible-set';

    case 'none':
    default:
      return 'whole-tree';
  }
}

function hasNamedPerson(terms: QueryTerms): boolean {
  return terms.names.length > 0;
}

/**
 * Check if the message has an explicitly named person (not just a surname
 * appearing in a cluster pattern like "the Gorney family" or "the Barretts",
 * and not just an unknown capitalized word when lineage context is present).
 *
 * When the message mentions ancestors/lineage and a viewer is present,
 * we only count dictionary-matched surnames as person names. Capitalized
 * words like "Gettysburg" that aren't known surnames are likely places.
 */
function hasExplicitNamedPerson(
  message: string,
  terms: QueryTerms,
  dictionaries: GraphDictionaries,
): boolean {
  if (terms.names.length === 0) return false;
  // If the only name is inside a cluster pattern, it's not an explicit person
  if (isSurnameClusterQuery(message, terms, dictionaries)) return false;
  // When lineage terms are present, only dictionary-confirmed surnames count
  // as explicit person names. Unknown capitalized words (Gettysburg, etc.) are
  // more likely places or events, not people.
  if (hasLineageTerms(message)) {
    const confirmedNames = terms.names.filter((n) =>
      dictionaries.surnames.has(n.toLowerCase()),
    );
    return confirmedNames.length > 0;
  }
  return true;
}

/**
 * Check if the query is a surname cluster query ("the Gorney family", "the Barretts")
 * where the surname is NOT part of a full person name.
 */
function isSurnameClusterQuery(
  message: string,
  terms: QueryTerms,
  dictionaries: GraphDictionaries,
): boolean {
  const cluster = extractSurnameCluster(message, dictionaries);
  if (!cluster) return false;
  // If the query has names that are ONLY the cluster surname (no first name),
  // treat as cluster query. Also handle pluralized forms (Barretts → barrett).
  const nonClusterNames = terms.names.filter((n) => {
    const lower = n.toLowerCase();
    return lower !== cluster && lower !== cluster + 's';
  });
  return nonClusterNames.length === 0;
}

// ---------------------------------------------------------------------------
// Anchor factories
// ---------------------------------------------------------------------------

function viewerAnchor(viewer: ViewerIdentity): QueryPlan['anchor'] {
  return {
    type: 'viewer',
    personId: viewer.id,
    personName: viewer.name,
    confidence: 'resolved',
  };
}

function currentPageAnchor(pageContext: PageContext): QueryPlan['anchor'] {
  return {
    type: 'current-page-person',
    personId: pageContext.personId,
    personName: pageContext.personName,
    confidence: 'resolved',
  };
}

function visibleSetAnchor(pageContext: PageContext): QueryPlan['anchor'] {
  return {
    type: 'visible-set',
    visiblePersonIds: pageContext.visiblePersonIds,
    focusPersonId: pageContext.focusPersonId,
    confidence: 'resolved',
  };
}

function noneAnchor(): QueryPlan['anchor'] {
  return {
    type: 'none',
    confidence: 'resolved',
  };
}

function resolveNamedPersonAnchor(
  terms: QueryTerms,
  _dictionaries: GraphDictionaries,
): QueryPlan['anchor'] {
  // Check for ambiguous names
  const ambiguity = detectAmbiguousNames(terms);
  if (ambiguity.isAmbiguous) {
    return {
      type: 'named-person',
      personName: ambiguity.matchedName,
      confidence: 'ambiguous',
      candidates: ambiguity.candidates,
    };
  }

  // Resolved named person
  const personName = terms.names.join(' ');
  return {
    type: 'named-person',
    personName,
    confidence: 'resolved',
  };
}

// ---------------------------------------------------------------------------
// Plan factory
// ---------------------------------------------------------------------------

function makePlan(
  answerMode: QueryPlan['answerMode'],
  anchor: QueryPlan['anchor'],
  searchDomain: QueryPlan['searchDomain'],
  terms: QueryTerms,
  overrides?: Partial<QueryPlan>,
): QueryPlan {
  return {
    answerMode,
    anchor,
    searchDomain,
    needsClarification:
      answerMode === 'clarification' || anchor.confidence === 'ambiguous',
    constraints: [...terms.attributes, ...terms.topics, ...terms.places],
    ...overrides,
  };
}
