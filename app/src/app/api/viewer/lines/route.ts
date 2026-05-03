import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/neo4j/client';
import { siteConfig } from '@/lib/siteConfig';

const DEFAULT_TREE_ID = siteConfig.defaultTreeId;

interface AncestorLine {
  surname: string;
  count: number;
  earliest?: number;
  latest?: number;
  samplePeople: { id: string; fullName: string; birthYear?: number }[];
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const personId = searchParams.get('personId');
    const treeId = searchParams.get('treeId') || DEFAULT_TREE_ID;
    const rawLimit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 8;
    const rawMinCount = searchParams.get('minCount') ? parseInt(searchParams.get('minCount')!, 10) : 2;
    const limit = Number.isFinite(rawLimit) && rawLimit >= 0 ? rawLimit : 8;
    const minCount = Number.isFinite(rawMinCount) && rawMinCount >= 0 ? rawMinCount : 2;

    if (personId) {
      // Walk up the ancestor graph from this person and group by surname
      const results = await executeQuery<{
        id: string;
        fullName: string;
        surname: string;
        birthYear: number | null;
      }>(
        `
        MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(root:Person {id: $personId})
        MATCH path = (root)-[:CHILD_OF*0..20]->(ancestor:Person)
        WHERE ancestor.surname IS NOT NULL AND ancestor.surname <> ''
        RETURN DISTINCT ancestor.id as id, ancestor.fullName as fullName,
               ancestor.surname as surname, ancestor.birthYear as birthYear
        ORDER BY ancestor.surname, ancestor.birthYear
        `,
        { treeId, personId }
      );

      const lineMap = new Map<string, AncestorLine>();

      for (const row of results) {
        const surname = row.surname;
        if (!lineMap.has(surname)) {
          lineMap.set(surname, { surname, count: 0, samplePeople: [] });
        }
        const line = lineMap.get(surname)!;
        line.count++;
        if (row.birthYear) {
          if (!line.earliest || row.birthYear < line.earliest) line.earliest = row.birthYear;
          if (!line.latest || row.birthYear > line.latest) line.latest = row.birthYear;
        }
        if (line.samplePeople.length < 3) {
          line.samplePeople.push({
            id: row.id,
            fullName: row.fullName,
            birthYear: row.birthYear ?? undefined,
          });
        }
      }

      const lines = Array.from(lineMap.values())
        .filter(l => l.count >= minCount)
        .sort((a, b) => b.count - a.count)
        .slice(0, limit > 0 ? limit : undefined);

      return NextResponse.json({ personId, lines });
    }

    // Fallback: top surnames in the entire tree
    const results = await executeQuery<{ surname: string; count: number; earliest: number | null; latest: number | null }>(
      `
      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
      WHERE p.surname IS NOT NULL AND p.surname <> ''
      WITH p.surname as surname, count(p) as count,
           min(p.birthYear) as earliest, max(p.birthYear) as latest
      WHERE count >= toInteger($minCount)
      RETURN surname, count, earliest, latest
      ORDER BY count DESC
      ${limit > 0 ? 'LIMIT toInteger($limit)' : ''}
      `,
      { treeId, minCount, ...(limit > 0 ? { limit } : {}) }
    );

    const lines: AncestorLine[] = results.map(r => ({
      surname: r.surname,
      count: r.count,
      earliest: r.earliest ?? undefined,
      latest: r.latest ?? undefined,
      samplePeople: [],
    }));

    return NextResponse.json({ personId: null, lines });
  } catch (error) {
    console.error('Error fetching viewer lines:', error);
    return NextResponse.json({ error: 'Failed to fetch lines' }, { status: 500 });
  }
}
