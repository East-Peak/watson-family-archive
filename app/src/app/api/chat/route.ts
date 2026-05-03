import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { executeQuery } from '@/lib/neo4j/client';
import { buildSystemPrompt, buildGroundingInstructions } from './systemPrompt';
import { CHAT_TOOLS, ALL_TOOLS, parseVisualizationCommand, type VisualizationCommand } from './tools';
import type { PageContext } from '@/types/visualization';
import type { VisualizationFeedback } from '@/types/visualization';
import type { ChatApiResponse } from '@/types/chat';
import {
  classifyChatIntent,
  dedupeSourcePeople,
  inferHistoricalContextUsage,
  isEarliestWelshAncestorQuestion,
  isMilitaryAncestorsQuestion,
  isOldestAncestorQuestion,
  shouldUseViewerScope,
} from './intelligence';
import { scoreLineageClaim, scoreMilitaryLineageClaim } from './confidence';
import { classifyQueryPlan } from './query-planner';
import { getGraphDictionaries } from './graph-dictionaries';
import { executeRetrieval } from './retrieval';
import { buildContextBundle, renderContextBlock } from './context-builder';
import { validateAndRepairResponse } from './response-validator';
import { handleRelationshipQuery } from './relationship-handler';
import { handleSearchPeople, handleFetchPerson, handleFetchRecords, handleGetViewerLineage, handleGetTreeStats } from './tool-handlers';
import { buildToolsSystemPrompt } from './tools-prompt';
import { runToolLoop } from './tool-loop';

import { siteConfig } from '@/lib/siteConfig';
import { getPersonRecordContext } from '@/lib/neo4j/queries/records';
import { analyzeRecordGaps } from '@/lib/neo4j/queries/research';

export const maxDuration = 120;

const DEFAULT_TREE_ID = siteConfig.defaultTreeId;

// Knowledge base entry type (now populated from Neo4j)
interface KnowledgeBaseEntry {
  id: string;
  name: string;
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
}

/**
 * Get knowledge for specific person IDs from Neo4j
 */
async function getKnowledgeForPeople(personIds: string[]): Promise<Map<string, KnowledgeBaseEntry>> {
  if (personIds.length === 0) return new Map();

  const result = await executeQuery<{
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
  }>(
    `
    MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
    WHERE p.id IN $personIds
    OPTIONAL MATCH (p)-[:BORN_IN]->(bp:Place)
    OPTIONAL MATCH (p)-[:DIED_IN]->(dp:Place)
    OPTIONAL MATCH (p)-[mr:MARRIED_AT]->(mp:Place)
    OPTIONAL MATCH (p)-[:HAD_OCCUPATION]->(o:Occupation)
    OPTIONAL MATCH (p)-[:EXPERIENCED]->(le:LifeEvent)
    WITH p, bp, dp, mp, mr,
      collect(DISTINCT o.title) as occupations,
      collect(DISTINCT {event: le.event, year: le.yearInt}) as lifeEvents
    RETURN
      p.id as id, p.fullName as fullName, p.surname as surname,
      p.birthYear as birthYear, p.deathYear as deathYear,
      COALESCE(bp.name, p.birthPlace) as birthPlace,
      COALESCE(dp.name, p.deathPlace) as deathPlace,
      CASE WHEN p.biography IS NOT NULL THEN p.biography
           WHEN p.markdownContent IS NOT NULL THEN left(p.markdownContent, 2000)
           ELSE null END as biography,
      mp.name as marriagePlace,
      mr.marriageYear as marriageYear,
      occupations,
      lifeEvents
    `,
    { treeId: DEFAULT_TREE_ID, personIds }
  );

  const resultMap = new Map<string, KnowledgeBaseEntry>();
  for (const r of result) {
    resultMap.set(r.id, {
      id: r.id,
      name: r.fullName,
      surname: r.surname || '',
      birthYear: r.birthYear,
      deathYear: r.deathYear,
      birthPlace: r.birthPlace,
      deathPlace: r.deathPlace,
      biography: r.biography,
      marriagePlace: r.marriagePlace,
      marriageYear: r.marriageYear,
      occupations: (r.occupations || []).filter(Boolean),
      lifeEvents: (r.lifeEvents || []).filter(le => le && le.event),
    });
  }
  return resultMap;
}

/**
 * Keyword search in Neo4j for people with matching name, biography, occupation, or content
 */
async function searchKnowledgeBase(query: string, topK: number = 5): Promise<KnowledgeBaseEntry[]> {
  const safeTopK = Math.max(1, Math.floor(topK));
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter(w =>
    w.length > 2 && !['the', 'and', 'for', 'are', 'was', 'were', 'what', 'who', 'how', 'when', 'where', 'why', 'about', 'tell', 'know'].includes(w)
  );

  if (queryWords.length === 0) return [];

  // Search Neo4j for matches in name, surname, biography, places, occupations, or markdownContent
  const result = await executeQuery<{
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
  }>(
    `
    MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
    WHERE toLower(p.fullName) CONTAINS $term
       OR toLower(p.surname) CONTAINS $term
       OR toLower(p.biography) CONTAINS $term
       OR (p.markdownContent IS NOT NULL AND toLower(p.markdownContent) CONTAINS $term)
       OR EXISTS {
         MATCH (p)-[:BORN_IN|DIED_IN|MARRIED_AT|LIVED_IN]->(pl:Place)
         WHERE toLower(pl.name) CONTAINS $term
       }
       OR EXISTS {
         MATCH (p)-[:HAD_OCCUPATION]->(o:Occupation)
         WHERE toLower(o.title) CONTAINS $term
       }
    OPTIONAL MATCH (p)-[:BORN_IN]->(bp:Place)
    OPTIONAL MATCH (p)-[:DIED_IN]->(dp:Place)
    OPTIONAL MATCH (p)-[mr:MARRIED_AT]->(mp:Place)
    OPTIONAL MATCH (p)-[:HAD_OCCUPATION]->(occ:Occupation)
    OPTIONAL MATCH (p)-[:EXPERIENCED]->(le:LifeEvent)
    WITH p, bp, dp, mp, mr,
      collect(DISTINCT occ.title) as occupations,
      collect(DISTINCT {event: le.event, year: le.yearInt}) as lifeEvents
    RETURN
      p.id as id, p.fullName as fullName, p.surname as surname,
      p.birthYear as birthYear, p.deathYear as deathYear,
      COALESCE(bp.name, p.birthPlace) as birthPlace,
      COALESCE(dp.name, p.deathPlace) as deathPlace,
      CASE WHEN p.biography IS NOT NULL THEN p.biography
           WHEN p.markdownContent IS NOT NULL THEN left(p.markdownContent, 2000)
           ELSE null END as biography,
      mp.name as marriagePlace,
      mr.marriageYear as marriageYear,
      occupations,
      lifeEvents
    LIMIT toInteger($topK)
    `,
    { treeId: DEFAULT_TREE_ID, term: queryWords[0], topK: safeTopK }
  );

  return result.map(r => ({
    id: r.id,
    name: r.fullName,
    surname: r.surname || '',
    birthYear: r.birthYear,
    deathYear: r.deathYear,
    birthPlace: r.birthPlace,
    deathPlace: r.deathPlace,
    biography: r.biography,
    marriagePlace: r.marriagePlace,
    marriageYear: r.marriageYear,
    occupations: (r.occupations || []).filter(Boolean),
    lifeEvents: (r.lifeEvents || []).filter(le => le && le.event),
  }));
}

interface Neo4jPerson {
  id: string;
  fullName: string;
  surname: string;
  birthYear: number | null;
  deathYear: number | null;
  birthPlace: string | null;
  biography: string | null;
}

interface ViewerIdentity {
  id: string;
  name: string;
  familyBranch?: string;
}

interface ViewerLineagePerson {
  id: string;
  name: string;
  birthYear: number | null;
  deathYear: number | null;
  birthPlace: string | null;
  biography: string | null;
  verificationStatus: string | null;
  parentCount: number;
  wars: string[];
  generation: number;
}

interface ViewerLineageSummary {
  context: string;
  ancestorCount: number;
  earliestBirth: number | null;
  latestBirth: number | null;
  oldestAncestor: ViewerLineagePerson | null;
  lineagePeople: ViewerLineagePerson[];
  earliestCandidates: ViewerLineagePerson[];
  militaryAncestors: ViewerLineagePerson[];
  sourcePeople: Array<{ id: string; name: string }>;
}

