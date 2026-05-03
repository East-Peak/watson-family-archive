import { NextRequest, NextResponse } from 'next/server';
import { getDriver } from '@/lib/neo4j';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const driver = getDriver();
  const session = driver.session();

  try {
    const result = await session.run(
      `MATCH (p:Person {id: $id})
       RETURN p.fullName AS fullName,
              p.birthYear AS birthYear,
              p.deathYear AS deathYear,
              p.birthPlace AS birthPlace`,
      { id }
    );

    if (result.records.length === 0) {
      return NextResponse.json({ error: 'Person not found' }, { status: 404 });
    }

    const record = result.records[0];
    const toNum = (v: unknown) => v != null && typeof (v as any).toNumber === 'function' ? (v as any).toNumber() : v ?? null;
    return NextResponse.json({
      personId: id,
      fullName: record.get('fullName'),
      birthYear: toNum(record.get('birthYear')),
      deathYear: toNum(record.get('deathYear')),
      birthPlace: record.get('birthPlace'),
    });
  } catch (error) {
    console.error('Error fetching person summary:', error);
    return NextResponse.json({ error: 'Failed to fetch person summary' }, { status: 500 });
  } finally {
    await session.close();
  }
}
