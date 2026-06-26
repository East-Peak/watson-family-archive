import { NextRequest, NextResponse } from 'next/server';
import { filterByTimePeriod } from '@/lib/neo4j';
import { siteConfig } from '@/lib/siteConfig';

const DEFAULT_TREE_ID = siteConfig.defaultTreeId;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const treeId = searchParams.get('treeId') || DEFAULT_TREE_ID;
    const fromYear = parseInt(searchParams.get('from') || '1600', 10);
    const toYear = parseInt(searchParams.get('to') || '2025', 10);

    if (isNaN(fromYear) || isNaN(toYear)) {
      return NextResponse.json(
        { error: 'Invalid year parameters' },
        { status: 400 },
      );
    }

    const results = await filterByTimePeriod(fromYear, toYear, treeId);

    return NextResponse.json({
      filterType: 'timeperiod',
      fromYear,
      toYear,
      count: results.length,
      results,
    });
  } catch (error) {
    console.error('Error filtering by time period:', error);
    return NextResponse.json(
      { error: 'Failed to filter by time period' },
      { status: 500 },
    );
  }
}
