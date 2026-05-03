import { NextRequest, NextResponse } from 'next/server';
import { filterByReligion } from '@/lib/neo4j';
import { siteConfig } from '@/lib/siteConfig';

const DEFAULT_TREE_ID = siteConfig.defaultTreeId;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const treeId = searchParams.get('treeId') || DEFAULT_TREE_ID;

    const results = await filterByReligion(id, treeId);

    return NextResponse.json({
      filterId: id,
      filterType: 'religion',
      count: results.length,
      results,
    });
  } catch (error) {
    console.error('Error filtering by religion:', error);
    return NextResponse.json(
      { error: 'Failed to filter by religion' },
      { status: 500 }
    );
  }
}
