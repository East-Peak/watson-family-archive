import { NextRequest, NextResponse } from 'next/server';
import { getPersonById, updatePerson } from '@/lib/neo4j';
import { siteConfig } from '@/lib/siteConfig';

// Default tree ID (will be dynamic once multi-user is implemented)
const DEFAULT_TREE_ID = siteConfig.defaultTreeId;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const treeId = searchParams.get('treeId') || DEFAULT_TREE_ID;

    const person = await getPersonById(id, treeId);

    if (!person) {
      return NextResponse.json(
        { error: 'Person not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(person);
  } catch (error) {
    console.error('Error fetching person:', error);
    return NextResponse.json(
      { error: 'Failed to fetch person' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const treeId = searchParams.get('treeId') || DEFAULT_TREE_ID;
    const body = await request.json();

    const updated = await updatePerson(id, body, treeId);

    if (!updated) {
      return NextResponse.json(
        { error: 'Person not found or no updates provided' },
        { status: 404 }
      );
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating person:', error);
    return NextResponse.json(
      { error: 'Failed to update person' },
      { status: 500 }
    );
  }
}
