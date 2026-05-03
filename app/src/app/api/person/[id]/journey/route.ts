import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/neo4j/client';
import { siteConfig } from '@/lib/siteConfig';

const DEFAULT_TREE_ID = siteConfig.defaultTreeId;

interface JourneyStop {
  year: number | null;
  place: string;
  city: string | null;
  state: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  source: string | null;
  occupation: string | null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const treeId = searchParams.get('treeId') || DEFAULT_TREE_ID;

    // Single combined query for person info, birth, occupations, and death
    const results = await executeQuery<{
      id: string;
      fullName: string;
      birthYear: number | null;
      deathYear: number | null;
      birthPlace: string | null;
      birthLat: number | null;
      birthLng: number | null;
      birthCity: string | null;
      birthState: string | null;
      birthCountry: string | null;
      occupations: Array<{
        year: number | null;
        event: string | null;
        place: string | null;
        lat: number | null;
        lng: number | null;
        city: string | null;
        state: string | null;
        country: string | null;
      }>;
      deathPlace: string | null;
      deathLat: number | null;
      deathLng: number | null;
      deathCity: string | null;
      deathState: string | null;
      deathCountry: string | null;
    }>(
      `
      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person {id: $personId})
      OPTIONAL MATCH (p)-[:BORN_IN]->(bp:Place)
      OPTIONAL MATCH (p)-[:DIED_IN]->(dp:Place)
      WHERE (p.isLiving IS NULL OR p.isLiving = false) OR dp IS NULL
      WITH p, bp, dp
      OPTIONAL MATCH (p)-[:EXPERIENCED]->(e:LifeEvent)-[:OCCURRED_AT]->(ep:Place)
      WHERE ep.latitude IS NOT NULL AND ep.longitude IS NOT NULL
      WITH p, bp, dp, collect(DISTINCT {
        year: e.yearInt, event: e.event,
        place: ep.name, lat: ep.latitude, lng: ep.longitude,
        city: ep.city, state: ep.state, country: ep.country
      }) as lifeEventStops
      OPTIONAL MATCH (p)-[mr:MARRIED_AT]->(mp:Place)
      WHERE mp.latitude IS NOT NULL AND mp.longitude IS NOT NULL
      WITH p, bp, dp, lifeEventStops, collect(DISTINCT {
        year: mr.marriageYear, event: 'Married',
        place: mp.name, lat: mp.latitude, lng: mp.longitude,
        city: mp.city, state: mp.state, country: mp.country
      }) as marriageStops
      RETURN
        p.id as id, p.fullName as fullName, p.birthYear as birthYear, p.deathYear as deathYear,
        bp.name as birthPlace, bp.latitude as birthLat, bp.longitude as birthLng,
        bp.city as birthCity, bp.state as birthState, bp.country as birthCountry,
        lifeEventStops + marriageStops as occupations,
        dp.name as deathPlace, dp.latitude as deathLat, dp.longitude as deathLng,
        dp.city as deathCity, dp.state as deathState, dp.country as deathCountry
      `,
      { treeId, personId: id }
    );

    if (results.length === 0) {
      return NextResponse.json({ error: 'Person not found' }, { status: 404 });
    }

    const person = results[0];
    const stops: JourneyStop[] = [];

    // Add birth location
    if (person.birthLat && person.birthLng) {
      stops.push({
        year: person.birthYear,
        place: person.birthPlace || '',
        city: person.birthCity,
        state: person.birthState,
        country: person.birthCountry,
        lat: person.birthLat,
        lng: person.birthLng,
        source: 'birth',
        occupation: null,
      });
    }

    // Add life event locations (census, residence, occupation events with coordinates)
    for (const evt of person.occupations) {
      if (evt.place && evt.lat && evt.lng) {
        const eventLower = (evt.event || '').toLowerCase();
        // Classify the event to set proper source
        const isCensus = eventLower.includes('census');
        const isOccupation = eventLower.startsWith('began working as');
        const isMarriage = eventLower === 'married';
        const isDeath = eventLower === 'died' || eventLower === 'buried';
        const isBirth = eventLower === 'born';
        // Skip birth/death events — they're added explicitly above
        if (isDeath || isBirth) continue;
        stops.push({
          year: evt.year,
          place: evt.place || '',
          city: evt.city,
          state: evt.state,
          country: evt.country,
          lat: evt.lat,
          lng: evt.lng,
          source: isMarriage ? 'marriage' : isCensus ? 'census' : isOccupation ? 'occupation' : 'residence',
          occupation: isOccupation ? evt.event?.replace('Began working as ', '') || null : null,
        });
      }
    }

    // Add death location
    if (person.deathLat && person.deathLng) {
      stops.push({
        year: person.deathYear,
        place: person.deathPlace || '',
        city: person.deathCity,
        state: person.deathState,
        country: person.deathCountry,
        lat: person.deathLat,
        lng: person.deathLng,
        source: 'death',
        occupation: null,
      });
    }

    // Sort by year
    stops.sort((a, b) => (a.year || 0) - (b.year || 0));

    return NextResponse.json({
      personId: person.id,
      personName: person.fullName,
      birthYear: person.birthYear,
      deathYear: person.deathYear,
      stops,
    });
  } catch (error) {
    console.error('Error fetching journey:', error);
    return NextResponse.json({ error: 'Failed to fetch journey' }, { status: 500 });
  }
}
