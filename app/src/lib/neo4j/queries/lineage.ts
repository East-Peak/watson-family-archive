import { executeQuery } from '../client';
import type { KnowledgeBaseEntry } from './chatContext';
import { MAX_ANCESTRY_DEPTH } from '../constants';

export interface ViewerIdentity {
  id: string;
  name: string;
  familyBranch?: string;
}

export interface ViewerLineagePerson {
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

export interface ViewerLineageSummary {
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

export async function searchKnowledgeBaseForViewerLineage(
  query: string,
  viewerId: string,
  treeId: string,
  topK: number = 5,
): Promise<KnowledgeBaseEntry[]> {
  const safeTopK = Math.max(1, Math.floor(topK));
  const queryLower = query.toLowerCase();
  const queryWords = queryLower
    .split(/\s+/)
    .filter(
      (w) =>
        w.length > 2 &&
        ![
          'the',
          'and',
          'for',
          'are',
          'was',
          'were',
          'what',
          'who',
          'how',
          'when',
          'where',
          'why',
          'about',
          'tell',
          'know',
          'my',
        ].includes(w),
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
    MATCH path = (root)-[:CHILD_OF*0..${MAX_ANCESTRY_DEPTH}]->(p:Person)
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
    { treeId, viewerId, term: queryWords[0], topK: safeTopK },
  );

  return result.map((r) => ({
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
    lifeEvents: (r.lifeEvents || []).filter((le) => le && le.event),
  }));
}

export async function buildViewerLineageContext(
  viewer: ViewerIdentity,
  treeId: string,
): Promise<ViewerLineageSummary> {
  const statsResult = await executeQuery<{
    ancestorCount: number;
    earliestBirth: number | null;
    latestBirth: number | null;
  }>(
    `
    MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(root:Person {id: $viewerId})
    MATCH path = (root)-[:CHILD_OF*0..${MAX_ANCESTRY_DEPTH}]->(ancestor:Person)
    WITH DISTINCT ancestor
    RETURN
      count(ancestor) as ancestorCount,
      min(ancestor.birthYear) as earliestBirth,
      max(ancestor.birthYear) as latestBirth
    `,
    { treeId, viewerId: viewer.id },
  );

  const lineagePeople = await executeQuery<ViewerLineagePerson>(
    `
    MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(root:Person {id: $viewerId})
    MATCH path = (root)-[:CHILD_OF*0..${MAX_ANCESTRY_DEPTH}]->(ancestor:Person)
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
    { treeId, viewerId: viewer.id },
  );

  const stats = statsResult[0] || {
    ancestorCount: 0,
    earliestBirth: null,
    latestBirth: null,
  };
  const oldestAncestor = lineagePeople[0] || null;
  const earliestAncestors = lineagePeople.slice(0, 6);
  const militaryAncestors = lineagePeople
    .filter((person) => person.wars && person.wars.length > 0)
    .slice(0, 12);

  let context = `## Viewer-Scoped Lineage Context\n\n`;
  context += `Viewer: [${viewer.name}](/person/${viewer.id})\n`;
  context += `- Scope: direct lineage only (viewer and ancestors)\n`;
  context += `- Lineage records found: ${stats.ancestorCount}\n`;
  context += `- Birth-year span in lineage: ${stats.earliestBirth ?? '?'} - ${stats.latestBirth ?? '?'}\n`;

  if (oldestAncestor) {
    const years =
      oldestAncestor.birthYear && oldestAncestor.deathYear
        ? `(${oldestAncestor.birthYear}-${oldestAncestor.deathYear})`
        : oldestAncestor.birthYear
          ? `(b. ${oldestAncestor.birthYear})`
          : '';
    context += `- Oldest known direct ancestor: [${oldestAncestor.name}](/person/${oldestAncestor.id}) ${years}\n`;
  }

  if (earliestAncestors.length > 0) {
    context += `\n### Earliest Known Ancestors in Viewer Line\n`;
    for (const ancestor of earliestAncestors) {
      const years =
        ancestor.birthYear && ancestor.deathYear
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
    sourcePeople: earliestAncestors.map((person) => ({
      id: person.id,
      name: person.name,
    })),
  };
}

export function getAmbiguityGapYears(
  candidates: ViewerLineagePerson[],
  primary: ViewerLineagePerson,
): number | null {
  const comparable = candidates
    .filter((person) => person.id !== primary.id && person.birthYear != null)
    .map((person) => person.birthYear as number)
    .sort((a, b) => a - b);
  if (primary.birthYear == null || comparable.length === 0) return null;
  return Math.abs(comparable[0] - primary.birthYear);
}

export function formatCandidateYears(person: ViewerLineagePerson): string {
  if (person.birthYear && person.deathYear)
    return `${person.birthYear}-${person.deathYear}`;
  if (person.birthYear) return `b. ${person.birthYear}`;
  return 'dates unknown';
}
