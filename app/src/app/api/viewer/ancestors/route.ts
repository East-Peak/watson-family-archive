import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/neo4j/client';
import { siteConfig } from '@/lib/siteConfig';
import { COUNTRY_PATTERNS } from '@/lib/collections';

const DEFAULT_TREE_ID = siteConfig.defaultTreeId;

function extractCountry(birthPlace: string | null): string | null {
  if (!birthPlace) return null;
  for (const [key, config] of Object.entries(COUNTRY_PATTERNS)) {
    if (config.patterns.some(p => birthPlace.includes(p))) {
      return key;
    }
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const personId = searchParams.get('personId');
    const treeId = searchParams.get('treeId') || DEFAULT_TREE_ID;

    if (!personId) {
      return NextResponse.json(
        { error: 'personId is required' },
        { status: 400 }
      );
    }

    // Fetch ancestors (CHILD_OF upward) and descendants (children downward)
    // so "My Lines" includes the viewer's children/grandchildren, not just ancestors.
    const results = await executeQuery<{
      id: string;
      surname: string | null;
      birthPlace: string | null;
    }>(
      `
      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(root:Person {id: $personId})
      MATCH (root)-[:CHILD_OF*0..20]->(ancestor:Person)
      WITH root, collect(DISTINCT ancestor) AS ancestors
      OPTIONAL MATCH (descendant:Person)-[:CHILD_OF*1..5]->(root)
      WITH ancestors, collect(DISTINCT descendant) AS descendants
      WITH ancestors + descendants AS lineage
      UNWIND lineage AS person
      RETURN DISTINCT person.id AS id, person.surname AS surname, person.birthPlace AS birthPlace
      `,
      { treeId, personId }
    );

    const ancestorIds: string[] = [];
    const ancestorSurnames = new Set<string>();
    const ancestorCountries = new Set<string>();

    for (const row of results) {
      ancestorIds.push(row.id);
      if (row.surname) {
        ancestorSurnames.add(row.surname.toLowerCase());
      }
      const country = extractCountry(row.birthPlace);
      if (country) {
        ancestorCountries.add(country);
      }
    }

    return NextResponse.json({
      personId,
      ancestorIds,
      ancestorSurnames: Array.from(ancestorSurnames),
      ancestorCountries: Array.from(ancestorCountries),
    });
  } catch (error) {
    console.error('Error fetching viewer ancestors:', error);
    return NextResponse.json(
      { error: 'Failed to fetch ancestors' },
      { status: 500 }
    );
  }
}
