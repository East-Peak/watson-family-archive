/**
 * Two-stage retrieval pipeline for AI chat.
 *
 * Takes a QueryPlan and returns RetrievedPerson[] by:
 *   1. Building Cypher from the typed RetrievalSpec filters
 *   2. Running Stage 1 (structured) against Neo4j
 *   3. Optionally running Stage 2 (broad text fallback) if Stage 1 < 3 results
 *   4. Fetching record context for anchor persons
 *
 * All Cypher generation is deterministic — no LLM in this module.
 */

import { executeQuery } from '@/lib/neo4j/client';
import { getPersonRecords } from '@/lib/neo4j/queries/records';
import { MAX_ANCESTRY_DEPTH } from '@/lib/neo4j/constants';
import type {
  QueryPlan,
  RetrievalSpec,
  RetrievalFilter,
  RetrievedPerson,
  RetrievedRecordSummary,
} from './types';
import type { RecordNodeResult } from '@/lib/neo4j/queries/records';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STAGE_1_CAP = 15;
const STAGE_2_CAP = 10;
const FALLBACK_THRESHOLD = 3;

/** Trigger words that activate eager record fetching */
const EAGER_RECORD_TRIGGERS = [
  'records',
  'evidence',
  'sources',
  'census',
  'proof',
  'documented',
  'confidence',
  'verified',
];

// ---------------------------------------------------------------------------
// Neo4j row type (what executeQuery returns after toNativeTypes)
// ---------------------------------------------------------------------------

