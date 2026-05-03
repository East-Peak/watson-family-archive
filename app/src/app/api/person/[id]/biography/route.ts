import { NextRequest, NextResponse } from 'next/server';
import { getPersonById, updatePerson } from '@/lib/neo4j';
import { siteConfig } from '@/lib/siteConfig';

const DEFAULT_TREE_ID = siteConfig.defaultTreeId;
const MAX_BIO_LENGTH = 10000;

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const treeId = DEFAULT_TREE_ID;

    const body = await request.json();
    const { biography } = body;

    if (!biography || typeof biography !== 'string' || !biography.trim()) {
      return NextResponse.json(
        { error: 'Biography text is required' },
        { status: 400 }
      );
    }

    if (biography.length > MAX_BIO_LENGTH) {
      return NextResponse.json(
        { error: `Biography must be under ${MAX_BIO_LENGTH} characters` },
        { status: 400 }
      );
    }

    // Verify person exists
    const person = await getPersonById(id, treeId);
    if (!person) {
      return NextResponse.json(
        { error: 'Person not found' },
        { status: 404 }
      );
    }

    // Update the biography
    const updated = await updatePerson(id, { biography: biography.trim() }, treeId);

    if (!updated) {
      return NextResponse.json(
        { error: 'Failed to update biography' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      personId: id,
      personName: updated.fullName,
      biography: updated.biography,
      updatedAt: updated.updatedAt,
    });
  } catch (error) {
    console.error('Error saving biography:', error);
    return NextResponse.json(
      { error: 'Failed to save biography' },
      { status: 500 }
    );
  }
}