async function searchKnowledgeBaseForViewerLineage(
  query: string,
  viewerId: string,
  topK: number = 5
): Promise<KnowledgeBaseEntry[]> {
  const safeTopK = Math.max(1, Math.floor(topK));
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter(w =>
    w.length > 2 && !['the', 'and', 'for', 'are', 'was', 'were', 'what', 'who', 'how', 'when', 'where', 'why', 'about', 'tell', 'know', 'my'].includes(w)
  );

  if (queryWords.length === 0) return [];

  const result = await executeQuery<{
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
  }>(
    `
    MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(root:Person {id: $viewerId})
    MATCH path = (root)-[:CHILD_OF*0..20]->(p:Person)
    WITH DISTINCT p
    WHERE toLower(p.fullName) CONTAINS $term
       OR toLower(p.surname) CONTAINS $term
       OR toLower(p.biography) CONTAINS $term
       OR (p.markdownContent IS NOT NULL AND toLower(p.markdownContent) CONTAINS $term)
       OR EXISTS {
         MATCH (p)-[:BORN_IN|DIED_IN|MARRIED_AT|LIVED_IN]->(pl:Place)
         WHERE toLower(pl.name) CONTAINS $term
       }
       OR EXISTS {
         MATCH (p)-[:HAD_OCCUPATION]->(o:Occupation)
         WHERE toLower(o.title) CONTAINS $term
       }
    OPTIONAL MATCH (p)-[:BORN_IN]->(bp:Place)
    OPTIONAL MATCH (p)-[:DIED_IN]->(dp:Place)
    OPTIONAL MATCH (p)-[mr:MARRIED_AT]->(mp:Place)
    OPTIONAL MATCH (p)-[:HAD_OCCUPATION]->(occ:Occupation)
    OPTIONAL MATCH (p)-[:EXPERIENCED]->(le:LifeEvent)
    WITH p, bp, dp, mp, mr,
      collect(DISTINCT occ.title) as occupations,
      collect(DISTINCT {event: le.event, year: le.yearInt}) as lifeEvents
    RETURN
      p.id as id, p.fullName as fullName, p.surname as surname,
      p.birthYear as birthYear, p.deathYear as deathYear,
      COALESCE(bp.name, p.birthPlace) as birthPlace,
      COALESCE(dp.name, p.deathPlace) as deathPlace,
      CASE WHEN p.biography IS NOT NULL THEN p.biography
           WHEN p.markdownContent IS NOT NULL THEN left(p.markdownContent, 2000)
           ELSE null END as biography,
      mp.name as marriagePlace,
      mr.marriageYear as marriageYear,
      occupations,
      lifeEvents
    LIMIT toInteger($topK)
    `,
    { treeId: DEFAULT_TREE_ID, viewerId, term: queryWords[0], topK: safeTopK }
  );

  return result.map(r => ({
    id: r.id,
    name: r.fullName,
    surname: r.surname || '',
    birthYear: r.birthYear,
    deathYear: r.deathYear,
    birthPlace: r.birthPlace,
    deathPlace: r.deathPlace,
    biography: r.biography,
    marriagePlace: r.marriagePlace,
    marriageYear: r.marriageYear,
    occupations: (r.occupations || []).filter(Boolean),
    lifeEvents: (r.lifeEvents || []).filter(le => le && le.event),
  }));
}

async function buildViewerLineageContext(viewer: ViewerIdentity): Promise<ViewerLineageSummary> {
  const statsResult = await executeQuery<{
    ancestorCount: number;
    earliestBirth: number | null;
    latestBirth: number | null;
  }>(
    `
    MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(root:Person {id: $viewerId})
    MATCH path = (root)-[:CHILD_OF*0..20]->(ancestor:Person)
    WITH DISTINCT ancestor
    RETURN
      count(ancestor) as ancestorCount,
      min(ancestor.birthYear) as earliestBirth,
      max(ancestor.birthYear) as latestBirth
    `,
    { treeId: DEFAULT_TREE_ID, viewerId: viewer.id }
  );

  const lineagePeople = await executeQuery<ViewerLineagePerson>(
    `
    MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(root:Person {id: $viewerId})
    MATCH path = (root)-[:CHILD_OF*0..20]->(ancestor:Person)
    WITH ancestor, min(length(path)) as generation
    OPTIONAL MATCH (ancestor)-[:BORN_IN]->(bp:Place)
    OPTIONAL MATCH (ancestor)-[:SERVED_IN]->(war:War)
    OPTIONAL MATCH (ancestor)-[:CHILD_OF]->(parent:Person)
    RETURN
      ancestor.id as id,
      ancestor.fullName as name,
      ancestor.birthYear as birthYear,
      ancestor.deathYear as deathYear,
      COALESCE(bp.name, ancestor.birthPlace) as birthPlace,
      ancestor.biography as biography,
      ancestor.verificationStatus as verificationStatus,
      count(DISTINCT parent) as parentCount,
      collect(DISTINCT war.name) as wars,
      generation
    ORDER BY CASE WHEN ancestor.birthYear IS NULL THEN 999999 ELSE ancestor.birthYear END ASC, generation DESC
    `,
    { treeId: DEFAULT_TREE_ID, viewerId: viewer.id }
  );

  const stats = statsResult[0] || {
    ancestorCount: 0,
    earliestBirth: null,
    latestBirth: null,
  };
  const oldestAncestor = lineagePeople[0] || null;
  const earliestAncestors = lineagePeople.slice(0, 6);
  const militaryAncestors = lineagePeople.filter((person) => person.wars && person.wars.length > 0).slice(0, 12);

  let context = `## Viewer-Scoped Lineage Context\n\n`;
  context += `Viewer: [${viewer.name}](/person/${viewer.id})\n`;
  context += `- Scope: direct lineage only (viewer and ancestors)\n`;
  context += `- Lineage records found: ${stats.ancestorCount}\n`;
  context += `- Birth-year span in lineage: ${stats.earliestBirth ?? '?'} - ${stats.latestBirth ?? '?'}\n`;

  if (oldestAncestor) {
    const years = oldestAncestor.birthYear && oldestAncestor.deathYear
      ? `(${oldestAncestor.birthYear}-${oldestAncestor.deathYear})`
      : oldestAncestor.birthYear
        ? `(b. ${oldestAncestor.birthYear})`
        : '';
    context += `- Oldest known direct ancestor: [${oldestAncestor.name}](/person/${oldestAncestor.id}) ${years}\n`;
  }

  if (earliestAncestors.length > 0) {
    context += `\n### Earliest Known Ancestors in Viewer Line\n`;
    for (const ancestor of earliestAncestors) {
      const years = ancestor.birthYear && ancestor.deathYear
        ? `(${ancestor.birthYear}-${ancestor.deathYear})`
        : ancestor.birthYear
          ? `(b. ${ancestor.birthYear})`
          : '';
      context += `- **[${ancestor.name}](/person/${ancestor.id})** ${years} — generation ${ancestor.generation}\n`;
    }
  }

  context += `\nIMPORTANT: For "my/our" lineage questions, answer using this viewer-scoped lineage data unless the user explicitly asks for whole-tree scope.\n`;

  return {
    context,
    ancestorCount: stats.ancestorCount,
    earliestBirth: stats.earliestBirth,
    latestBirth: stats.latestBirth,
    oldestAncestor,
    lineagePeople,
    earliestCandidates: earliestAncestors,
    militaryAncestors,
    sourcePeople: earliestAncestors.map((person) => ({ id: person.id, name: person.name })),
  };
}

function getAmbiguityGapYears(candidates: ViewerLineagePerson[], primary: ViewerLineagePerson): number | null {
  const comparable = candidates
    .filter((person) => person.id !== primary.id && person.birthYear != null)
    .map((person) => person.birthYear as number)
    .sort((a, b) => a - b);
  if (primary.birthYear == null || comparable.length === 0) return null;
  return Math.abs(comparable[0] - primary.birthYear);
}

function formatCandidateYears(person: ViewerLineagePerson): string {
  if (person.birthYear && person.deathYear) return `${person.birthYear}-${person.deathYear}`;
  if (person.birthYear) return `b. ${person.birthYear}`;
  return 'dates unknown';
}