interface Neo4jPersonRow {
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
  parents: Array<{ id: string; name: string }>;
  spouseData: { id: string; name: string } | null;
  birthPlaceName: string | null;
  deathPlaceName: string | null;
  boostScore: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Execute the two-stage retrieval pipeline.
 *
 * @param plan     The query plan from the planner
 * @param treeId   Active tree ID
 * @param viewerId Optional viewer person ID (for viewer-scoped domains)
 * @param message  Original user message (for eager record trigger detection)
 */
export async function executeRetrieval(
  plan: QueryPlan,
  treeId: string,
  viewerId?: string,
  message?: string,
): Promise<RetrievedPerson[]> {
  const spec = plan.retrievalSpec;
  if (!spec) return [];

  // --- Stage 1: Structured search ---
  const { cypher, params } = buildCypherFromSpec(spec, treeId, plan, viewerId);
  const stage1Rows = await executeQuery<Neo4jPersonRow>(cypher, params);
  let candidates = stage1Rows.slice(0, STAGE_1_CAP).map(mapRowToPerson);

  // --- Stage 2: Broad fallback ---
  if (candidates.length < FALLBACK_THRESHOLD && spec.fallbackAllowed) {
    const searchTerm = deriveSearchTerm(plan);
    if (searchTerm) {
      const fallbackCypher = buildFallbackCypher(treeId, plan, viewerId);
      const stage2Rows = await executeQuery<Neo4jPersonRow>(
        fallbackCypher.cypher,
        { ...fallbackCypher.params, searchTerm: searchTerm.toLowerCase() },
      );
      const stage2People = stage2Rows.slice(0, STAGE_2_CAP).map(mapRowToPerson);

      // Deduplicate by ID
      const existingIds = new Set(candidates.map((c) => c.id));
      for (const person of stage2People) {
        if (!existingIds.has(person.id)) {
          candidates.push(person);
          existingIds.add(person.id);
        }
      }
    }
  }

  // --- Fix 4: Guarantee named-person anchor appears in results ---
  if (
    plan.anchor.type === 'named-person' &&
    plan.anchor.personId &&
    plan.anchor.confidence === 'resolved'
  ) {
    const anchorId = plan.anchor.personId;
    const alreadyIncluded = candidates.some((c) => c.id === anchorId);
    if (!alreadyIncluded) {
      const anchorRows = await executeQuery<Neo4jPersonRow>(
        buildNamedPersonFetchCypher(),
        { treeId, anchorId },
      );
      const anchorPeople = anchorRows.map(mapRowToPerson);
      candidates = [...anchorPeople, ...candidates];
    }
  }

  // --- Record context ---
  await fetchRecordContext(candidates, plan, treeId, message);

  return candidates;
}

// ---------------------------------------------------------------------------
// Cypher generation from RetrievalSpec
// ---------------------------------------------------------------------------

function buildCypherFromSpec(
  spec: RetrievalSpec,
  treeId: string,
  plan: QueryPlan,
  viewerId?: string,
): { cypher: string; params: Record<string, unknown> } {
  const params: Record<string, unknown> = { treeId };
  const lines: string[] = [];

  // --- MATCH clause from search domain ---
  lines.push(
    buildMatchClause(plan.searchDomain, treeId, plan, viewerId, params),
  );

  // --- Hard filter WHERE clauses ---
  const whereConditions: string[] = [];
  for (const filter of spec.hardFilters) {
    const condition = buildWhereCondition(filter, params);
    if (condition) whereConditions.push(condition);
  }

  // --- subjectFilter as hard WHERE clause ---
  const subjectCondition = buildSubjectFilterCondition(
    plan.subjectFilter,
    params,
  );
  if (subjectCondition) whereConditions.push(subjectCondition);

  if (whereConditions.length > 0) {
    lines.push(`WHERE ${whereConditions.join(' AND ')}`);
  }

  // --- OPTIONAL MATCH for enrichment ---
  lines.push(`OPTIONAL MATCH (p)-[:HAD_OCCUPATION]->(occ:Occupation)`);
  lines.push(`OPTIONAL MATCH (p)-[:EXPERIENCED]->(le:LifeEvent)`);
  lines.push(`OPTIONAL MATCH (p)-[:CHILD_OF]->(parent:Person)`);
  lines.push(`OPTIONAL MATCH (p)-[:SPOUSE_OF]-(spouse:Person)`);
  lines.push(`OPTIONAL MATCH (p)-[:BORN_IN]->(bp:Place)`);
  lines.push(`OPTIONAL MATCH (p)-[:DIED_IN]->(dp:Place)`);
  lines.push(`OPTIONAL MATCH (p)-[mr:MARRIED_AT]->(mp:Place)`);

  // --- WITH clause: collect enrichment + soft boost scoring ---
  const boostExpressions = buildBoostExpressions(spec.softBoosts, params);
  lines.push(`WITH p, bp, dp, mp, mr, spouse,`);
  lines.push(`  collect(DISTINCT occ.title) as occupations,`);
  lines.push(
    `  collect(DISTINCT {event: le.event, year: le.yearInt}) as lifeEvents,`,
  );
  lines.push(
    `  collect(DISTINCT {id: parent.id, name: parent.fullName}) as parents`,
  );

  // --- Boost score computation ---
  if (boostExpressions.length > 0) {
    lines.push(
      `WITH p, bp, dp, mp, mr, spouse, occupations, lifeEvents, parents,`,
    );
    lines.push(`  (${boostExpressions.join(' + ')}) as boostScore`);
  } else {
    lines.push(
      `WITH p, bp, dp, mp, mr, spouse, occupations, lifeEvents, parents, 0 as boostScore`,
    );
  }

  // --- RETURN ---
  // Single-person focus: fetch full markdown content. Multi-person: cap at 8000 chars.
  const isSinglePersonFocus =
    plan.anchor.confidence === 'resolved' &&
    ['named-person', 'current-page-person', 'conversation-referent'].includes(
      plan.anchor.type,
    );
  const contentExpr = isSinglePersonFocus
    ? `p.markdownContent`
    : `left(p.markdownContent, 8000)`;

  lines.push(`RETURN`);
  lines.push(`  p.id as id, p.fullName as fullName, p.surname as surname,`);
  lines.push(`  p.birthYear as birthYear, p.deathYear as deathYear,`);
  lines.push(`  COALESCE(bp.name, p.birthPlace) as birthPlaceName,`);
  lines.push(`  COALESCE(dp.name, p.deathPlace) as deathPlaceName,`);
  lines.push(`  CASE WHEN p.biography IS NOT NULL THEN p.biography`);
  lines.push(`       WHEN p.markdownContent IS NOT NULL THEN ${contentExpr}`);
  lines.push(`       ELSE null END as biography,`);
  lines.push(`  mp.name as marriagePlace,`);
  lines.push(`  mr.marriageYear as marriageYear,`);
  lines.push(`  occupations,`);
  lines.push(`  lifeEvents,`);
  lines.push(`  parents,`);
  lines.push(
    `  CASE WHEN spouse IS NOT NULL THEN {id: spouse.id, name: spouse.fullName} ELSE null END as spouseData,`,
  );
  lines.push(`  p.birthPlace as birthPlace,`);
  lines.push(`  p.deathPlace as deathPlace,`);
  lines.push(`  boostScore`);

  // --- ORDER BY ---
  const orderClauses: string[] = [];
  if (boostExpressions.length > 0) {
    orderClauses.push('boostScore DESC');
  }
  if (spec.sort) {
    const sortExpr = buildSortExpression(spec.sort);
    orderClauses.push(sortExpr);
  }
  if (orderClauses.length > 0) {
    lines.push(`ORDER BY ${orderClauses.join(', ')}`);
  }

  // --- LIMIT ---
  lines.push(`LIMIT toInteger(${STAGE_1_CAP})`);

  return { cypher: lines.join('\n'), params };
}

// ---------------------------------------------------------------------------
// MATCH clause by search domain
// ---------------------------------------------------------------------------

function buildMatchClause(
  domain: QueryPlan['searchDomain'],
  treeId: string,
  plan: QueryPlan,
  viewerId: string | undefined,
  params: Record<string, unknown>,
): string {
  switch (domain) {
    case 'viewer-ancestors': {
      params.viewerId = viewerId || plan.anchor.personId;
      return [
        `MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(viewer:Person {id: $viewerId})`,
        `MATCH (viewer)-[:CHILD_OF*0..${MAX_ANCESTRY_DEPTH}]->(p:Person)`,
        `WITH DISTINCT p`,
      ].join('\n');
    }
    case 'person-ancestors': {
      params.anchorId = plan.anchor.personId;
      return [
        `MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(anchor:Person {id: $anchorId})`,
        `MATCH (anchor)-[:CHILD_OF*0..${MAX_ANCESTRY_DEPTH}]->(p:Person)`,
        `WITH DISTINCT p`,
      ].join('\n');
    }
    case 'person-immediate-family': {
      params.anchorId = plan.anchor.personId;
      return [
        `MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(anchor:Person {id: $anchorId})`,
        `OPTIONAL MATCH (anchor)-[:CHILD_OF]->(parent:Person)`,
        `OPTIONAL MATCH (anchor)-[:SPOUSE_OF]-(spouse_fam:Person)`,
        `OPTIONAL MATCH (child_fam:Person)-[:CHILD_OF]->(anchor)`,
        `WITH collect(DISTINCT anchor) + collect(DISTINCT parent) + collect(DISTINCT spouse_fam) + collect(DISTINCT child_fam) as familyMembers`,
        `UNWIND familyMembers as p`,
        `WITH DISTINCT p`,
        `WHERE p IS NOT NULL`,
      ].join('\n');
    }
    case 'person-extended': {
      params.anchorId = plan.anchor.personId;
      return [
        `MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(anchor:Person {id: $anchorId})`,
        `OPTIONAL MATCH (anchor)-[:CHILD_OF*0..${MAX_ANCESTRY_DEPTH}]->(ancestor:Person)`,
        // Descendants: cap at 6 generations to prevent exponential expansion
        `OPTIONAL MATCH (descendant:Person)-[:CHILD_OF*0..6]->(anchor)`,
        `OPTIONAL MATCH (anchor)-[:SPOUSE_OF]-(spouse_ext:Person)`,
        `WITH collect(DISTINCT ancestor) + collect(DISTINCT descendant) + collect(DISTINCT spouse_ext) as familyMembers`,
        `UNWIND familyMembers as p`,
        `WITH DISTINCT p`,
        `WHERE p IS NOT NULL`,
      ].join('\n');
    }
    case 'page-visible-set': {
      params.visibleIds = plan.anchor.visiblePersonIds || [];
      return [
        `MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)`,
        `WHERE p.id IN $visibleIds`,
      ].join('\n');
    }
    case 'whole-tree':
    default:
      return `MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)`;
  }
}

// ---------------------------------------------------------------------------
// Hard filter → WHERE condition
// ---------------------------------------------------------------------------

function buildWhereCondition(
  filter: RetrievalFilter,
  params: Record<string, unknown>,
): string | null {
  // Skip searchDomain filters — handled by MATCH clause
  if (filter.type === 'searchDomain') return null;

  const paramKey = `filter_${filter.type}`;

  switch (filter.type) {
    case 'surname': {
      params[paramKey] = String(filter.value).toLowerCase();
      return `toLower(p.surname) = $${paramKey}`;
    }
    case 'birthPlace': {
      params[paramKey] = String(filter.value);
      if (filter.operator === 'contains') {
        return `p.birthPlace CONTAINS $${paramKey}`;
      }
      return `p.birthPlace = $${paramKey}`;
    }
    case 'deathPlace': {
      params[paramKey] = String(filter.value);
      if (filter.operator === 'contains') {
        return `p.deathPlace CONTAINS $${paramKey}`;
      }
      return `p.deathPlace = $${paramKey}`;
    }
    case 'birthYear': {
      params[paramKey] = Number(filter.value);
      if (filter.operator === 'gte') return `p.birthYear >= $${paramKey}`;
      if (filter.operator === 'lte') return `p.birthYear <= $${paramKey}`;
      return `p.birthYear = $${paramKey}`;
    }
    case 'deathYear': {
      params[paramKey] = Number(filter.value);
      if (filter.operator === 'gte') return `p.deathYear >= $${paramKey}`;
      if (filter.operator === 'lte') return `p.deathYear <= $${paramKey}`;
      return `p.deathYear = $${paramKey}`;
    }
    case 'occupation': {
      params[paramKey] = String(filter.value).toLowerCase();
      return `EXISTS { MATCH (p)-[:HAD_OCCUPATION]->(o:Occupation) WHERE toLower(o.title) CONTAINS $${paramKey} }`;
    }
    case 'lifeEventType': {
      params[paramKey] = String(filter.value).toLowerCase();
      return `EXISTS { MATCH (p)-[:EXPERIENCED]->(e:LifeEvent) WHERE toLower(e.event) CONTAINS $${paramKey} }`;
    }
    case 'hasRecord': {
      if (filter.value === true || filter.value === 'true') {
        return `EXISTS { MATCH (p)-[:EVIDENCED_BY]->(r:Record) }`;
      }
      return null;
    }
    case 'age': {
      const age = Number(filter.value);
      if (filter.operator === 'gte') {
        const paramKey = `age_${Object.keys(params).length}`;
        params[paramKey] = age;
        return `(p.deathYear - p.birthYear) >= $${paramKey}`;
      }
      if (filter.operator === 'lte') {
        const paramKey = `age_${Object.keys(params).length}`;
        params[paramKey] = age;
        return `(p.deathYear - p.birthYear) <= $${paramKey}`;
      }
      return null;
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// subjectFilter → hard WHERE condition
// ---------------------------------------------------------------------------

function buildSubjectFilterCondition(
  subjectFilter: QueryPlan['subjectFilter'],
  params: Record<string, unknown>,
): string | null {
  if (!subjectFilter) return null;

  switch (subjectFilter.type) {
    case 'surname': {
      params.subjectSurname = subjectFilter.value.toLowerCase();
      return `toLower(p.surname) = $subjectSurname`;
    }
    case 'place': {
      params.subjectPlace = subjectFilter.value;
      return `(p.birthPlace CONTAINS $subjectPlace OR p.deathPlace CONTAINS $subjectPlace)`;
    }
    case 'topic': {
      params.subjectTopic = subjectFilter.value.toLowerCase();
      return `(EXISTS { MATCH (p)-[:EXPERIENCED]->(e:LifeEvent) WHERE toLower(e.event) CONTAINS $subjectTopic } OR EXISTS { MATCH (p)-[:HAD_OCCUPATION]->(o:Occupation) WHERE toLower(o.title) CONTAINS $subjectTopic })`;
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Soft boosts → CASE expressions
// ---------------------------------------------------------------------------

function buildBoostExpressions(
  boosts: RetrievalFilter[],
  params: Record<string, unknown>,
): string[] {
  const expressions: string[] = [];
  for (let i = 0; i < boosts.length; i++) {
    const boost = boosts[i];
    const paramKey = `boost_${i}`;
    switch (boost.type) {
      case 'birthPlace': {
        params[paramKey] = String(boost.value);
        expressions.push(
          `CASE WHEN p.birthPlace CONTAINS $${paramKey} THEN 2 ELSE 0 END`,
        );
        break;
      }
      case 'deathPlace': {
        params[paramKey] = String(boost.value);
        expressions.push(
          `CASE WHEN p.deathPlace CONTAINS $${paramKey} THEN 2 ELSE 0 END`,
        );
        break;
      }
      case 'lifeEventType': {
        params[paramKey] = String(boost.value).toLowerCase();
        expressions.push(
          `CASE WHEN EXISTS { MATCH (p)-[:EXPERIENCED]->(e:LifeEvent) WHERE toLower(e.event) CONTAINS $${paramKey} } THEN 2 ELSE 0 END`,
        );
        break;
      }
      case 'occupation': {
        params[paramKey] = String(boost.value).toLowerCase();
        expressions.push(
          `CASE WHEN EXISTS { MATCH (p)-[:HAD_OCCUPATION]->(o:Occupation) WHERE toLower(o.title) CONTAINS $${paramKey} } THEN 2 ELSE 0 END`,
        );
        break;
      }
      case 'surname': {
        params[paramKey] = String(boost.value).toLowerCase();
        expressions.push(
          `CASE WHEN toLower(p.surname) = $${paramKey} THEN 2 ELSE 0 END`,
        );
        break;
      }
      default:
        break;
    }
  }
  return expressions;
}

// ---------------------------------------------------------------------------
// Sort expression
// ---------------------------------------------------------------------------

function buildSortExpression(sort: NonNullable<RetrievalSpec['sort']>): string {
  const dir = sort.direction === 'desc' ? 'DESC' : 'ASC';
  switch (sort.field) {
    case 'birthYear':
      return `p.birthYear ${dir}`;
    case 'deathYear':
      return `p.deathYear ${dir}`;
    case 'age':
      return `(p.deathYear - p.birthYear) ${dir}`;
    case 'fullName':
      return `p.fullName ${dir}`;
    default:
      return `p.birthYear ${dir}`;
  }
}

// ---------------------------------------------------------------------------
// Named-person anchor direct fetch (Fix 4)
// ---------------------------------------------------------------------------

function buildNamedPersonFetchCypher(): string {
  const lines: string[] = [
    `MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person {id: $anchorId})`,
    `OPTIONAL MATCH (p)-[:HAD_OCCUPATION]->(occ:Occupation)`,
    `OPTIONAL MATCH (p)-[:EXPERIENCED]->(le:LifeEvent)`,
    `OPTIONAL MATCH (p)-[:CHILD_OF]->(parent:Person)`,
    `OPTIONAL MATCH (p)-[:SPOUSE_OF]-(spouse:Person)`,
    `OPTIONAL MATCH (p)-[:BORN_IN]->(bp:Place)`,
    `OPTIONAL MATCH (p)-[:DIED_IN]->(dp:Place)`,
    `OPTIONAL MATCH (p)-[mr:MARRIED_AT]->(mp:Place)`,
    `WITH p, bp, dp, mp, mr, spouse,`,
    `  collect(DISTINCT occ.title) as occupations,`,
    `  collect(DISTINCT {event: le.event, year: le.yearInt}) as lifeEvents,`,
    `  collect(DISTINCT {id: parent.id, name: parent.fullName}) as parents`,
    `WITH p, bp, dp, mp, mr, spouse, occupations, lifeEvents, parents, 0 as boostScore`,
    `RETURN`,
    `  p.id as id, p.fullName as fullName, p.surname as surname,`,
    `  p.birthYear as birthYear, p.deathYear as deathYear,`,
    `  COALESCE(bp.name, p.birthPlace) as birthPlaceName,`,
    `  COALESCE(dp.name, p.deathPlace) as deathPlaceName,`,
    `  CASE WHEN p.biography IS NOT NULL THEN p.biography`,
    `       WHEN p.markdownContent IS NOT NULL THEN p.markdownContent`,
    `       ELSE null END as biography,`,
    `  mp.name as marriagePlace,`,
    `  mr.marriageYear as marriageYear,`,
    `  occupations,`,
    `  lifeEvents,`,
    `  parents,`,
    `  CASE WHEN spouse IS NOT NULL THEN {id: spouse.id, name: spouse.fullName} ELSE null END as spouseData,`,
    `  p.birthPlace as birthPlace,`,
    `  p.deathPlace as deathPlace,`,
    `  boostScore`,
    `LIMIT toInteger(1)`,
  ];
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Stage 2: Broad fallback
// ---------------------------------------------------------------------------

function buildFallbackCypher(
  treeId: string,
  plan: QueryPlan,
  viewerId?: string,
): { cypher: string; params: Record<string, unknown> } {
  const params: Record<string, unknown> = { treeId };
  const lines: string[] = [];

  // Apply the same search domain constraint
  lines.push(
    buildMatchClause(plan.searchDomain, treeId, plan, viewerId, params),
  );

  // Preserve subjectFilter from Stage 1 so fallback doesn't widen to unrelated people
  const subjectCondition = buildSubjectFilterCondition(
    plan.subjectFilter,
    params,
  );
  if (subjectCondition) {
    lines.push(`WHERE ${subjectCondition}`);
    lines.push(`  AND (toLower(p.fullName) CONTAINS $searchTerm`);
    lines.push(
      `   OR (p.biography IS NOT NULL AND toLower(p.biography) CONTAINS $searchTerm)`,
    );
    lines.push(
      `   OR (p.markdownContent IS NOT NULL AND toLower(p.markdownContent) CONTAINS $searchTerm))`,
    );
  } else {
    lines.push(`WHERE toLower(p.fullName) CONTAINS $searchTerm`);
    lines.push(
      `   OR (p.biography IS NOT NULL AND toLower(p.biography) CONTAINS $searchTerm)`,
    );
    lines.push(
      `   OR (p.markdownContent IS NOT NULL AND toLower(p.markdownContent) CONTAINS $searchTerm)`,
    );
  }

  // Minimal enrichment for fallback
  lines.push(`OPTIONAL MATCH (p)-[:HAD_OCCUPATION]->(occ:Occupation)`);
  lines.push(`OPTIONAL MATCH (p)-[:EXPERIENCED]->(le:LifeEvent)`);
  lines.push(`OPTIONAL MATCH (p)-[:CHILD_OF]->(parent:Person)`);
  lines.push(`OPTIONAL MATCH (p)-[:SPOUSE_OF]-(spouse:Person)`);
  lines.push(`OPTIONAL MATCH (p)-[:BORN_IN]->(bp:Place)`);
  lines.push(`OPTIONAL MATCH (p)-[:DIED_IN]->(dp:Place)`);
  lines.push(`OPTIONAL MATCH (p)-[mr:MARRIED_AT]->(mp:Place)`);

  lines.push(`WITH p, bp, dp, mp, mr, spouse,`);
  lines.push(`  collect(DISTINCT occ.title) as occupations,`);
  lines.push(
    `  collect(DISTINCT {event: le.event, year: le.yearInt}) as lifeEvents,`,
  );
  lines.push(
    `  collect(DISTINCT {id: parent.id, name: parent.fullName}) as parents`,
  );
  lines.push(
    `WITH p, bp, dp, mp, mr, spouse, occupations, lifeEvents, parents, 0 as boostScore`,
  );

  lines.push(`RETURN`);
  lines.push(`  p.id as id, p.fullName as fullName, p.surname as surname,`);
  lines.push(`  p.birthYear as birthYear, p.deathYear as deathYear,`);
  lines.push(`  COALESCE(bp.name, p.birthPlace) as birthPlaceName,`);
  lines.push(`  COALESCE(dp.name, p.deathPlace) as deathPlaceName,`);
  lines.push(`  CASE WHEN p.biography IS NOT NULL THEN p.biography`);
  lines.push(
    `       WHEN p.markdownContent IS NOT NULL THEN left(p.markdownContent, 2000)`,
  );
  lines.push(`       ELSE null END as biography,`);
  lines.push(`  mp.name as marriagePlace,`);
  lines.push(`  mr.marriageYear as marriageYear,`);
  lines.push(`  occupations,`);
  lines.push(`  lifeEvents,`);
  lines.push(`  parents,`);
  lines.push(
    `  CASE WHEN spouse IS NOT NULL THEN {id: spouse.id, name: spouse.fullName} ELSE null END as spouseData,`,
  );
  lines.push(`  p.birthPlace as birthPlace,`);
  lines.push(`  p.deathPlace as deathPlace,`);
  lines.push(`  boostScore`);
  lines.push(`LIMIT toInteger(${STAGE_2_CAP})`);

  return { cypher: lines.join('\n'), params };
}

// ---------------------------------------------------------------------------
// Search term derivation for fallback
// ---------------------------------------------------------------------------

function deriveSearchTerm(plan: QueryPlan): string | null {
  // Try constraints first
  if (plan.constraints.length > 0) {
    return plan.constraints[0];
  }
  // Try anchor name
  if (plan.anchor.personName) {
    return plan.anchor.personName;
  }
  // Try subject filter
  if (plan.subjectFilter?.value) {
    return plan.subjectFilter.value;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Record context fetching
// ---------------------------------------------------------------------------

async function fetchRecordContext(
  candidates: RetrievedPerson[],
  plan: QueryPlan,
  treeId: string,
  message?: string,
): Promise<void> {
  const anchorId = plan.anchor.personId;
  const isResolved = plan.anchor.confidence === 'resolved' && anchorId;
  const isEager = message
    ? EAGER_RECORD_TRIGGERS.some((t) => message.toLowerCase().includes(t))
    : false;

  if (!isResolved) return;

  if (isEager) {
    // Eager: fetch for up to 3 top candidates
    const targetIds = candidates.slice(0, 3).map((c) => c.id);
    for (const id of targetIds) {
      const records = await getPersonRecords(id, treeId);
      const person = candidates.find((c) => c.id === id);
      if (person) {
        person.records = records.map(mapRecordToSummary);
      }
    }
  } else {
    // Lazy: only the anchor person
    const anchorPerson = candidates.find((c) => c.id === anchorId);
    if (anchorPerson) {
      const records = await getPersonRecords(anchorId, treeId);
      anchorPerson.records = records.map(mapRecordToSummary);
    }
  }
}

// ---------------------------------------------------------------------------
// Mapping functions
// ---------------------------------------------------------------------------

function mapRowToPerson(row: Neo4jPersonRow): RetrievedPerson {
  return {
    id: row.id,
    fullName: row.fullName,
    surname: row.surname || '',
    birthYear: row.birthYear,
    deathYear: row.deathYear,
    birthPlace: row.birthPlaceName || row.birthPlace || null,
    deathPlace: row.deathPlaceName || row.deathPlace || null,
    biography: row.biography,
    marriagePlace: row.marriagePlace || null,
    marriageYear: row.marriageYear || null,
    occupations: (row.occupations || []).filter(Boolean),
    lifeEvents: (row.lifeEvents || []).filter((le) => le && le.event),
    parents: row.parents?.length
      ? row.parents.filter((p) => p && p.id)
      : undefined,
    spouse: row.spouseData || undefined,
    children: undefined, // populated by separate query if needed
    records: undefined, // populated by record context fetch
  };
}

function mapRecordToSummary(record: RecordNodeResult): RetrievedRecordSummary {
  return {
    type: record.record.type,
    collection: record.record.collection,
    year: record.record.year,
    tier: record.record.tier,
    place: record.record.place,
    role: record.rel.role,
    participantCount: record.participants.length,
  };
}
