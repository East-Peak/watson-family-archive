import { NextRequest, NextResponse } from 'next/server';
import { siteConfig } from '@/lib/siteConfig';
import { buildPersonProfile } from '@/lib/personProfile';

const DEFAULT_TREE_ID = siteConfig.defaultTreeId;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const treeId = searchParams.get('treeId') || DEFAULT_TREE_ID;

    const profile = await buildPersonProfile(id, treeId);

    if (!profile) {
      return NextResponse.json({ error: 'Person not found' }, { status: 404 });
    }

    return NextResponse.json(profile);
  } catch (error) {
    console.error('Error fetching person profile:', error);
    return NextResponse.json(
      { error: 'Failed to fetch person profile' },
      { status: 500 }
    );
  }
}
