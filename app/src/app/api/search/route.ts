import { NextRequest, NextResponse } from 'next/server';
import { searchPeople, searchByPlace, searchByOccupation, searchByContent } from '@/lib/neo4j';
import { searchRecords } from '@/lib/neo4j/queries/records';
import { siteConfig } from '@/lib/siteConfig';

const DEFAULT_TREE_ID = siteConfig.defaultTreeId;

async function searchPeopleCascade(query: string, treeId: string, limit: number) {
  const nameResults = await searchPeople(query, treeId, limit);

  // If name search returns few results, try fallback searches
  let results = nameResults;
  if (nameResults.length < 3) {
    const seenIds = new Set(nameResults.map(p => p.id));

    // Try place-based search
    const placeResults = await searchByPlace(query, treeId, limit);
    const uniquePlaceResults = placeResults.filter(p => !seenIds.has(p.id));
    for (const p of uniquePlaceResults) seenIds.add(p.id);

    // Try occupation-based search
    const occupationResults = await searchByOccupation(query, treeId, limit);
    const uniqueOccupationResults = occupationResults.filter(p => !seenIds.has(p.id));
    for (const p of uniqueOccupationResults) seenIds.add(p.id);

    // Try full content search (markdownContent — sources, research notes, life events)
    const contentResults = await searchByContent(query, treeId, limit);
    const uniqueContentResults = contentResults.filter(p => !seenIds.has(p.id));

    results = [...nameResults, ...uniquePlaceResults, ...uniqueOccupationResults, ...uniqueContentResults].slice(0, limit);
  }

  return results.map((person) => {
    let sourceCount = 0;
    try {
      const parsed = person.sources ? JSON.parse(person.sources) : [];
      sourceCount = Array.isArray(parsed) ? parsed.length : 0;
    } catch { /* ignore */ }
    return { ...person, sourceCount };
  });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const treeId = searchParams.get('treeId') || DEFAULT_TREE_ID;
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    if (!query || query.length < 2) {
      return NextResponse.json(
        { error: 'Query must be at least 2 characters', records: [] },
        { status: 400 }
      );
    }

    const [results, records] = await Promise.all([
      searchPeopleCascade(query, treeId, limit),
      searchRecords(query, treeId, limit),
    ]);

    return NextResponse.json({
      query,
      count: results.length,
      recordCount: records.length,
      results,
      records,
    });
  } catch (error) {
    console.error('Error searching:', error);
    return NextResponse.json(
      { error: 'Failed to search', records: [] },
      { status: 500 }
    );
  }
}
