import { NextRequest, NextResponse } from 'next/server';
import { getGraphStats } from '@/lib/neo4j';
import { siteConfig } from '@/lib/siteConfig';

const DEFAULT_TREE_ID = siteConfig.defaultTreeId;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const treeId = searchParams.get('treeId') || DEFAULT_TREE_ID;

    const stats = await getGraphStats(treeId);

    return NextResponse.json(stats);
  } catch (error) {
    console.error('Error fetching graph stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch graph stats' },
      { status: 500 }
    );
  }
}
