import { NextRequest, NextResponse } from 'next/server';
import { filterByPlace } from '@/lib/neo4j';
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

    const results = await filterByPlace(id, treeId);

    return NextResponse.json({
      filterId: id,
      filterType: 'place',
      count: results.length,
      results,
    });
  } catch (error) {
    console.error('Error filtering by place:', error);
    return NextResponse.json(
      { error: 'Failed to filter by place' },
      { status: 500 }
    );
  }
}
