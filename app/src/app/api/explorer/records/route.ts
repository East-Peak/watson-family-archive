import { NextResponse } from 'next/server';
import { executeQuery } from '@/lib/neo4j/client';
import { siteConfig } from '@/lib/siteConfig';
import { cacheGraphRead } from '@/lib/cache/graphCache';

const DEFAULT_TREE_ID = siteConfig.defaultTreeId;

interface Participant {
  name: string;
  role: string | null;
  age: string | null;
  occupation: string | null;
  birthplace: string | null;
  matchedSlug: string | null;
}

interface LinkedPerson {
  id: string;
  slug: string;
  name: string;
  role: string;
}

interface Neo4jRecordRow {
  r: {
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
    participants: string | null;
  };
  linkedPeople: Array<LinkedPerson | null>;
}

function parseParticipantsJson(raw: string | null): Participant[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((p: Record<string, unknown>) => ({
      name: (p.name as string) || '',
      role: (p.role as string) || null,
      age: p.age != null ? String(p.age) : null,
      occupation: (p.occupation as string) || null,
      birthplace: (p.birthplace as string) || null,
      matchedSlug:
        (p.matched_slug as string) || (p.matchedSlug as string) || null,
    }));
  } catch {
    return [];
  }
}

// Whole-tree record inventory — identical for every authed user and
// rebuildable, so the Neo4j read is cached (shared Redis graph cache).
const getExplorerRecords = cacheGraphRead(
  (treeId: string) =>
    executeQuery<Neo4jRecordRow>(
      `
      MATCH (r:Record)
      OPTIONAL MATCH (:Tree {id: $treeId})-[:CONTAINS]->(p:Person)-[e:EVIDENCED_BY]->(r)
      WITH r, collect(DISTINCT CASE WHEN p IS NOT NULL THEN {id: p.id, slug: p.slug, name: coalesce(p.fullName, p.id), role: e.role} END) AS linkedPeople
      RETURN r, linkedPeople
      ORDER BY r.year
      `,
      { treeId },
    ),
  ['explorer-records'],
);

export async function GET() {
  try {
    const rows = await getExplorerRecords(DEFAULT_TREE_ID);

    const records = rows.map((row) => {
      const r = row.r;
      const participants = parseParticipantsJson(r.participants);
      // Filter out nulls from CASE WHEN (unmatched optional matches produce null entries)
      const linkedPeople = (row.linkedPeople || []).filter(
        (lp): lp is LinkedPerson => lp !== null,
      );

      // Derive primary participant from the first participant entry
      const primaryParticipant =
        participants.length > 0 ? participants[0].name : null;

      return {
        id: r.id || '',
        ark: r.ark || null,
        type: r.type || '',
        provider: r.provider || '',
        evidenceClass: r.evidenceClass || null,
        collection: r.collection || '',
        year: typeof r.year === 'number' ? r.year : null,
        country: r.country || null,
        tier: r.tier || null,
        place: r.place || null,
        participantCount: participants.length,
        primaryParticipant,
        linkedPeople,
        participants,
      };
    });

    return NextResponse.json(records);
  } catch (error) {
    console.error('Explorer Records API error:', error);
    return NextResponse.json(
      { error: 'Failed to load explorer records data' },
      { status: 500 },
    );
  }
}
