import { NextRequest, NextResponse } from 'next/server';
// Force rebuild
import { getTreeGraphData } from '@/lib/neo4j';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ treeId: string }> },
) {
  try {
    const { treeId } = await params;
    const { searchParams } = new URL(request.url);

    const rootPersonId = searchParams.get('rootPersonId') || undefined;
    const rawViewMode = searchParams.get('viewMode') || 'full';
    const viewMode =
      rawViewMode === 'ancestors' ||
      rawViewMode === 'descendants' ||
      rawViewMode === 'full'
        ? rawViewMode
        : 'full';
    const parsedMaxGenerations = parseInt(
      searchParams.get('maxGenerations') || '10',
      10,
    );
    const maxGenerations = Number.isFinite(parsedMaxGenerations)
      ? Math.min(Math.max(parsedMaxGenerations, 1), 20)
      : 10;
    const branchFilter = searchParams.get('branch') || undefined;

    const effectiveViewMode =
      viewMode === 'full' || rootPersonId ? viewMode : 'full';

    const graphData = await getTreeGraphData(
      treeId,
      rootPersonId,
      effectiveViewMode,
      maxGenerations,
      branchFilter,
    );

    return NextResponse.json({
      ...graphData,
      persons: graphData.nodes,
      relationships: graphData.edges,
    });
  } catch (error) {
    console.error('Error fetching tree graph:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tree graph data' },
      { status: 500 },
    );
  }
}