// Build context directly from Neo4j
async function buildNeo4jContext(query: string, personId?: string): Promise<string> {
  const treeId = DEFAULT_TREE_ID;
  let context = `## Family Tree Knowledge Base (from Neo4j)\n\n`;

  // Get overall stats
  const statsResult = await executeQuery<{
    totalPeople: number;
    livingCount: number;
    earliestBirth: number;
    latestBirth: number;
  }>(
    `
    MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
    RETURN
      count(p) as totalPeople,
      count(CASE WHEN p.isLiving = true THEN 1 END) as livingCount,
      min(p.birthYear) as earliestBirth,
      max(p.birthYear) as latestBirth
    `,
    { treeId }
  );

  if (statsResult[0]) {
    const s = statsResult[0];
    context += `### Family Overview\n`;
    context += `- Total people: ${s.totalPeople}\n`;
    context += `- Living: ${s.livingCount}\n`;
    context += `- Records span: ${s.earliestBirth || '?'} - ${s.latestBirth || '?'}\n\n`;
  }

  // If viewing a specific person, get their full context
  if (personId) {
    const personResult = await executeQuery<{
      id: string;
      fullName: string;
      surname: string;
      birthYear: number;
      deathYear: number;
      birthPlace: string;
      deathPlace: string;
      biography: string;
      fatherName: string;
      fatherId: string;
      motherName: string;
      motherId: string;
      occupations: string[];
      lifeEvents: Array<{ event: string; year: number | null }>;
    }>(
      `
      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person {id: $personId})
      OPTIONAL MATCH (p)-[:BORN_IN]->(bp:Place)
      OPTIONAL MATCH (p)-[:DIED_IN]->(dp:Place)
      OPTIONAL MATCH (father:Person)-[:PARENT_OF]->(p) WHERE father.sex = 'M'
      OPTIONAL MATCH (mother:Person)-[:PARENT_OF]->(p) WHERE mother.sex = 'F'
      OPTIONAL MATCH (p)-[:HAD_OCCUPATION]->(occ:Occupation)
      OPTIONAL MATCH (p)-[:EXPERIENCED]->(le:LifeEvent)
      WITH p, bp, dp, father, mother,
        collect(DISTINCT occ.title) as occupations,
        collect(DISTINCT {event: le.event, year: le.yearInt}) as lifeEvents
      RETURN
        p.id as id, p.fullName as fullName, p.surname as surname,
        p.birthYear as birthYear, p.deathYear as deathYear,
        bp.name as birthPlace, dp.name as deathPlace,
        CASE WHEN p.biography IS NOT NULL THEN p.biography
             WHEN p.markdownContent IS NOT NULL THEN left(p.markdownContent, 2000)
             ELSE null END as biography,
        father.fullName as fatherName, father.id as fatherId,
        mother.fullName as motherName, mother.id as motherId,
        occupations,
        lifeEvents
      `,
      { treeId, personId }
    );

    if (personResult[0]) {
      const p = personResult[0];
      context += `### Current Person: ${p.fullName}\n`;
      context += `- ID: ${p.id}\n`;
      context += `- Born: ${p.birthYear || 'Unknown'}${p.birthPlace ? ` in ${p.birthPlace}` : ''}\n`;
      context += `- Died: ${p.deathYear || 'Unknown'}${p.deathPlace ? ` in ${p.deathPlace}` : ''}\n`;
      if (p.fatherName) context += `- Father: [${p.fatherName}](/person/${p.fatherId})\n`;
      if (p.motherName) context += `- Mother: [${p.motherName}](/person/${p.motherId})\n`;
      const occupations = (p.occupations || []).filter(Boolean);
      if (occupations.length > 0) context += `- Occupations: ${occupations.join(', ')}\n`;
      const lifeEvents = (p.lifeEvents || []).filter((le: { event: string; year: number | null }) => le && le.event);
      if (lifeEvents.length > 0) {
        const eventSummaries = lifeEvents
          .sort((a: { year: number | null }, b: { year: number | null }) => (a.year ?? 9999) - (b.year ?? 9999))
          .slice(0, 10)
          .map((le: { event: string; year: number | null }) => le.year ? `${le.year} - ${le.event}` : le.event);
        context += `- Key Events: ${eventSummaries.join('; ')}\n`;
      }
      if (p.biography) context += `\n**Biography:**\n${p.biography}\n`;
      context += '\n';

      // Get their spouses and children
      const familyResult = await executeQuery<{
        spouseName: string;
        spouseId: string;
        childName: string;
        childId: string;
      }>(
        `
        MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person {id: $personId})
        OPTIONAL MATCH (p)-[:SPOUSE_OF]-(s:Person)
        OPTIONAL MATCH (p)-[:PARENT_OF]->(c:Person)
        RETURN DISTINCT
          s.fullName as spouseName, s.id as spouseId,
          c.fullName as childName, c.id as childId
        `,
        { treeId, personId }
      );

      const spouses = [...new Set(familyResult.filter(r => r.spouseName).map(r => `[${r.spouseName}](/person/${r.spouseId})`))];
      const children = [...new Set(familyResult.filter(r => r.childName).map(r => `[${r.childName}](/person/${r.childId})`))];

      if (spouses.length > 0) context += `- Spouses: ${spouses.join(', ')}\n`;
      if (children.length > 0) context += `- Children: ${children.join(', ')}\n`;
      context += '\n';
    }
  }

  // Search for relevant people based on query
  const queryLower = query.toLowerCase();

  // Check for topic-specific queries
  if (queryLower.includes('military') || queryLower.includes('war') || queryLower.includes('veteran')) {
    const milResult = await executeQuery<{ id: string; name: string; war: string }>(
      `
      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)-[:SERVED_IN]->(w:War)
      RETURN p.id as id, p.fullName as name, w.name as war
      LIMIT 10
      `,
      { treeId }
    );
    if (milResult.length > 0) {
      context += `### Military Veterans\n`;
      milResult.forEach(r => {
        context += `- [${r.name}](/person/${r.id}) - served in ${r.war}\n`;
      });
      context += '\n';
    }
  }

  if (queryLower.includes('oldest') || queryLower.includes('longest') || queryLower.includes('lived')) {
    const longResult = await executeQuery<{ id: string; name: string; age: number }>(
      `
      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
      WHERE p.birthYear IS NOT NULL AND p.deathYear IS NOT NULL
      WITH p, p.deathYear - p.birthYear as age
      WHERE age > 80
      RETURN p.id as id, p.fullName as name, age
      ORDER BY age DESC
      LIMIT 10
      `,
      { treeId }
    );
    if (longResult.length > 0) {
      context += `### Longest-Lived Ancestors\n`;
      longResult.forEach(r => {
        context += `- [${r.name}](/person/${r.id}) - lived to ${r.age} years\n`;
      });
      context += '\n';
    }
  }

  if (queryLower.includes('welsh') || queryLower.includes('wales')) {
    const welshResult = await executeQuery<{ id: string; name: string; place: string }>(
      `
      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)-[:BORN_IN]->(pl:Place)
      WHERE pl.country = 'Wales' OR pl.state = 'Wales'
      RETURN p.id as id, p.fullName as name, pl.name as place
      LIMIT 10
      `,
      { treeId }
    );
    if (welshResult.length > 0) {
      context += `### Welsh Heritage\n`;
      welshResult.forEach(r => {
        context += `- [${r.name}](/person/${r.id}) - born in ${r.place}\n`;
      });
      context += '\n';
    }
  }

  // General name search
  const searchTerms = queryLower.split(/\s+/).filter(w =>
    w.length > 3 && !['what', 'when', 'where', 'who', 'how', 'about', 'tell', 'know', 'the', 'and', 'for'].includes(w)
  );

  if (searchTerms.length > 0 && !personId) {
    const searchResult = await executeQuery<Neo4jPerson>(
      `
      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
      WHERE toLower(p.fullName) CONTAINS $term OR toLower(p.surname) CONTAINS $term
      OPTIONAL MATCH (p)-[:BORN_IN]->(bp:Place)
      RETURN p.id as id, p.fullName as fullName, p.surname as surname,
             p.birthYear as birthYear, p.deathYear as deathYear,
             bp.name as birthPlace, p.biography as biography
      LIMIT 8
      `,
      { treeId, term: searchTerms[0] }
    );

    if (searchResult.length > 0) {
      context += `### People Matching "${searchTerms[0]}"\n`;
      searchResult.forEach(p => {
        const years = p.birthYear && p.deathYear ? `(${p.birthYear}-${p.deathYear})` : p.birthYear ? `(b. ${p.birthYear})` : '';
        context += `- [${p.fullName}](/person/${p.id}) ${years}`;
        if (p.birthPlace) context += ` - born in ${p.birthPlace}`;
        context += '\n';
        if (p.biography) context += `  ${p.biography.slice(0, 200)}...\n`;
      });
      context += '\n';
    }
  }

  // Get top surnames for reference
  const surnameResult = await executeQuery<{ surname: string; count: number }>(
    `
    MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
    WHERE p.surname IS NOT NULL
    RETURN p.surname as surname, count(*) as count
    ORDER BY count DESC
    LIMIT 8
    `,
    { treeId }
  );

  context += `### Major Family Branches\n`;
  surnameResult.forEach(r => {
    context += `- ${r.surname}: ${r.count} people\n`;
  });

  return context;
}

