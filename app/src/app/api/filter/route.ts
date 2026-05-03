import { NextRequest, NextResponse } from 'next/server';
import {
  listOccupations,
  listReligions,
  listWars,
  listLegalStatuses,
  listEthnicities,
  listPlaces,
} from '@/lib/neo4j';
import { siteConfig } from '@/lib/siteConfig';

const DEFAULT_TREE_ID = siteConfig.defaultTreeId;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const treeId = searchParams.get('treeId') || DEFAULT_TREE_ID;

    const [occupations, religions, wars, legalStatuses, ethnicities, places] = await Promise.all([
      listOccupations(treeId),
      listReligions(treeId),
      listWars(treeId),
      listLegalStatuses(treeId),
      listEthnicities(treeId),
      listPlaces(treeId),
    ]);

    return NextResponse.json({
      occupations,
      religions,
      wars,
      legalStatuses,
      ethnicities,
      places,
    });
  } catch (error) {
    console.error('Error fetching filter options:', error);
    return NextResponse.json(
      { error: 'Failed to fetch filter options' },
      { status: 500 }
    );
  }
}
