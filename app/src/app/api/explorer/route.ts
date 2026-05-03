import { NextResponse } from 'next/server';
import { executeQuery } from '@/lib/neo4j/client';
import { siteConfig } from '@/lib/siteConfig';

const DEFAULT_TREE_ID = siteConfig.defaultTreeId;

interface Neo4jExplorerRow {
  p: {
    id: string;
    fullName: string;
    givenName: string;
    surname: string;
    maidenName: string | null;
    sex: string;
    birthYear: number | null;
    birthPlace: string | null;
    deathYear: number | null;
    deathPlace: string | null;
    originCountry: string | null;
    completenessScore: number | null;
    researchScore: number | null;
    sources: string | null;
    validationStatus: string | null;
    completeness_tier: string | null;
    status: string | null;
    familysearchTreeId: string | null;
    wikitreeId: string | null;
    findagraveId: string | null;
  };
  recordTypes: string[];
}

function countSources(sourcesJson: string | null): number {
  if (!sourcesJson) return 0;
  try {
    const parsed = JSON.parse(sourcesJson);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

export async function GET() {
  try {
    const rows = await executeQuery<Neo4jExplorerRow>(
      `
      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
      OPTIONAL MATCH (p)-[:EVIDENCED_BY]->(r:Record)
      WITH p, collect(r.type) AS recordTypes
      RETURN p {
        .id, .fullName, .givenName, .surname, .maidenName, .sex,
        .birthYear, .birthPlace, .deathYear, .deathPlace, .originCountry,
        .completenessScore, .researchScore, .sources,
        .validationStatus, .completeness_tier, .status,
        .familysearchTreeId, .wikitreeId, .findagraveId
      }, recordTypes
      ORDER BY p.fullName
      `,
      { treeId: DEFAULT_TREE_ID }
    );

    const people = rows.map((row) => {
      const p = row.p;
      return {
        id: p.id || '',
        fullName: p.fullName || '',
        givenName: p.givenName || '',
        surname: p.surname || '',
        maidenName: p.maidenName || null,
        sex: p.sex || '',
        birthYear: typeof p.birthYear === 'number' ? p.birthYear : null,
        birthPlace: p.birthPlace || null,
        deathYear: typeof p.deathYear === 'number' ? p.deathYear : null,
        deathPlace: p.deathPlace || null,
        originCountry: p.originCountry || null,
        completenessScore: typeof p.completenessScore === 'number' ? p.completenessScore : 0,
        researchScore: typeof p.researchScore === 'number' ? p.researchScore : 0,
        sourceCount: countSources(p.sources),
        validationStatus: p.validationStatus || 'pass',
        completeness_tier: p.completeness_tier || '',
        status: p.status || '',
        familysearchTreeId: p.familysearchTreeId || null,
        wikitreeId: p.wikitreeId || null,
        findagraveId: p.findagraveId || null,
        recordCounts: (() => {
          const counts: Record<string, number> = {};
          for (const t of row.recordTypes || []) {
            if (t) counts[t] = (counts[t] || 0) + 1;
          }
          return Object.keys(counts).length > 0 ? counts : undefined;
        })(),
      };
    });

    return NextResponse.json(people);
  } catch (error) {
    console.error('Explorer API error:', error);
    return NextResponse.json({ error: 'Failed to load explorer data' }, { status: 500 });
  }
}
