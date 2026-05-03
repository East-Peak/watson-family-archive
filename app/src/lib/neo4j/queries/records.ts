import { executeQuery } from '../client';
import { siteConfig } from '@/lib/siteConfig';
import type { SearchRecordResult } from '@/types/person';

const DEFAULT_TREE_ID = siteConfig.defaultTreeId;

export interface RecordNodeResult {
  record: {
    id: string;
    ark: string | null;
    type: string;
    provider: string;
    evidenceClass: string | null;
    collection: string;
    year: number | null;
    country: string | null;
    tier: string | null;
    place: string | null;
  };
  rel: {
    role: string | null;
    age: number | null;
    occupation: string | null;
    birthplace: string | null;
  };
  participants: Array<{
    name: string;
    role: string | null;
    age: number | null;
    occupation: string | null;
    birthplace: string | null;
  }>;
}

function parseParticipantsJson(raw: string | null): RecordNodeResult['participants'] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return parsed.map((p: Record<string, unknown>) => ({
      name: (p.name as string) || '',
      role: (p.role as string) || null,
      age: p.age != null ? Number(p.age) : null,
      occupation: (p.occupation as string) || null,
      birthplace: (p.birthplace as string) || null,
    }));
  } catch { return []; }
}

export async function getPersonRecords(
  personId: string,
  treeId: string = DEFAULT_TREE_ID
): Promise<RecordNodeResult[]> {
  const raw = await executeQuery<{
    record: RecordNodeResult['record'];
    rel: RecordNodeResult['rel'];
    rawParticipants: string | null;
  }>(
    `
    MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person {id: $personId})-[e:EVIDENCED_BY]->(r:Record)
    RETURN
      r {.id, .ark, .type, .provider, .evidenceClass, .collection, .year, .country, .tier, .place} AS record,
      e {.role, .age, .occupation, .birthplace} AS rel,
      r.participants AS rawParticipants
    ORDER BY r.year
    `,
    { personId, treeId }
  );

  return raw.map((row) => ({
    record: row.record,
    rel: row.rel,
    participants: parseParticipantsJson(row.rawParticipants),
  }));
}

/**
 * Fetch Record nodes by their IDs directly (no EVIDENCED_BY needed).
 * Reads participants from the r.participants JSON property stored during rebuild.
 * Fallback for when person sources have record_id but no edges exist yet.
 */
export async function getRecordsByIds(
  recordIds: string[]
): Promise<RecordNodeResult[]> {
  if (recordIds.length === 0) return [];
  const raw = await executeQuery<{
    record: RecordNodeResult['record'];
    rel: RecordNodeResult['rel'];
    rawParticipants: string | null;
  }>(
    `
    UNWIND $recordIds AS rid
    MATCH (r:Record {id: rid})
    RETURN
      r {.id, .ark, .type, .provider, .evidenceClass, .collection, .year, .country, .tier, .place} AS record,
      {role: null, age: null, occupation: null, birthplace: null} AS rel,
      r.participants AS rawParticipants
    ORDER BY r.year
    `,
    { recordIds }
  );

  return raw.map((row) => ({
    record: row.record,
    rel: row.rel,
    participants: parseParticipantsJson(row.rawParticipants),
  }));
}

export async function getPersonRecordCounts(
  personId: string,
  treeId: string = DEFAULT_TREE_ID
): Promise<Record<string, number>> {
  const rows = await executeQuery<{ type: string; count: number }>(
    `
    MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person {id: $personId})-[:EVIDENCED_BY]->(r:Record)
    RETURN r.type AS type, count(r) AS count
    `,
    { personId, treeId }
  );
  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.type] = Number(row.count);
  }
  return counts;
}

export async function getRecordStats(
  treeId: string = DEFAULT_TREE_ID
): Promise<{
  totalRecords: number;
  byType: Record<string, number>;
  byTier: Record<string, number>;
}> {
  const rows = await executeQuery<{ type: string; tier: string; count: number }>(
    `
    MATCH (r:Record)
    RETURN r.type AS type, r.tier AS tier, count(r) AS count
    `,
    { treeId }
  );

  let totalRecords = 0;
  const byType: Record<string, number> = {};
  const byTier: Record<string, number> = {};

  for (const row of rows) {
    const count = Number(row.count);
    totalRecords += count;
    byType[row.type] = (byType[row.type] || 0) + count;
    byTier[row.tier] = (byTier[row.tier] || 0) + count;
  }

  return { totalRecords, byType, byTier };
}

