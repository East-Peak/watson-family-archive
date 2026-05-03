import { NextRequest, NextResponse } from 'next/server';
import { getPeopleBySurname } from '@/lib/neo4j';
import { siteConfig } from '@/lib/siteConfig';

const DEFAULT_TREE_ID = siteConfig.defaultTreeId;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ surname: string }> }
) {
  try {
    const { surname } = await params;
    const { searchParams } = new URL(request.url);
    const treeId = searchParams.get('treeId') || DEFAULT_TREE_ID;
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const excludeId = searchParams.get('excludeId');

    const results = await getPeopleBySurname(surname, treeId, limit, excludeId ?? undefined);

    const people = results.map((person) => ({
      id: person.id,
      fullName: person.fullName,
      givenName: person.givenName,
      surname: person.surname,
      birthYear: person.birthYear,
      deathYear: person.deathYear,
    }));

    return NextResponse.json({
      surname,
      count: people.length,
      people,
    });
  } catch (error) {
    console.error('Error fetching people by surname:', error);
    return NextResponse.json(
      { error: 'Failed to fetch people by surname' },
      { status: 500 }
    );
  }
}
