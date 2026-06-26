import { NextRequest, NextResponse } from 'next/server';
import { getTreeById, getTreeStats } from '@/lib/neo4j';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ treeId: string }> },
) {
  try {
    const { treeId } = await params;
    const tree = await getTreeById(treeId);

    if (!tree) {
      return NextResponse.json({ error: 'Tree not found' }, { status: 404 });
    }

    // Get stats too
    const stats = await getTreeStats(treeId);

    return NextResponse.json({
      ...tree,
      stats,
    });
  } catch (error) {
    console.error('Error fetching tree:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tree' },
      { status: 500 },
    );
  }
}