function isEnabledFlag(value: string | undefined): boolean {
  return (value ?? '').trim() === 'true';
}

export async function GET(_request: NextRequest) {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function POST(request: NextRequest) {
  try {
    const { message, history, context: pageContext, viewer } = await request.json();

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // Check for Anthropic API key
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicApiKey) {
      return NextResponse.json({
        error: 'Chat is not configured. Please set ANTHROPIC_API_KEY environment variable.',
        response: 'I apologize, but the chat feature is not yet configured. Please check back later or explore the family tree using the other features.',
      }, { status: 503 });
    }

    // Build context from Neo4j
    const chatIntent = classifyChatIntent(message);
    const validatedViewer: ViewerIdentity | undefined =
      viewer && typeof viewer === 'object' && typeof viewer.id === 'string' && typeof viewer.name === 'string'
        ? {
            id: viewer.id,
            name: viewer.name,
            familyBranch: typeof viewer.familyBranch === 'string' ? viewer.familyBranch : undefined,
          }
        : undefined;

    // ── Opus tools pipeline (feature-flagged) ──────────────────────────────
    const useToolsPipeline = isEnabledFlag(process.env.CHAT_USE_TOOLS_PIPELINE);

    if (useToolsPipeline) {
      console.log('[AI Tools Pipeline] ENTERED — flag is true, message:', message?.slice(0, 50));
      try {
        // Build system prompt
        const toolsPrompt = buildToolsSystemPrompt(
          validatedViewer ?? null,
          pageContext as PageContext,
        );

        // Build tool handler map
        const toolHandlerMap: Record<string, (input: any, ctx: any) => Promise<any>> = {
          search_people: handleSearchPeople,
          fetch_person: handleFetchPerson,
          fetch_records: handleFetchRecords,
          get_viewer_lineage: handleGetViewerLineage,
          get_tree_stats: handleGetTreeStats,
        };

        // Wrap the existing analyzeRecordGaps function for the tool loop
        toolHandlerMap['analyze_research_gaps'] = async (input: any, ctx: any) => {
          const personId = input.person_id || (pageContext as PageContext)?.personId;
          if (!personId) {
            return { data: { error: 'No person_id provided or available from page context.' } };
          }
          const analysis = await analyzeRecordGaps(personId, ctx.treeId);
          return {
            data: analysis,
            personIds: [personId],
          };
        };

        const requestContext = {
          treeId: DEFAULT_TREE_ID,
          viewerId: validatedViewer?.id,
          pageContext: pageContext as PageContext,
        };

        // Build conversation history
        const recentHistory = (history ?? []).slice(-6).map((m: { type?: string; role?: string; content: string }) => ({
          role: (m.type === 'assistant' || m.role === 'assistant') ? 'assistant' as const : 'user' as const,
          content: m.content,
        }));

        // Run the tool loop
        const anthropic = new Anthropic({ apiKey: anthropicApiKey });
        const loopResult = await runToolLoop({
          anthropic,
          model: 'claude-opus-4-5-20251101',
          systemPrompt: toolsPrompt,
          tools: ALL_TOOLS,
          messages: [...recentHistory, { role: 'user' as const, content: message }],
          toolHandlers: toolHandlerMap,
          requestContext,
        });

        // Run response validator on the output
        // Build validator bundle from rich person data collected during tool execution
        const validatorPeople = Array.from(loopResult.toolResultPersonIds).map(id => {
          const rich = loopResult.toolResultPeople.get(id);
          return {
            id,
            fullName: rich?.fullName || id.replace(/_/g, ' '),
            surname: rich?.surname || '',
            birthYear: rich?.birthYear ?? null,
            deathYear: rich?.deathYear ?? null,
            birthPlace: rich?.birthPlace ?? null,
            deathPlace: rich?.deathPlace ?? null,
            biography: null as string | null,
            marriagePlace: null as string | null,
            marriageYear: null as number | null,
            occupations: rich?.occupations || ([] as string[]),
            lifeEvents: [] as Array<{ event: string; year: number | null }>,
          };
        });

        const bundle = {
          people: validatorPeople,
          relationshipPaths: [] as any[],
          queryPlan: {} as any,
        };

        const validation = validateAndRepairResponse(loopResult.text, bundle);

        // Extract cited people from validated text
        const personLinkPattern = /\[([^\]]+)\]\(\/person\/([a-z0-9_]+)\)/g;
        const citedPeople: Array<{ id: string; name: string }> = [];
        let linkMatch: RegExpExecArray | null;
        while ((linkMatch = personLinkPattern.exec(validation.text)) !== null) {
          if (!citedPeople.some(p => p.id === linkMatch![2])) {
            citedPeople.push({ id: linkMatch[2], name: linkMatch[1] });
          }
        }

        const sourcePeople = dedupeSourcePeople(
          citedPeople.length > 0 ? citedPeople : [],
        );

        // Determine viewer-scoped flag
        const isViewerScoped = Boolean(validatedViewer?.id) && loopResult.toolResultPersonIds.size > 0;

        return NextResponse.json({
          response: validation.text,
          searchMethod: 'neo4j' as const,
          sources: {
            database: 'Neo4j Graph Database',
            historicalKnowledge: /historical context:/i.test(validation.text),
            intent: classifyChatIntent(message),
            viewerScoped: isViewerScoped,
            familyRecords: {
              totalPeopleReferenced: sourcePeople.length,
              people: sourcePeople,
            },
          },
          ...(loopResult.visualizationCommand ? { visualizationCommand: loopResult.visualizationCommand } : {}),
          ...(loopResult.visualizationFeedback ? { visualizationFeedback: loopResult.visualizationFeedback } : {}),
        });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        const errStack = error instanceof Error ? error.stack : 'no stack';
        console.error('[AI Tools Pipeline] Error:', errMsg);
        console.error('[AI Tools Pipeline] Stack:', errStack);
        // Fall through to existing pipelines on error
      }
    }

    // ── New reliability pipeline (feature-flagged) ────────────────────────────
    const useNewPipeline = isEnabledFlag(process.env.CHAT_USE_NEW_PIPELINE);

    if (useNewPipeline) {
      const dictionaries = await getGraphDictionaries();
      const queryPlan = classifyQueryPlan(
        message,
        validatedViewer ?? null,
        (pageContext as PageContext) ?? null,
        history ?? [],
        null, // anchorState — not persisted in v1
        dictionaries,
      );

      switch (queryPlan.answerMode) {
        case 'deterministic-fact': {
          // Try relationship handler first (new v1 handler)
          const anchorIsViewer = queryPlan.anchor.type === 'viewer';
          const anchorIsNamed = (queryPlan.anchor.type === 'named-person' || queryPlan.anchor.type === 'current-page-person') && queryPlan.anchor.personId;
          if (validatedViewer?.id && (anchorIsViewer || anchorIsNamed)) {
            const subjectId = anchorIsNamed ? queryPlan.anchor.personId : undefined;
            const relResult = await handleRelationshipQuery(queryPlan, validatedViewer.id, DEFAULT_TREE_ID, subjectId);
            if (relResult) {
              return NextResponse.json({
                response: relResult.response,
                searchMethod: 'neo4j',
                sources: {
                  database: 'Neo4j Graph Database',
                  historicalKnowledge: false,
                  intent: 'question' as const,
                  viewerScoped: true,
                  familyRecords: {
                    totalPeopleReferenced: relResult.people.length,
                    people: relResult.people.map(p => ({ id: p.id, name: p.name })),
                  },
                },
              });
            }
          }
          // Fall through to existing oldest/Welsh/military handlers
          break;
        }

        case 'visualization-tool': {
          // Existing visualization pipeline — fall through to existing code
          break;
        }

        case 'stats': {
          try {
            const statsResult = await executeQuery<{ count: number }>(
              `MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person) RETURN count(p) as count`,
              { treeId: DEFAULT_TREE_ID }
            );
            const count = statsResult[0]?.count ?? 0;
            return NextResponse.json({
              response: `The Watson Family Tree contains **${count.toLocaleString()} people** spanning from the 1500s to the present day.`,
              searchMethod: 'neo4j',
              sources: {
                database: 'Neo4j Graph Database',
                historicalKnowledge: false,
                intent: 'question' as const,
                viewerScoped: false,
                familyRecords: { totalPeopleReferenced: 0, people: [] },
              },
            });
          } catch {
            break; // fall through to legacy on error
          }
        }

        case 'clarification': {
          // Return a clarification response directly
          const clarificationText = queryPlan.needsClarification && queryPlan.clarificationReason
            ? queryPlan.clarificationReason
            : "I'm not sure what you're asking about. Could you be more specific? For example, you could ask about a specific person, your family history, or a place your ancestors lived.";

          return NextResponse.json({
            response: clarificationText,
            searchMethod: 'neo4j',
            sources: {
              database: 'Neo4j Graph Database',
              historicalKnowledge: false,
              intent: 'question' as const,
              viewerScoped: false,
              familyRecords: { totalPeopleReferenced: 0, people: [] },
            },
          });
        }

        case 'retrieval-qa':
        case 'page-anchored-qa':
        case 'tool-assisted': {
          // NEW PIPELINE: retrieval → context → LLM → validate
          try {
            const treeId = DEFAULT_TREE_ID;

            // 1. Retrieve
            const retrieved = await executeRetrieval(
              queryPlan,
              treeId,
              validatedViewer?.id,
              message,
            );

            // 2. Build context
            const bundle = buildContextBundle(
              retrieved,
              queryPlan,
              validatedViewer ?? null,
            );
            const contextBlock = renderContextBlock(bundle);

            // 3. Get stats for system prompt from Neo4j
            const pipelineStatsResult = await executeQuery<{ totalPeople: number; verified: number }>(
              `
              MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
              RETURN
                count(p) as totalPeople,
                count(CASE WHEN p.verificationStatus = 'VERIFIED' THEN 1 END) as verified
              `,
              { treeId },
            );
            const pipelineStats = {
              totalPeople: pipelineStatsResult[0]?.totalPeople || 0,
              withResearch: pipelineStatsResult[0]?.totalPeople || 0,
              withBiography: 0,
              verified: pipelineStatsResult[0]?.verified || 0,
            };

            // 4. Build system prompt with grounding
            const basePrompt = buildSystemPrompt(
              pageContext as PageContext,
              pipelineStats,
              undefined,
              validatedViewer,
            );
            const groundingRules = buildGroundingInstructions();
            const fullPrompt = `${basePrompt}\n\n${groundingRules}\n\n${contextBlock}`;

            // 5. Build history for the API call
            const recentHistory = (history ?? []).slice(-6).map((m: { type?: string; role?: string; content: string }) => ({
              role: (m.type === 'assistant' || m.role === 'assistant') ? 'assistant' as const : 'user' as const,
              content: m.content,
            }));

            // 6. Determine enabled tools
            const enabledTools = queryPlan.enabledTools?.length
              ? CHAT_TOOLS.filter(t => queryPlan.enabledTools!.includes(t.name as 'control_visualization' | 'analyze_research_gaps'))
              : undefined;

            // 7. Call Anthropic
            const anthropic = new Anthropic({ apiKey: anthropicApiKey });
            const anthropicMessages = [
              ...recentHistory,
              { role: 'user' as const, content: message },
            ];

            const anthropicResponse = await anthropic.messages.create({
              model: 'claude-opus-4-5-20251101',
              max_tokens: 2048,
              system: fullPrompt,
              messages: anthropicMessages,
              ...(enabledTools?.length ? { tools: enabledTools } : {}),
            });

            // 8. Extract response text
            let responseText = '';
            let visualizationCommand: VisualizationCommand | undefined;
            let visualizationFeedback: VisualizationFeedback | undefined;

            for (const block of anthropicResponse.content) {
              if (block.type === 'text') {
                responseText += block.text;
              } else if (block.type === 'tool_use') {
                if (block.name === 'control_visualization') {
                  const cmd = parseVisualizationCommand(block.input, pageContext as PageContext);
                  if (cmd) {
                    visualizationCommand = cmd;
                    visualizationFeedback = { status: 'applied' };
                  } else {
                    visualizationFeedback = { status: 'rejected', reason: 'Invalid visualization command' };
                  }
                } else if (block.name === 'analyze_research_gaps') {
                  // Execute the research gap analysis
                  const input = block.input as { person_id?: string };
                  const targetPersonId = input.person_id || pageContext?.personId;
                  if (targetPersonId) {
                    try {
                      const analysis = await analyzeRecordGaps(targetPersonId, treeId);
                      const birthYear = analysis.birthYear ?? '?';
                      const deathYear = analysis.deathYear ?? '?';
                      const recordTypes = analysis.recordTypes.length > 0 ? analysis.recordTypes.join(', ') : 'none';
                      const missingTypes = analysis.missingTypes.length > 0 ? analysis.missingTypes.join(', ') : 'none';
                      const censusYears = analysis.censusYears.length > 0 ? analysis.censusYears.join(', ') : 'none';
                      const missingCensusYears = analysis.missingCensusYears.length > 0 ? analysis.missingCensusYears.join(', ') : 'none';
                      const suggestions = analysis.suggestions.map((s: string) => `- ${s}`).join('\n');

                      responseText += `\n\nRecord coverage for ${analysis.personName} (${birthYear}\u2013${deathYear}):\nRecords found: ${recordTypes}\nMissing record types: ${missingTypes}\nCensus years covered: ${censusYears}\nMissing census years: ${missingCensusYears}\n\nSuggestions:\n${suggestions}`;
                    } catch (err) {
                      console.error('[AI New Pipeline] Research gap analysis failed:', err);
                      responseText += '\n\nI encountered an error analyzing research gaps.';
                    }
                  }
                }
              }
            }

            // 8b. Handle tool_use stop reason: continue conversation to get text
            if (anthropicResponse.stop_reason === 'tool_use' && !responseText) {
              const toolUseBlock = anthropicResponse.content.find((b: { type: string }) => b.type === 'tool_use');
              if (toolUseBlock && toolUseBlock.type === 'tool_use') {
                let toolResultContent = '';

                if (toolUseBlock.name === 'analyze_research_gaps') {
                  const input = toolUseBlock.input as { person_id?: string };
                  const targetPersonId = input.person_id || pageContext?.personId;
                  if (targetPersonId) {
                    try {
                      const analysis = await analyzeRecordGaps(targetPersonId, treeId);
                      const birthYear = analysis.birthYear ?? '?';
                      const deathYear = analysis.deathYear ?? '?';
                      const recordTypes = analysis.recordTypes.length > 0 ? analysis.recordTypes.join(', ') : 'none';
                      const missingTypes = analysis.missingTypes.length > 0 ? analysis.missingTypes.join(', ') : 'none';
                      const censusYears = analysis.censusYears.length > 0 ? analysis.censusYears.join(', ') : 'none';
                      const missingCensusYears = analysis.missingCensusYears.length > 0 ? analysis.missingCensusYears.join(', ') : 'none';
                      const suggestions = analysis.suggestions.map((s: string) => `- ${s}`).join('\n');
                      toolResultContent = `Record coverage for ${analysis.personName} (${birthYear}\u2013${deathYear}):\nRecords found: ${recordTypes}\nMissing record types: ${missingTypes}\nCensus years covered: ${censusYears}\nMissing census years: ${missingCensusYears}\n\nSuggestions:\n${suggestions}`;
                    } catch (err) {
                      console.error('[AI New Pipeline] Research gap analysis failed:', err);
                      toolResultContent = 'Research gap analysis failed. The person may not exist in the database.';
                    }
                  } else {
                    toolResultContent = 'No person ID provided or available from page context.';
                  }
                } else if (toolUseBlock.name === 'control_visualization') {
                  toolResultContent = visualizationCommand
                    ? `Visualization command "${visualizationCommand.action}" has been sent to the ${visualizationCommand.target}. The user will see the results.`
                    : 'Visualization command rejected. That command is not supported on this page, or it was missing required parameters.';
                } else {
                  toolResultContent = 'Unknown tool.';
                }

                const continuedResponse = await anthropic.messages.create({
                  model: 'claude-opus-4-5-20251101',
                  max_tokens: 2048,
                  system: fullPrompt,
                  messages: [
                    ...anthropicMessages,
                    { role: 'assistant' as const, content: anthropicResponse.content },
                    {
                      role: 'user' as const,
                      content: [
                        {
                          type: 'tool_result' as const,
                          tool_use_id: toolUseBlock.id,
                          content: toolResultContent,
                        },
                      ],
                    },
                  ],
                });

                for (const block of continuedResponse.content) {
                  if (block.type === 'text') {
                    responseText += block.text;
                  }
                }
              }
            }

            if (!responseText) {
              responseText = 'I apologize, I was unable to generate a response.';
            }

            // 9. Validate response
            const validation = validateAndRepairResponse(responseText, bundle);
            const finalText = validation.text;

            // 10. Extract source people from response links (only people actually cited)
            const personLinkPattern = /\[([^\]]+)\]\(\/person\/([a-z0-9_]+)\)/g;
            const citedPeople: Array<{ id: string; name: string }> = [];
            const seenIds = new Set<string>();
            let match: RegExpExecArray | null;
            while ((match = personLinkPattern.exec(validation.text)) !== null) {
              const [, name, id] = match;
              if (!seenIds.has(id)) {
                citedPeople.push({ id, name });
                seenIds.add(id);
              }
            }

            // Also include retrieved people as candidates for dedupeSourcePeople
            const sourcePeople = dedupeSourcePeople(
              citedPeople.length > 0 ? citedPeople : bundle.people.map(p => ({ id: p.id, name: p.fullName })),
              12,
            );

            // 11. Build response metadata
            const isViewerScoped = queryPlan.searchDomain === 'viewer-ancestors';
            const hasHistoricalContext = /historical context:/i.test(finalText);

            return NextResponse.json({
              response: finalText,
              searchMethod: 'neo4j',
              sources: {
                database: 'Neo4j Graph Database',
                historicalKnowledge: hasHistoricalContext,
                intent: classifyChatIntent(message),
                viewerScoped: isViewerScoped,
                familyRecords: {
                  totalPeopleReferenced: sourcePeople.length,
                  people: sourcePeople,
                },
              },
              ...(visualizationCommand ? { visualizationCommand } : {}),
              ...(visualizationFeedback ? { visualizationFeedback } : {}),
              ...(validation.issues.length > 0 ? {
                _validationIssues: validation.issues.map(i => ({
                  type: i.type,
                  detail: i.detail,
                })),
              } : {}),
            });
          } catch (error) {
            console.error('[AI New Pipeline] Error:', error);
            // Fall through to existing pipeline on error
          }
        }
      }

      // If we get here from deterministic-fact, visualization-tool, stats,
      // or from a pipeline error fallback — continue to existing code below
    }

    const viewerScoped = shouldUseViewerScope(message, Boolean(validatedViewer?.id));
    // Exclude "first ancestor who came to America" — that's immigration, not age
    const hasImmigrationContext = /\b(came to|immigrat|emigrat|arrived|crossed|settled in|moved to|journey|voyage|ship)\b/i.test(message);
    const viewerScopedOldestQuestion = viewerScoped && isOldestAncestorQuestion(message) && !hasImmigrationContext;
    const viewerScopedEarliestWelshQuestion = viewerScoped && isEarliestWelshAncestorQuestion(message);
    // Military questions are viewer-scoped when ANY viewer is set, even without possessive words
    const viewerScopedMilitaryQuestion = Boolean(validatedViewer?.id) && isMilitaryAncestorsQuestion(message);

    // Shadow mode: log planner classification for comparison with existing system
    try {
      const dictionaries = await getGraphDictionaries();
      const queryPlan = classifyQueryPlan(
        message,
        validatedViewer ?? null,
        (pageContext as PageContext) ?? null,
        history ?? [],
        null,
        dictionaries,
      );
      if (process.env.NODE_ENV !== 'test') {
        console.log('[AI Planner Shadow]', JSON.stringify({
          message: message.slice(0, 80),
          plan: {
            answerMode: queryPlan.answerMode,
            anchorType: queryPlan.anchor.type,
            anchorConfidence: queryPlan.anchor.confidence,
            searchDomain: queryPlan.searchDomain,
            needsClarification: queryPlan.needsClarification,
          },
          existing: {
            viewerScoped,
            oldestQ: viewerScopedOldestQuestion,
            welshQ: viewerScopedEarliestWelshQuestion,
            militaryQ: viewerScopedMilitaryQuestion,
          },
        }));
      }
    } catch (err) {
      // Shadow mode: never break existing functionality
      console.error('[AI Planner Shadow] Classification error:', err);
    }

    let viewerLineageSummary: ViewerLineageSummary | null = null;
    let searchContext = '';
    if ((viewerScoped || viewerScopedMilitaryQuestion) && validatedViewer) {
      viewerLineageSummary = await buildViewerLineageContext(validatedViewer);
      searchContext = viewerLineageSummary.context;
    } else {
      const personId = pageContext?.type === 'person' ? pageContext?.personId : undefined;
      searchContext = await buildNeo4jContext(message, personId);
    }

    // Build additional context from knowledge base
    let knowledgeContext = '';
    const sourcePeopleCandidates: Array<{ id: string; name: string }> = [];
    if (viewerLineageSummary) {
      sourcePeopleCandidates.push(...viewerLineageSummary.sourcePeople);
    }

    // If on tree view with visible people, include their context
    if (pageContext?.type === 'tree' && pageContext?.visiblePersonIds?.length > 0) {
      const visibleKnowledge = await getKnowledgeForPeople(pageContext.visiblePersonIds);

      if (visibleKnowledge.size > 0) {
        knowledgeContext += `\n### People Currently Visible on Tree\n`;
        knowledgeContext += `You are looking at a family tree with ${visibleKnowledge.size} people visible.\n\n`;

        // Include brief info about visible people
        let count = 0;
        for (const [id, entry] of visibleKnowledge) {
          if (count >= 10) break; // Limit to 10 most relevant
          sourcePeopleCandidates.push({ id, name: entry.name });
          const years = entry.birthYear && entry.deathYear
            ? `(${entry.birthYear}-${entry.deathYear})`
            : entry.birthYear
              ? `(b. ${entry.birthYear})`
              : '';
          knowledgeContext += `- **[${entry.name}](/person/${id})** ${years}`;
          if (entry.birthPlace) knowledgeContext += ` - born ${entry.birthPlace}`;
          if (entry.occupations.length > 0) knowledgeContext += ` [${entry.occupations.join(', ')}]`;
          knowledgeContext += '\n';
          count++;
        }

        // If focus person, include more detail
        if (pageContext.focusPersonId) {
          const focusPerson = visibleKnowledge.get(pageContext.focusPersonId);
          if (focusPerson) {
            knowledgeContext += `\n**Focus Person: ${focusPerson.name}**\n`;
            if (focusPerson.occupations.length > 0) {
              knowledgeContext += `Occupations: ${focusPerson.occupations.join(', ')}\n`;
            }
            if (focusPerson.lifeEvents.length > 0) {
              const eventSummaries = focusPerson.lifeEvents
                .sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999))
                .slice(0, 8)
                .map(le => le.year ? `${le.year} - ${le.event}` : le.event);
              knowledgeContext += `Key Events: ${eventSummaries.join('; ')}\n`;
            }
            // Include biography excerpt if available
            if (focusPerson.biography) {
              const excerpt = focusPerson.biography.slice(0, 500);
              knowledgeContext += excerpt;
              if (focusPerson.biography.length > 500) knowledgeContext += '...';
              knowledgeContext += '\n';
            }
          }
        }
      }
    }

    // Search knowledge base for relevant entries based on user query
    const relevantEntries = (viewerScoped || viewerScopedMilitaryQuestion) && validatedViewer
      ? await searchKnowledgeBaseForViewerLineage(message, validatedViewer.id, 3)
      : await searchKnowledgeBase(message, 3);
    if (relevantEntries.length > 0) {
      knowledgeContext += `\n### Relevant People from Database\n`;
      for (const entry of relevantEntries) {
        sourcePeopleCandidates.push({ id: entry.id, name: entry.name });
        const years = entry.birthYear && entry.deathYear
          ? `(${entry.birthYear}-${entry.deathYear})`
          : entry.birthYear
            ? `(b. ${entry.birthYear})`
            : '';
        knowledgeContext += `\n**${entry.name}** ${years} (ID: ${entry.id})\n`;
        if (entry.birthPlace) knowledgeContext += `Born: ${entry.birthPlace}\n`;
        if (entry.deathPlace) knowledgeContext += `Died: ${entry.deathPlace}\n`;
        if (entry.marriagePlace || entry.marriageYear) {
          knowledgeContext += `Married: ${entry.marriagePlace || 'unknown place'}`;
          if (entry.marriageYear) knowledgeContext += ` (${entry.marriageYear})`;
          knowledgeContext += '\n';
        }
        if (entry.occupations.length > 0) {
          knowledgeContext += `Occupations: ${entry.occupations.join(', ')}\n`;
        }
        if (entry.lifeEvents.length > 0) {
          const eventSummaries = entry.lifeEvents
            .sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999))
            .slice(0, 8)
            .map(le => le.year ? `${le.year} - ${le.event}` : le.event);
          knowledgeContext += `Key Events: ${eventSummaries.join('; ')}\n`;
        }
        // Include biography if available
        if (entry.biography) {
          const excerpt = entry.biography.slice(0, 800);
          knowledgeContext += excerpt;
          if (entry.biography.length > 800) knowledgeContext += '...';
          knowledgeContext += '\n';
        }
      }
    }

    // Deterministic viewer-scoped answers for high-frequency lineage prompts
    if ((viewerScopedOldestQuestion || viewerScopedEarliestWelshQuestion || viewerScopedMilitaryQuestion) && viewerLineageSummary) {
      if (viewerScopedOldestQuestion || viewerScopedEarliestWelshQuestion) {
        const candidatePool = viewerScopedEarliestWelshQuestion
          ? viewerLineageSummary.lineagePeople.filter((person) =>
              (person.birthPlace || '').toLowerCase().includes('wales') ||
              (person.birthPlace || '').toLowerCase().includes('welsh')
            )
          : viewerLineageSummary.earliestCandidates;
        const primary = candidatePool[0] || null;
        const ambiguityGapYears = primary ? getAmbiguityGapYears(candidatePool, primary) : null;
        const confidence = primary
          ? scoreLineageClaim({
              birthYear: primary.birthYear,
              verificationStatus: primary.verificationStatus,
              generation: primary.generation,
              parentCount: primary.parentCount,
              birthPlace: primary.birthPlace,
              ambiguityGapYears,
            })
          : scoreLineageClaim({
              birthYear: null,
              verificationStatus: null,
              generation: 0,
              parentCount: 0,
              birthPlace: null,
              ambiguityGapYears: null,
            });

        const sourcePeople = dedupeSourcePeople([
          ...sourcePeopleCandidates,
          ...candidatePool.map((person) => ({ id: person.id, name: person.name })),
        ], 6);

        let response = '';
        if (!primary) {
          response = viewerScopedEarliestWelshQuestion
            ? `I couldn't find a clearly documented Welsh direct-line ancestor for ${validatedViewer?.name || 'your selected viewer'} in the current data. I kept this scoped to your lineage.`
            : `I couldn't find a direct-line ancestor with enough date data to identify the oldest person confidently. I kept this scoped to your selected lineage.`;
        } else if (confidence.passed) {
          response = viewerScopedEarliestWelshQuestion
            ? `Your earliest known Welsh direct-line ancestor is **[${primary.name}](/person/${primary.id})** (${formatCandidateYears(primary)})${
                primary.birthPlace ? ` from ${primary.birthPlace}` : ''
              }.\n\nI scoped this to your selected lineage${validatedViewer ? ` (**${validatedViewer.name}**)` : ''}, not the whole tree.`
            : `Your oldest known direct ancestor is **[${primary.name}](/person/${primary.id})** (${formatCandidateYears(primary)})${
                primary.birthPlace ? ` from ${primary.birthPlace}` : ''
              }.\n\nI scoped this to your selected lineage${validatedViewer ? ` (**${validatedViewer.name}**)` : ''}, not the whole tree.`;
        } else {
          const topCandidates = candidatePool.slice(0, 3);
          response = `${viewerScopedEarliestWelshQuestion ? 'I could not determine a single earliest Welsh ancestor with high confidence.' : 'I could not determine a single oldest ancestor with high confidence.'}\n\nTop candidates in your lineage:\n${topCandidates
            .map((person) => `- **[${person.name}](/person/${person.id})** (${formatCandidateYears(person)})${person.birthPlace ? ` — ${person.birthPlace}` : ''}`)
            .join('\n')}\n\nThis result is scoped to **${validatedViewer?.name || 'your selected viewer'}** and includes a confidence caveat.`;
        }

        const deterministicResponse: ChatApiResponse = {
          response,
          searchMethod: 'neo4j',
          sources: {
            database: 'Neo4j Graph Database',
            historicalKnowledge: false,
            intent: chatIntent,
            viewerScoped: true,
            confidence,
            familyRecords: {
              totalPeopleReferenced: viewerLineageSummary.ancestorCount,
              people: sourcePeople,
            },
          },
        };

        return NextResponse.json(deterministicResponse);
      }

      if (viewerScopedMilitaryQuestion) {
        const militaryPeople = viewerLineageSummary.militaryAncestors;
        const verifiedCount = militaryPeople.filter((person) => (person.verificationStatus || '').toUpperCase() === 'VERIFIED').length;
        const confidence = scoreMilitaryLineageClaim({
          count: militaryPeople.length,
          verifiedCount,
          withWarCount: militaryPeople.length,
        });
        const sourcePeople = dedupeSourcePeople([
          ...sourcePeopleCandidates,
          ...militaryPeople.map((person) => ({ id: person.id, name: person.name })),
        ], 6);

        let response = '';
        if (militaryPeople.length === 0) {
          response = `I could not find documented military service in your currently linked direct lineage for **${validatedViewer?.name || 'the selected viewer'}**.`;
        } else {
          const list = militaryPeople.slice(0, 8)
            .map((person) => `- **[${person.name}](/person/${person.id})** (${formatCandidateYears(person)}) — ${person.wars.join(', ')}`)
            .join('\n');
          response = `I found **${militaryPeople.length}** direct-line ancestors with documented military service for **${validatedViewer?.name || 'the selected viewer'}**:\n\n${list}\n\nThis answer is scoped to your selected lineage, not the whole tree.`;
        }

        const deterministicResponse: ChatApiResponse = {
          response,
          searchMethod: 'neo4j',
          sources: {
            database: 'Neo4j Graph Database',
            historicalKnowledge: false,
            intent: chatIntent,
            viewerScoped: true,
            confidence,
            familyRecords: {
              totalPeopleReferenced: viewerLineageSummary.ancestorCount,
              people: sourcePeople,
            },
          },
        };

        return NextResponse.json(deterministicResponse);
      }
    }

    // Get stats for system prompt from Neo4j
    const treeId = DEFAULT_TREE_ID;
    const statsResult = await executeQuery<{ totalPeople: number; verified: number }>(
      `
      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
      RETURN
        count(p) as totalPeople,
        count(CASE WHEN p.verificationStatus = 'VERIFIED' THEN 1 END) as verified
      `,
      { treeId }
    );

    const stats = {
      totalPeople: statsResult[0]?.totalPeople || 0,
      withResearch: statsResult[0]?.totalPeople || 0,
      withBiography: 0,
      verified: statsResult[0]?.verified || 0,
    };

    // Build enhanced system prompt with viewer identity
    const systemPrompt = buildSystemPrompt(pageContext as PageContext, stats, undefined, validatedViewer);
    const enabledTools = CHAT_TOOLS;

    // Fetch record evidence context if viewing a specific person
    let recordContext = '';
    if (pageContext?.type === 'person' && pageContext?.personId) {
      try {
        recordContext = await getPersonRecordContext(pageContext.personId, treeId);
      } catch (err) {
        console.error('Failed to fetch record context:', err);
      }
      // The current person on a person page is implicitly referenced by the
      // system prompt. Ensure they're available for sourcePeopleCandidates
      // if the model cites them in the response.
      if (pageContext.personName) {
        sourcePeopleCandidates.push({
          id: pageContext.personId,
          name: pageContext.personName,
        });
      }
    }

    // Combine all context
    const fullContext = `${searchContext}
${knowledgeContext}

---
Data source: Neo4j Graph Database + Knowledge Base (enriched research data)`;

    // Initialize Anthropic client
    const anthropic = new Anthropic({ apiKey: anthropicApiKey });

    // Build messages
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    // Add conversation history if provided
    if (history && Array.isArray(history)) {
      for (const msg of history.slice(-6)) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          messages.push({ role: msg.role, content: msg.content });
        }
      }
    }

    // Add current message with context
    messages.push({
      role: 'user',
      content: `${message}

---
[Inferred chat intent: ${chatIntent}]
Use this as routing guidance only and still answer directly.

[Source expectations]
- Distinguish family records from general historical context.
- Prefer documented family records for ancestor-specific facts.

[Context from family tree database:]
${fullContext}${recordContext ? `\n[Source record evidence for this person:]\n${recordContext}` : ''}`,
    });

    // Call Claude Opus with tools
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-5-20251101',
      max_tokens: 2048,
      system: systemPrompt,
      tools: enabledTools,
      messages,
    });

    // Process response - handle tool use
    let responseText = '';
    let visualizationCommand: VisualizationCommand | null = null;
    let visualizationToolAttempted = false;
    const visualizationRejectedReason =
      'That command is not supported on this page, or it was missing required parameters.';

    for (const block of response.content) {
      if (block.type === 'text') {
        responseText += block.text;
      } else if (block.type === 'tool_use') {
        if (block.name === 'control_visualization') {
          visualizationToolAttempted = true;
          visualizationCommand = parseVisualizationCommand(block.input, pageContext as PageContext | undefined);
        }
      }
    }

    // If we got a tool use, we need to continue the conversation to get the text response
    if (response.stop_reason === 'tool_use' && !responseText) {
      const toolUseBlock = response.content.find((b: { type: string }) => b.type === 'tool_use');
      if (toolUseBlock && toolUseBlock.type === 'tool_use') {
        let toolResultContent = '';

        if (toolUseBlock.name === 'analyze_research_gaps') {
          // Execute the research gap analysis
          const input = toolUseBlock.input as { person_id?: string };
          const targetPersonId = input.person_id || pageContext?.personId;
          if (targetPersonId) {
            try {
              const analysis = await analyzeRecordGaps(targetPersonId, treeId);
              const birthYear = analysis.birthYear ?? '?';
              const deathYear = analysis.deathYear ?? '?';
              const recordTypes = analysis.recordTypes.length > 0 ? analysis.recordTypes.join(', ') : 'none';
              const missingTypes = analysis.missingTypes.length > 0 ? analysis.missingTypes.join(', ') : 'none';
              const censusYears = analysis.censusYears.length > 0 ? analysis.censusYears.join(', ') : 'none';
              const missingCensusYears = analysis.missingCensusYears.length > 0 ? analysis.missingCensusYears.join(', ') : 'none';
              const suggestions = analysis.suggestions.map(s => `- ${s}`).join('\n');

              toolResultContent = `Record coverage for ${analysis.personName} (${birthYear}–${deathYear}):
Records found: ${recordTypes}
Missing record types: ${missingTypes}
Census years covered: ${censusYears}
Missing census years: ${missingCensusYears}

Suggestions:
${suggestions}`;
            } catch (err) {
              console.error('Research gap analysis failed:', err);
              toolResultContent = 'Research gap analysis failed. The person may not exist in the database.';
            }
          } else {
            toolResultContent = 'No person ID provided or available from page context.';
          }
        } else if (toolUseBlock.name === 'control_visualization') {
          toolResultContent = visualizationCommand
            ? `Visualization command "${visualizationCommand.action}" has been sent to the ${visualizationCommand.target}. The user will see the results.`
            : `Visualization command rejected. ${visualizationRejectedReason}`;
        } else {
          toolResultContent = 'Unknown tool.';
        }

        const continuedResponse = await anthropic.messages.create({
          model: 'claude-opus-4-5-20251101',
          max_tokens: 2048,
          system: systemPrompt,
          messages: [
            ...messages,
            { role: 'assistant', content: response.content },
            {
              role: 'user',
              content: [
                {
                  type: 'tool_result',
                  tool_use_id: toolUseBlock.id,
                  content: toolResultContent,
                },
              ],
            },
          ],
        });

        // Extract text from continued response
        for (const block of continuedResponse.content) {
          if (block.type === 'text') {
            responseText += block.text;
          }
        }
      }
    }

    if (!responseText) {
      responseText = 'I apologize, I was unable to generate a response.';
    }

    // Extract every /person/X link from the response and ensure all of them
    // appear in sourcePeopleCandidates. This keeps the "People referenced"
    // list in the UI in sync with the actual links in the response markdown.
    // Names are looked up from (1) already-fetched candidates, (2) viewer
    // lineage data, and (3) any [Name](/person/id) markdown in the context.
    const namesById = new Map<string, string>();
    for (const candidate of sourcePeopleCandidates) {
      if (candidate.id && candidate.name) namesById.set(candidate.id, candidate.name);
    }
    if (viewerLineageSummary) {
      for (const person of viewerLineageSummary.lineagePeople) {
        if (person.id && person.name && !namesById.has(person.id)) {
          namesById.set(person.id, person.name);
        }
      }
    }
    // Scan searchContext + knowledgeContext for [Name](/person/id) entries
    // so we can resolve names for IDs injected via buildNeo4jContext's
    // military/longevity/welsh sections that aren't yet in candidates.
    const contextLinkRegex = /\[([^\]]+)\]\(\/person\/([a-z0-9_-]+)\)/gi;
    let contextMatch: RegExpExecArray | null;
    const combinedContext = `${searchContext}\n${knowledgeContext}`;
    while ((contextMatch = contextLinkRegex.exec(combinedContext)) !== null) {
      const name = contextMatch[1];
      const id = contextMatch[2];
      if (!namesById.has(id)) namesById.set(id, name);
    }

    const responseLinkRegex = /\/person\/([a-z0-9_-]+)/gi;
    let linkMatch: RegExpExecArray | null;
    const existingIds = new Set(sourcePeopleCandidates.map((p) => p.id));
    while ((linkMatch = responseLinkRegex.exec(responseText)) !== null) {
      const linkedId = linkMatch[1];
      if (existingIds.has(linkedId)) continue;
      const linkedName = namesById.get(linkedId);
      if (linkedName) {
        sourcePeopleCandidates.push({ id: linkedId, name: linkedName });
        existingIds.add(linkedId);
      }
    }

    // Build response
    // Cap at 12 to keep the UI citation list readable while still covering
    // typical multi-person responses without dropping cited people.
    const sourcePeople = dedupeSourcePeople(sourcePeopleCandidates, 12);
    const apiResponse: ChatApiResponse = {
      response: responseText,
      searchMethod: 'neo4j',
      sources: {
        database: 'Neo4j Graph Database',
        historicalKnowledge: inferHistoricalContextUsage(message, responseText),
        intent: chatIntent,
        viewerScoped,
        familyRecords: {
          totalPeopleReferenced: sourcePeopleCandidates.length,
          people: sourcePeople,
        },
      },
    };

    // Include visualization command if present
    if (visualizationCommand) {
      apiResponse.visualizationCommand = visualizationCommand;
      apiResponse.visualizationFeedback = { status: 'applied' };
    } else if (visualizationToolAttempted) {
      apiResponse.visualizationFeedback = {
        status: 'rejected',
        reason: visualizationRejectedReason,
      };
    }

    return NextResponse.json(apiResponse);

  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json({
      error: 'Failed to process chat request',
      response: 'I apologize, but I encountered an error. Please try again.',
    }, { status: 500 });
  }
}
