import { executeQuery } from '@/lib/neo4j/client';
import { siteConfig } from '@/lib/siteConfig';
import type { QueryPlan } from './types';

const DEFAULT_TREE_ID = siteConfig.defaultTreeId;

interface RelationshipResult {
  response: string; // markdown with /person/ID links
  people: Array<{ id: string; name: string }>;
}

export async function handleRelationshipQuery(
  plan: QueryPlan,
  viewerId: string,
  treeId: string = DEFAULT_TREE_ID,
  subjectId?: string,
): Promise<RelationshipResult | null> {
  // Use the explicit subject if provided (e.g. "who is John's father"),
  // otherwise default to the viewer (e.g. "who is my father").
  const anchorId = subjectId || viewerId;
  // Extract relationship from plan constraints or terms
  const relationship = extractRelationship(plan);
  if (!relationship) return null;

  switch (relationship) {
    case 'father':
    case 'mother': {
      const parentSex = relationship === 'father' ? 'M' : 'F';
      const results = await executeQuery<{
        id: string;
        name: string;
        birthYear: number | null;
        deathYear: number | null;
        birthPlace: string | null;
      }>(
        `MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(child:Person {id: $anchorId})
         MATCH (child)-[:CHILD_OF]->(parent:Person)
         WHERE parent.sex = $parentSex
         RETURN parent.id as id, parent.fullName as name, parent.birthYear as birthYear, parent.deathYear as deathYear, parent.birthPlace as birthPlace
         LIMIT toInteger(1)`,
        { treeId, anchorId, parentSex },
      );
      if (results.length === 0) {
        return {
          response: `I don't have a ${relationship} recorded for you in the family tree data.`,
          people: [],
        };
      }
      const p = results[0];
      const dates =
        p.birthYear && p.deathYear
          ? ` (${p.birthYear}–${p.deathYear})`
          : p.birthYear
            ? ` (b. ${p.birthYear})`
            : '';
      const place = p.birthPlace ? `, born in ${p.birthPlace}` : '';
      return {
        response: `Your ${relationship} is [${p.name}](/person/${p.id})${dates}${place}.`,
        people: [{ id: p.id, name: p.name }],
      };
    }

    case 'parents': {
      const results = await executeQuery<{
        id: string;
        name: string;
        sex: string;
        birthYear: number | null;
        deathYear: number | null;
      }>(
        `MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(child:Person {id: $anchorId})
         MATCH (child)-[:CHILD_OF]->(parent:Person)
         RETURN parent.id as id, parent.fullName as name, parent.sex as sex, parent.birthYear as birthYear, parent.deathYear as deathYear`,
        { treeId, anchorId },
      );
      if (results.length === 0) {
        return {
          response: `I don't have parents recorded for you in the family tree data.`,
          people: [],
        };
      }
      const lines = results.map((p) => {
        const role =
          p.sex === 'M' ? 'Father' : p.sex === 'F' ? 'Mother' : 'Parent';
        const dates =
          p.birthYear && p.deathYear ? ` (${p.birthYear}–${p.deathYear})` : '';
        return `- **${role}:** [${p.name}](/person/${p.id})${dates}`;
      });
      return {
        response: `Your parents:\n\n${lines.join('\n')}`,
        people: results.map((p) => ({ id: p.id, name: p.name })),
      };
    }

    case 'spouse': {
      const results = await executeQuery<{
        id: string;
        name: string;
        birthYear: number | null;
        deathYear: number | null;
      }>(
        `MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(person:Person {id: $anchorId})
         MATCH (person)-[:SPOUSE_OF]-(spouse:Person)
         RETURN spouse.id as id, spouse.fullName as name, spouse.birthYear as birthYear, spouse.deathYear as deathYear`,
        { treeId, anchorId },
      );
      if (results.length === 0) {
        return {
          response: `I don't have a spouse recorded for you in the family tree data.`,
          people: [],
        };
      }
      if (results.length === 1) {
        const s = results[0];
        const dates =
          s.birthYear && s.deathYear ? ` (${s.birthYear}–${s.deathYear})` : '';
        return {
          response: `Your spouse is [${s.name}](/person/${s.id})${dates}.`,
          people: [{ id: s.id, name: s.name }],
        };
      }
      const lines = results.map((s) => {
        const dates =
          s.birthYear && s.deathYear ? ` (${s.birthYear}–${s.deathYear})` : '';
        return `- [${s.name}](/person/${s.id})${dates}`;
      });
      return {
        response: `Your spouses:\n\n${lines.join('\n')}`,
        people: results.map((s) => ({ id: s.id, name: s.name })),
      };
    }

    case 'children': {
      const results = await executeQuery<{
        id: string;
        name: string;
        birthYear: number | null;
        deathYear: number | null;
      }>(
        `MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(parent:Person {id: $anchorId})
         MATCH (child:Person)-[:CHILD_OF]->(parent)
         RETURN child.id as id, child.fullName as name, child.birthYear as birthYear, child.deathYear as deathYear
         ORDER BY child.birthYear ASC`,
        { treeId, anchorId },
      );
      if (results.length === 0) {
        return {
          response: `I don't have children recorded for you in the family tree data.`,
          people: [],
        };
      }
      const lines = results.map((c) => {
        const dates =
          c.birthYear && c.deathYear
            ? ` (${c.birthYear}–${c.deathYear})`
            : c.birthYear
              ? ` (b. ${c.birthYear})`
              : '';
        return `- [${c.name}](/person/${c.id})${dates}`;
      });
      return {
        response: `Your children (${results.length}):\n\n${lines.join('\n')}`,
        people: results.map((c) => ({ id: c.id, name: c.name })),
      };
    }

    default:
      return null;
  }
}

function extractRelationship(plan: QueryPlan): string | null {
  // Only direct (1-hop) relationships are handled deterministically.
  // Multi-hop terms (grandmother, grandfather, great-uncle, cousin) are
  // intentionally excluded because they're ambiguous (maternal vs. paternal)
  // and should go through retrieval-qa with a clarification prompt instead.
  // Check constraints for relationship terms
  const relTerms = [
    'father',
    'mother',
    'parents',
    'spouse',
    'husband',
    'wife',
    'children',
    'child',
    'son',
    'daughter',
  ];
  for (const constraint of plan.constraints) {
    const lower = constraint.toLowerCase();
    if (relTerms.includes(lower)) {
      // Normalize
      if (lower === 'husband' || lower === 'wife') return 'spouse';
      if (lower === 'son' || lower === 'daughter' || lower === 'child')
        return 'children';
      return lower;
    }
  }
  // Also check the retrievalSpec for relationship terms
  if (plan.retrievalSpec) {
    for (const filter of [
      ...plan.retrievalSpec.hardFilters,
      ...plan.retrievalSpec.softBoosts,
    ]) {
      if (filter.type === 'lifeEventType' && typeof filter.value === 'string') {
        const val = filter.value.toLowerCase();
        if (relTerms.includes(val)) return val;
      }
    }
  }
  return null;
}
