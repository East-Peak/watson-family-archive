/**
 * Tool handler functions for the AI chat pipeline.
 *
 * Each handler wraps existing Neo4j queries so Claude Opus can call them as
 * tools during a conversation. All Cypher values are parameterized (no string
 * interpolation) and LIMIT clauses use toInteger() per AuraDB requirements.
 */

import { executeQuery } from '@/lib/neo4j/client';
import { getPersonRecords } from '@/lib/neo4j/queries/records';
import { getTreeStats } from '@/lib/neo4j/queries/tree';
import { MAX_ANCESTRY_DEPTH } from '@/lib/neo4j/constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolContext {
  treeId: string;
  viewerId?: string;
}

export interface ToolResult {
  data: unknown;
  personIds?: string[];
}

// ---------------------------------------------------------------------------
// Section extraction helper
// ---------------------------------------------------------------------------

function extractSection(markdown: string, sectionName: string): string | null {
  const headingPattern = new RegExp(
    `^##?\\s+${sectionName.replace(/_/g, '[_ ]')}`,
    'im',
  );
  const match = markdown.match(headingPattern);
  if (!match || match.index === undefined) return null;
  const start = match.index;
  const nextHeading = markdown
    .slice(start + match[0].length)
    .search(/^##?\s+/m);
  if (nextHeading === -1) return markdown.slice(start).trim();
  return markdown.slice(start, start + match[0].length + nextHeading).trim();
}

// ---------------------------------------------------------------------------
// 1. handleSearchPeople
// ---------------------------------------------------------------------------

interface SearchPeopleInput {
  query: string;
  scope?: string;
  sort_by?: string;
  born_in_country?: string;
  died_in_country?: string;
  immigration?: boolean;
  military?: boolean;
  occupation?: string;
  place?: string;
}

export async function handleSearchPeople(
  input: SearchPeopleInput,
  context: ToolContext,
): Promise<ToolResult> {
  const params: Record<string, unknown> = {
    treeId: context.treeId,
    queryLower: input.query.toLowerCase(),
    limit: 10,
  };

  // Base match clause
  let matchClause: string;
  if (input.scope === 'viewer-ancestors' && context.viewerId) {
    matchClause = [
      'MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(viewer:Person {id: $viewerId})',
      `MATCH (viewer)-[:CHILD_OF*0..${MAX_ANCESTRY_DEPTH}]->(p:Person)`,
    ].join('\n');
    params.viewerId = context.viewerId;
  } else {
    matchClause = 'MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)';
  }

  // Build WHERE conditions
  const conditions: string[] = [];

  if (input.born_in_country) {
    conditions.push('p.birthPlace CONTAINS $country');
    params.country = input.born_in_country;
  }

  if (input.died_in_country) {
    conditions.push('p.deathPlace CONTAINS $deathCountry');
    params.deathCountry = input.died_in_country;
  }

  if (input.immigration) {
    // Immigration means born outside the US and died/lived in the US
    conditions.push(
      'p.birthPlace IS NOT NULL AND p.deathPlace IS NOT NULL' +
        " AND NOT (toLower(p.birthPlace) CONTAINS 'united states' OR toLower(p.birthPlace) CONTAINS ', usa' OR toLower(p.birthPlace) CONTAINS ', us')" +
        " AND (toLower(p.deathPlace) CONTAINS 'united states' OR toLower(p.deathPlace) CONTAINS ', usa' OR toLower(p.deathPlace) CONTAINS ', us' OR toLower(p.deathPlace) CONTAINS 'new york' OR toLower(p.deathPlace) CONTAINS 'pennsylvania' OR toLower(p.deathPlace) CONTAINS 'ohio' OR toLower(p.deathPlace) CONTAINS 'illinois' OR toLower(p.deathPlace) CONTAINS 'michigan' OR toLower(p.deathPlace) CONTAINS 'wisconsin')",
    );
  }

  if (input.military) {
    conditions.push(
      `(EXISTS { MATCH (p)-[:EXPERIENCED]->(e:LifeEvent) WHERE toLower(e.event) CONTAINS 'military' OR toLower(e.event) CONTAINS 'draft' OR toLower(e.event) CONTAINS 'enlist' } OR EXISTS { MATCH (p)-[:HAD_OCCUPATION]->(o:Occupation) WHERE toLower(o.title) CONTAINS 'military' OR toLower(o.title) CONTAINS 'soldier' OR toLower(o.title) CONTAINS 'army' OR toLower(o.title) CONTAINS 'navy' })`,
    );
  }

  if (input.occupation) {
    conditions.push(
      `EXISTS { MATCH (p)-[:HAD_OCCUPATION]->(o:Occupation) WHERE toLower(o.title) CONTAINS $occupation }`,
    );
    params.occupation = input.occupation.toLowerCase();
  }

  // TODO: CONTAINS does substring matching only — abbreviations like "SF" or
  // informal names like "Bay Area" won't match. Consider alias lookup via
  // place-aliases.json or fuzzy matching in a future pass.
  if (input.place) {
    conditions.push(
      `(toLower(p.birthPlace) CONTAINS $placeLower` +
        ` OR toLower(p.deathPlace) CONTAINS $placeLower` +
        ` OR EXISTS { MATCH (p)-[:BORN_IN|DIED_IN|LIVED_IN]->(pl:Place) WHERE toLower(pl.name) CONTAINS $placeLower })`,
    );
    params.placeLower = input.place.toLowerCase();
  }

  // Only add name match if no structured filters are set and query isn't a generic topic/place word
  const hasStructuredFilters =
    input.born_in_country ||
    input.died_in_country ||
    input.immigration ||
    input.military ||
    input.occupation ||
    input.place;
  if (!hasStructuredFilters && input.query && input.query.length > 1) {
    conditions.push(
      '(toLower(p.fullName) CONTAINS $queryLower OR toLower(p.surname) CONTAINS $queryLower)',
    );
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Sort
  let orderClause = '';
  if (input.sort_by === 'oldest') {
    orderClause = 'ORDER BY p.birthYear ASC';
  } else if (input.sort_by === 'youngest') {
    orderClause = 'ORDER BY p.birthYear DESC';
  } else if (input.sort_by === 'longest-lived') {
    orderClause = 'ORDER BY (p.deathYear - p.birthYear) DESC';
  }

  const cypher = [
    matchClause,
    whereClause,
    'OPTIONAL MATCH (p)-[:EVIDENCED_BY]->(r:Record)',
    'WITH p, count(DISTINCT r) as sourceCount',
    'RETURN p.id AS id, p.fullName AS fullName, p.surname AS surname,',
    '  p.birthYear AS birthYear, p.deathYear AS deathYear,',
    '  p.birthPlace AS birthPlace, p.deathPlace AS deathPlace,',
    '  p.status AS status, sourceCount',
    orderClause,
    'LIMIT toInteger($limit)',
  ]
    .filter(Boolean)
    .join('\n');

  const results = await executeQuery<{
    id: string;
    fullName: string;
    surname: string;
    birthYear: number | null;
    deathYear: number | null;
    birthPlace: string | null;
    deathPlace: string | null;
    status: string | null;
    sourceCount: number;
  }>(cypher, params);

  return {
    data: results,
    personIds: results.map((r) => r.id),
  };
}

// ---------------------------------------------------------------------------
// 2. handleFetchPerson
// ---------------------------------------------------------------------------

interface FetchPersonInput {
  person_id: string;
  section?: string;
}

export async function handleFetchPerson(
  input: FetchPersonInput,
  context: ToolContext,
): Promise<ToolResult> {
  const cypher = `
    MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person {id: $personId})
    OPTIONAL MATCH (p)-[:HAD_OCCUPATION]->(occ:Occupation)
    OPTIONAL MATCH (p)-[:EXPERIENCED]->(le:LifeEvent)
    OPTIONAL MATCH (p)-[:CHILD_OF]->(parent:Person)
    OPTIONAL MATCH (p)-[:SPOUSE_OF]-(spouse:Person)
    OPTIONAL MATCH (child:Person)-[:CHILD_OF]->(p)
    OPTIONAL MATCH (p)-[:BORN_IN]->(bp:Place)
    OPTIONAL MATCH (p)-[:DIED_IN]->(dp:Place)
    OPTIONAL MATCH (p)-[:EVIDENCED_BY]->(r:Record)
    WITH p, bp, dp, spouse,
      collect(DISTINCT occ.title) as occupations,
      collect(DISTINCT {event: le.event, year: le.yearInt}) as lifeEvents,
      collect(DISTINCT {id: parent.id, name: parent.fullName}) as parents,
      collect(DISTINCT {id: child.id, name: child.fullName}) as children,
      count(DISTINCT r) as sourceCount
    RETURN p.id as id, p.fullName as fullName, p.surname as surname,
      p.birthYear as birthYear, p.deathYear as deathYear,
      COALESCE(bp.name, p.birthPlace) as birthPlace,
      COALESCE(dp.name, p.deathPlace) as deathPlace,
      CASE WHEN p.biography IS NOT NULL THEN p.biography
           WHEN p.markdownContent IS NOT NULL THEN p.markdownContent
           ELSE null END as biography,
      p.status as status, sourceCount,
      occupations, lifeEvents, parents, children,
      CASE WHEN spouse IS NOT NULL THEN {id: spouse.id, name: spouse.fullName} ELSE null END as spouse
  `;

  const results = await executeQuery<{
    id: string;
    fullName: string;
    surname: string;
    birthYear: number | null;
    deathYear: number | null;
    birthPlace: string | null;
    deathPlace: string | null;
    biography: string | null;
    status: string | null;
    sourceCount: number;
    occupations: string[];
    lifeEvents: Array<{ event: string; year: number | null }>;
    parents: Array<{ id: string; name: string }>;
    children: Array<{ id: string; name: string }>;
    spouse: { id: string; name: string } | null;
  }>(cypher, { treeId: context.treeId, personId: input.person_id });

  if (results.length === 0) {
    return {
      data: { error: `Person '${input.person_id}' not found in tree.` },
      personIds: [input.person_id],
    };
  }

  const person = { ...results[0] };

  // Content handling by section
  if (person.biography) {
    const section = input.section;
    if (section && section !== 'summary' && section !== 'full') {
      // Extract a specific section
      person.biography = extractSection(person.biography, section);
    } else if (section === 'full') {
      // No truncation
    } else {
      // Default (no section or 'summary'): truncate to 3000 chars
      if (person.biography.length > 3000) {
        person.biography = person.biography.slice(0, 3000) + '...';
      }
    }
  }

  return {
    data: person,
    personIds: [input.person_id],
  };
}

// ---------------------------------------------------------------------------
// 3. handleFetchRecords
// ---------------------------------------------------------------------------

interface FetchRecordsInput {
  person_id: string;
}

export async function handleFetchRecords(
  input: FetchRecordsInput,
  context: ToolContext,
): Promise<ToolResult> {
  const records = await getPersonRecords(input.person_id, context.treeId);

  const mapped = records.map((record) => ({
    type: record.record.type,
    collection: record.record.collection,
    year: record.record.year,
    tier: record.record.tier,
    place: record.record.place,
    role: record.rel.role,
    age: record.rel.age,
    occupation: record.rel.occupation,
    participantCount: record.participants.length,
    participants: record.participants
      .slice(0, 10)
      .map((p) => ({ name: p.name, role: p.role, age: p.age })),
  }));

  return {
    data: mapped,
    personIds: [input.person_id],
  };
}

// ---------------------------------------------------------------------------
// 4. handleGetViewerLineage
// ---------------------------------------------------------------------------

export async function handleGetViewerLineage(
  _input: Record<string, never>,
  context: ToolContext,
): Promise<ToolResult> {
  if (!context.viewerId) {
    return {
      data: {
        error:
          'No viewer set. The user needs to select their identity in the viewer picker.',
      },
    };
  }

  const cypher = `
    MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(viewer:Person {id: $viewerId})
    MATCH path = (viewer)-[:CHILD_OF*0..${MAX_ANCESTRY_DEPTH}]->(ancestor:Person)
    RETURN DISTINCT ancestor.id as id, ancestor.fullName as name,
      ancestor.birthYear as birthYear, ancestor.deathYear as deathYear,
      ancestor.birthPlace as birthPlace, ancestor.surname as surname,
      length(path) as generation
    ORDER BY generation ASC, ancestor.birthYear ASC
  `;

  const results = await executeQuery<{
    id: string;
    name: string;
    birthYear: number | null;
    deathYear: number | null;
    birthPlace: string | null;
    surname: string;
    generation: number;
  }>(cypher, { treeId: context.treeId, viewerId: context.viewerId });

  return {
    data: {
      ancestors: results,
      totalCount: results.length,
    },
    personIds: results.map((r) => r.id),
  };
}

// ---------------------------------------------------------------------------
// 5. handleGetTreeStats
// ---------------------------------------------------------------------------

export async function handleGetTreeStats(
  _input: Record<string, never>,
  context: ToolContext,
): Promise<ToolResult> {
  const stats = await getTreeStats(context.treeId);

  return {
    data: {
      totalPeople: stats.personCount,
      totalRecords: stats.recordCount,
      earliestBirthYear: stats.oldestBirthYear,
      latestBirthYear: stats.newestBirthYear,
      totalPlaces: stats.placeCount,
      totalCountries: stats.countryCount,
      totalSurnames: stats.surnameCount,
    },
  };
}
