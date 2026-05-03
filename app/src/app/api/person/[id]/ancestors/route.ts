import { NextRequest, NextResponse } from 'next/server';
import { getAncestors } from '@/lib/neo4j';
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
    const maxGenerations = parseInt(searchParams.get('maxGenerations') || '10', 10);

    const ancestorData = await getAncestors(id, treeId, maxGenerations);

    return NextResponse.json(ancestorData);
  } catch (error) {
    console.error('Error fetching ancestors:', error);
    return NextResponse.json(
      { error: 'Failed to fetch ancestors' },
      { status: 500 }
    );
  }
}
