import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/neo4j/client';
import { siteConfig } from '@/lib/siteConfig';
import { getCollection, discoverCollections, listCollections, type CollectionPerson } from '@/lib/collections';

const DEFAULT_TREE_ID = siteConfig.defaultTreeId;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  try {
    const { type } = await params;
    const { searchParams } = new URL(request.url);
    const treeId = searchParams.get('treeId') || DEFAULT_TREE_ID;
    const viewerId = searchParams.get('viewerId');

    // Special case: list all available collections
    if (type === 'list') {
      const includeCounts = searchParams.get('counts') === 'true';
      const collections = await listCollections({ treeId, includeCounts });
      return NextResponse.json({ collections });
    }

    const config = await getCollection(type, treeId);

    if (!config) {
      const all = await discoverCollections(treeId);
      return NextResponse.json(
        { error: 'Collection not found', availableCollections: Object.keys(all) },
        { status: 404 }
      );
    }

    const allResults = await executeQuery<CollectionPerson>(config.query, {
      treeId,
      ...config.params,
    });

    // If viewerId is provided, intersect with the viewer's direct ancestors
    // so the response can return a scoped subset alongside the total count.
    let viewerAncestorIds: Set<string> | null = null;
    if (viewerId) {
      const ancestorRows = await executeQuery<{ id: string }>(
        `
        MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(root:Person {id: $viewerId})
        MATCH path = (root)-[:CHILD_OF*0..20]->(ancestor:Person)
        RETURN DISTINCT ancestor.id as id
        `,
        { treeId, viewerId }
      );
      viewerAncestorIds = new Set(ancestorRows.map(r => r.id));
    }

    const viewerResults = viewerAncestorIds
      ? allResults.filter(p => viewerAncestorIds!.has(p.id))
      : null;

    return NextResponse.json({
      type,
      title: config.title,
      emoji: config.emoji,
      description: config.description,
      totalCount: allResults.length,
      viewerCount: viewerResults?.length ?? null,
      people: allResults,
      viewerPeople: viewerResults,
    });
  } catch (error) {
    console.error('Error fetching collection:', error);
    return NextResponse.json({ error: 'Failed to fetch collection' }, { status: 500 });
  }
}
