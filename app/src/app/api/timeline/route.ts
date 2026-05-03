import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/neo4j/client';
import { siteConfig } from '@/lib/siteConfig';

const DEFAULT_TREE_ID = siteConfig.defaultTreeId;

interface TimelineEvent {
  year: number;
  type: 'birth' | 'death';
  description: string;
  location: string | null;
  personId: string;
  personName: string;
  surname: string | null;
  lat: number | null;
  lng: number | null;
  country: string | null;
}

function normalizeTimelineSurname(value: string | null | undefined): string | null {
  const surname = value?.trim();

  if (!surname) {
    return null;
  }

  if (/^\d+$/.test(surname)) {
    return null;
  }

  if (/^\([^)]*\)$/.test(surname)) {
    return null;
  }

  return surname;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const treeId = searchParams.get('treeId') || DEFAULT_TREE_ID;
    const startYear = searchParams.get('startYear');
    const endYear = searchParams.get('endYear');
    const surname = searchParams.get('surname');

    const events: TimelineEvent[] = [];

    // Build year filter
    let yearFilter = '';
    if (startYear || endYear) {
      const conditions = [];
      if (startYear) conditions.push(`year >= ${parseInt(startYear)}`);
      if (endYear) conditions.push(`year <= ${parseInt(endYear)}`);
      yearFilter = `AND (${conditions.join(' AND ')})`;
    }

    // Build surname filter
    let surnameFilter = '';
    if (surname) {
      surnameFilter = `AND toLower(p.surname) = toLower($surname)`;
    }

    // Get birth events
    const birthResults = await executeQuery<{
      year: number;
      personId: string;
      personName: string;
      surname: string;
      location: string;
      lat: number;
      lng: number;
      country: string;
    }>(
      `
      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
      WHERE p.birthYear IS NOT NULL
        ${yearFilter.replace(/year/g, 'p.birthYear')}
        ${surnameFilter}
      OPTIONAL MATCH (p)-[:BORN_IN]->(bp:Place)
      RETURN
        p.birthYear as year,
        p.id as personId,
        p.fullName as personName,
        p.surname as surname,
        COALESCE(bp.name, p.birthPlace) as location,
        bp.latitude as lat,
        bp.longitude as lng,
        bp.country as country
      ORDER BY year
      `,
      { treeId, surname }
    );

    birthResults.forEach((r) => {
      events.push({
        year: r.year,
        type: 'birth',
        description: `${r.personName} was born`,
        location: r.location,
        personId: r.personId,
        personName: r.personName,
        surname: normalizeTimelineSurname(r.surname),
        lat: r.lat,
        lng: r.lng,
        country: r.country,
      });
    });

    // Get death events
    const deathResults = await executeQuery<{
      year: number;
      personId: string;
      personName: string;
      surname: string;
      location: string;
      lat: number;
      lng: number;
      country: string;
    }>(
      `
      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
      WHERE p.deathYear IS NOT NULL AND p.isLiving = false
        ${yearFilter.replace(/year/g, 'p.deathYear')}
        ${surnameFilter}
      OPTIONAL MATCH (p)-[:DIED_IN]->(dp:Place)
      RETURN
        p.deathYear as year,
        p.id as personId,
        p.fullName as personName,
        p.surname as surname,
        COALESCE(dp.name, p.deathPlace) as location,
        dp.latitude as lat,
        dp.longitude as lng,
        dp.country as country
      ORDER BY year
      `,
      { treeId, surname }
    );

    deathResults.forEach((r) => {
      events.push({
        year: r.year,
        type: 'death',
        description: `${r.personName} passed away`,
        location: r.location,
        personId: r.personId,
        personName: r.personName,
        surname: normalizeTimelineSurname(r.surname),
        lat: r.lat,
        lng: r.lng,
        country: r.country,
      });
    });

    // Sort by year
    events.sort((a, b) => a.year - b.year);

    return NextResponse.json(events);
  } catch (error) {
    console.error('Error fetching timeline:', error);
    return NextResponse.json({ error: 'Failed to fetch timeline' }, { status: 500 });
  }
}