export async function searchRecords(
  query: string,
  treeId: string,
  limit: number = 20
): Promise<SearchRecordResult[]> {
  const queryLower = query.toLowerCase().trim();
  if (!queryLower || queryLower.length < 2) return [];

  const cypher = `
    MATCH (r:Record)
    WHERE toLower(r.collection) CONTAINS $queryLower
       OR toLower(r.place) CONTAINS $queryLower
       OR toLower(r.participants) CONTAINS $queryLower
    OPTIONAL MATCH (:Tree {id: $treeId})-[:CONTAINS]->(p:Person)-[:EVIDENCED_BY]->(r)
    WITH r, count(DISTINCT p) AS linkedCount
    RETURN
      r.id AS id,
      r.ark AS ark,
      r.type AS type,
      r.collection AS collection,
      r.year AS year,
      r.place AS place,
      r.tier AS tier,
      r.participants AS rawParticipants,
      linkedCount
    ORDER BY
      CASE WHEN toLower(r.collection) CONTAINS $queryLower THEN 0
           WHEN toLower(r.place) CONTAINS $queryLower THEN 1
           ELSE 2 END,
      r.year
    LIMIT toInteger($limit)
  `;

  const rows = await executeQuery<{
    id: string;
    ark: string | null;
    type: string;
    collection: string;
    year: number | null;
    place: string | null;
    tier: string | null;
    rawParticipants: string | null;
    linkedCount: number;
  }>(cypher, { queryLower, treeId, limit });

  return rows.map((row) => {
    const participants = parseParticipantsJson(row.rawParticipants);
    const matchedParticipant = participants.find(
      (p) => p.name && p.name.toLowerCase().includes(queryLower)
    );
    return {
      id: row.id,
      ark: row.ark,
      type: row.type,
      collection: row.collection,
      year: row.year,
      place: row.place,
      tier: row.tier,
      matchedParticipant: matchedParticipant?.name ?? null,
      participantCount: participants.length,
      linkedPersonCount: row.linkedCount,
    };
  });
}

/**
 * Build a compact text context of a person's linked records for LLM consumption.
 * Returns a structured summary that fits within ~2000 tokens.
 */
export async function getPersonRecordContext(
  personId: string,
  treeId: string
): Promise<string> {
  const records = await getPersonRecords(personId, treeId);
  if (records.length === 0) return '';

  const lines: string[] = [`## Source Records (${records.length} records)`];

  for (const r of records) {
    const rec = r.record;
    const rel = r.rel;
    const participants = r.participants || [];

    lines.push(`\n### ${rec.type.toUpperCase()} — ${rec.collection || 'Unknown Collection'} (${rec.year || '?'})`);
    if (rec.place) lines.push(`Place: ${rec.place}`);
    if (rec.tier) lines.push(`Evidence Tier: ${rec.tier}`);
    if (rel.role) lines.push(`This person's role: ${rel.role}`);
    if (rel.age) lines.push(`Age on record: ${rel.age}`);
    if (rel.occupation) lines.push(`Occupation: ${rel.occupation}`);
    if (rel.birthplace) lines.push(`Birthplace: ${rel.birthplace}`);

    if (participants.length > 1) {
      lines.push(`Household/participants (${participants.length}):`);
      for (const p of participants.slice(0, 15)) {
        const parts = [p.name || '?'];
        if (p.role) parts.push(p.role);
        if (p.age) parts.push(`age ${p.age}`);
        if (p.occupation) parts.push(p.occupation);
        if (p.birthplace) parts.push(`b. ${p.birthplace}`);
        lines.push(`  - ${parts.join(', ')}`);
      }
      if (participants.length > 15) {
        lines.push(`  ... and ${participants.length - 15} more`);
      }
    }

    if (rec.ark) lines.push(`ARK: ${rec.ark}`);
  }

  return lines.join('\n');
}
