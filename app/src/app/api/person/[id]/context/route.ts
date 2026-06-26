import { NextRequest, NextResponse } from 'next/server';
import { getPersonContextualMedia } from '@/lib/neo4j';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const items = await getPersonContextualMedia(id);

    return NextResponse.json({ items });
  } catch (error) {
    console.error('Error fetching contextual media:', error);
    return NextResponse.json(
      { error: 'Failed to fetch contextual media' },
      { status: 500 },
    );
  }
}
