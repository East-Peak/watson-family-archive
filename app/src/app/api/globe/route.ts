import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/neo4j/client';
import { siteConfig } from '@/lib/siteConfig';
import { normalizeLifeEventType } from '@/components/globe/eventNormalization';

const DEFAULT_TREE_ID = siteConfig.defaultTreeId;

// --- Event normalization ---

type GlobeEventType =
  | 'birth'
  | 'death'
  | 'marriage'
  | 'census'
  | 'residence'
  | 'occupation'
  | 'migration'
  | 'military'
  | 'burial'
  | 'other';

type ApproximatePrecision = 'exact' | 'city' | 'county' | 'state' | 'country';

// --- Response types ---

interface GlobeEvent {
  type: GlobeEventType;
  year: number | null;
}

interface GlobePerson {
  id: string;
  name: string;
  birth: number | null;
  death: number | null;
  events: GlobeEvent[];
}

interface GlobeLocation {
  id: number;
  name: string;
  lat: number;
  lng: number;
  city: string;
  state: string;
  country: string;
  isApproximate: boolean;
  precision: ApproximatePrecision;
  people: GlobePerson[];
}

interface Arc {
  person_id: string;
  from: { place: string; lat: number; lng: number; year?: number; eventType?: GlobeEventType };
  to: { place: string; lat: number; lng: number; year?: number; eventType?: GlobeEventType };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const treeId = searchParams.get('treeId') || DEFAULT_TREE_ID;

    // Get all locations with their associated people and events
    // Includes birth, death, marriage, life-event, residence, and burial places
    // LifeEvent queries return e.event text for normalization at the API layer
    const results = await executeQuery<{
      placeName: string;
      lat: number;
      lng: number;
      city: string;
      state: string;
      country: string;
      isApproximate: boolean | null;
      precision: string | null;
      personId: string;
      personName: string;
      birthYear: number;
      deathYear: number;
      eventType: string;
      eventYear: number;
      eventText: string | null;
    }>(
      `
      // Birth places
      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
      MATCH (p)-[:BORN_IN]->(pl:Place)
      WHERE pl.latitude IS NOT NULL AND pl.longitude IS NOT NULL
      RETURN
        pl.name as placeName, pl.latitude as lat, pl.longitude as lng,
        pl.city as city, pl.state as state, pl.country as country,
        pl.isApproximate as isApproximate, pl.precision as precision,
        p.id as personId, p.fullName as personName,
        p.birthYear as birthYear, p.deathYear as deathYear,
        'birth' as eventType, p.birthYear as eventYear,
        null as eventText

      UNION ALL

      // Death places
      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
      MATCH (p)-[:DIED_IN]->(pl:Place)
      WHERE pl.latitude IS NOT NULL AND pl.longitude IS NOT NULL
        AND (p.isLiving IS NULL OR p.isLiving = false)
      RETURN
        pl.name as placeName, pl.latitude as lat, pl.longitude as lng,
        pl.city as city, pl.state as state, pl.country as country,
        pl.isApproximate as isApproximate, pl.precision as precision,
        p.id as personId, p.fullName as personName,
        p.birthYear as birthYear, p.deathYear as deathYear,
        'death' as eventType, p.deathYear as eventYear,
        null as eventText

      UNION ALL

      // Marriage places
      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
      MATCH (p)-[r:MARRIED_AT]->(pl:Place)
      WHERE pl.latitude IS NOT NULL AND pl.longitude IS NOT NULL
      RETURN
        pl.name as placeName, pl.latitude as lat, pl.longitude as lng,
        pl.city as city, pl.state as state, pl.country as country,
        pl.isApproximate as isApproximate, pl.precision as precision,
        p.id as personId, p.fullName as personName,
        p.birthYear as birthYear, p.deathYear as deathYear,
        'marriage' as eventType, r.marriageYear as eventYear,
        null as eventText

      UNION ALL

      // Life event places (census, immigration, etc. via LifeEvent nodes)
      // Returns e.event text for normalization at the API layer
      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
      MATCH (p)-[:EXPERIENCED]->(e:LifeEvent)-[:OCCURRED_AT]->(pl:Place)
      WHERE pl.latitude IS NOT NULL AND pl.longitude IS NOT NULL
      RETURN
        pl.name as placeName, pl.latitude as lat, pl.longitude as lng,
        pl.city as city, pl.state as state, pl.country as country,
        pl.isApproximate as isApproximate, pl.precision as precision,
        p.id as personId, p.fullName as personName,
        p.birthYear as birthYear, p.deathYear as deathYear,
        'life_event' as eventType, e.yearInt as eventYear,
        e.event as eventText

      UNION ALL

      // Residence places (LIVED_IN relationship)
      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
      MATCH (p)-[r:LIVED_IN]->(pl:Place)
      WHERE pl.latitude IS NOT NULL AND pl.longitude IS NOT NULL
      RETURN
        pl.name as placeName, pl.latitude as lat, pl.longitude as lng,
        pl.city as city, pl.state as state, pl.country as country,
        pl.isApproximate as isApproximate, pl.precision as precision,
        p.id as personId, p.fullName as personName,
        p.birthYear as birthYear, p.deathYear as deathYear,
        'residence' as eventType, r.yearInt as eventYear,
        null as eventText

      UNION ALL

      // Burial places (BURIED_IN relationship)
      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
      MATCH (p)-[:BURIED_IN]->(pl:Place)
      WHERE pl.latitude IS NOT NULL AND pl.longitude IS NOT NULL
      RETURN
        pl.name as placeName, pl.latitude as lat, pl.longitude as lng,
        pl.city as city, pl.state as state, pl.country as country,
        pl.isApproximate as isApproximate, pl.precision as precision,
        p.id as personId, p.fullName as personName,
        p.birthYear as birthYear, p.deathYear as deathYear,
        'burial' as eventType, p.deathYear as eventYear,
        null as eventText
      `,
      { treeId }
    );

    // Get ALL geocoded location events for multi-stop arc generation
    // Also returns e.event text for LifeEvent normalization
    const arcEventResults = await executeQuery<{
      personId: string;
      placeName: string;
      lat: number;
      lng: number;
      eventYear: number | null;
      eventType: string;
      eventText: string | null;
    }>(
      `
      // Birth locations
      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
      MATCH (p)-[:BORN_IN]->(pl:Place)
      WHERE pl.latitude IS NOT NULL AND pl.longitude IS NOT NULL
      RETURN p.id as personId, pl.name as placeName,
             pl.latitude as lat, pl.longitude as lng,
             p.birthYear as eventYear, 'birth' as eventType,
             null as eventText

      UNION ALL

      // Marriage locations
      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
      MATCH (p)-[r:MARRIED_AT]->(pl:Place)
      WHERE pl.latitude IS NOT NULL AND pl.longitude IS NOT NULL
      RETURN p.id as personId, pl.name as placeName,
             pl.latitude as lat, pl.longitude as lng,
             r.marriageYear as eventYear, 'marriage' as eventType,
             null as eventText

      UNION ALL

      // Life event locations (census, immigration, etc.)
      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
      MATCH (p)-[:EXPERIENCED]->(e:LifeEvent)-[:OCCURRED_AT]->(pl:Place)
      WHERE pl.latitude IS NOT NULL AND pl.longitude IS NOT NULL
      RETURN p.id as personId, pl.name as placeName,
             pl.latitude as lat, pl.longitude as lng,
             e.yearInt as eventYear, 'life_event' as eventType,
             e.event as eventText

      UNION ALL

      // Residence locations (LIVED_IN)
      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
      MATCH (p)-[r:LIVED_IN]->(pl:Place)
      WHERE pl.latitude IS NOT NULL AND pl.longitude IS NOT NULL
      RETURN p.id as personId, pl.name as placeName,
             pl.latitude as lat, pl.longitude as lng,
             r.yearInt as eventYear, 'residence' as eventType,
             null as eventText

      UNION ALL

      // Death locations
      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
      MATCH (p)-[:DIED_IN]->(pl:Place)
      WHERE pl.latitude IS NOT NULL AND pl.longitude IS NOT NULL
        AND (p.isLiving IS NULL OR p.isLiving = false)
      RETURN p.id as personId, pl.name as placeName,
             pl.latitude as lat, pl.longitude as lng,
             p.deathYear as eventYear, 'death' as eventType,
             null as eventText

      UNION ALL

      // Burial locations
      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
      MATCH (p)-[:BURIED_IN]->(pl:Place)
      WHERE pl.latitude IS NOT NULL AND pl.longitude IS NOT NULL
      RETURN p.id as personId, pl.name as placeName,
             pl.latitude as lat, pl.longitude as lng,
             p.deathYear as eventYear, 'burial' as eventType,
             null as eventText
      `,
      { treeId }
    );

    // Group by location (using lat/lng as key)
    const locationMap = new Map<string, GlobeLocation>();
    let locationId = 1;

    results.forEach((r) => {
      if (r.lat === null || r.lng === null) return;

      const key = `${r.lat.toFixed(4)},${r.lng.toFixed(4)}`;

      if (!locationMap.has(key)) {
        locationMap.set(key, {
          id: locationId++,
          name: r.placeName,
          lat: r.lat,
          lng: r.lng,
          city: r.city || '',
          state: r.state || '',
          country: r.country || '',
          isApproximate: r.isApproximate ?? false,
          precision: (r.precision as ApproximatePrecision) || 'exact',
          people: [],
        });
      }

      const location = locationMap.get(key)!;

      // Find or create person entry
      let person = location.people.find((p) => p.id === r.personId);
      if (!person) {
        person = {
          id: r.personId,
          name: r.personName,
          birth: r.birthYear,
          death: r.deathYear,
          events: [],
        };
        location.people.push(person);
      }

      // Normalize the event type: relationship-based types pass through,
      // LifeEvent text gets normalized via the normalization table
      const normalizedType: GlobeEventType =
        r.eventType === 'life_event'
          ? normalizeLifeEventType(r.eventText || '')
          : (r.eventType as GlobeEventType);

      const eventYear = r.eventYear ?? null;

      // Add paired event (deduplicate by type+year)
      const isDuplicate = person.events.some(
        (e) => e.type === normalizedType && e.year === eventYear
      );
      if (!isDuplicate) {
        person.events.push({ type: normalizedType, year: eventYear });
      }
    });

    // Sort events for each person by year
    locationMap.forEach((loc) => {
      loc.people.forEach((p) => {
        p.events.sort((a, b) => {
          const yearA = a.year ?? Infinity;
          const yearB = b.year ?? Infinity;
          if (yearA !== yearB) return yearA - yearB;
          return (eventTypePriority[a.type] ?? 5) - (eventTypePriority[b.type] ?? 5);
        });
      });
    });

    const locations = Array.from(locationMap.values());

    // Build multi-stop arcs: group events by person, sort, generate consecutive arcs
    // Event type sort priority for same-year events
    const personEvents = new Map<
      string,
      Array<{ place: string; lat: number; lng: number; year: number | null; eventType: GlobeEventType }>
    >();

    for (const r of arcEventResults) {
      if (r.lat == null || r.lng == null) continue;

      // Normalize event type for arc events too
      const normalizedType: GlobeEventType =
        r.eventType === 'life_event'
          ? normalizeLifeEventType(r.eventText || '')
          : (r.eventType as GlobeEventType);

      if (!personEvents.has(r.personId)) {
        personEvents.set(r.personId, []);
      }
      personEvents.get(r.personId)!.push({
        place: r.placeName,
        lat: r.lat,
        lng: r.lng,
        year: r.eventYear,
        eventType: normalizedType,
      });
    }

    // Generate arcs between consecutive stops for each person
    const arcs: Arc[] = [];

    for (const [personId, events] of personEvents) {
      // Sort by year ascending; for same year, use event type priority
      events.sort((a, b) => {
        const yearA = a.year ?? Infinity;
        const yearB = b.year ?? Infinity;
        if (yearA !== yearB) return yearA - yearB;
        return (eventTypePriority[a.eventType] ?? 5) - (eventTypePriority[b.eventType] ?? 5);
      });

      // Deduplicate consecutive stops at the same location (same lat/lng rounded to 4 decimals)
      const deduped = [events[0]];
      for (let i = 1; i < events.length; i++) {
        const prev = deduped[deduped.length - 1];
        const curr = events[i];
        if (
          prev.lat.toFixed(4) === curr.lat.toFixed(4) &&
          prev.lng.toFixed(4) === curr.lng.toFixed(4)
        ) {
          continue; // Skip duplicate consecutive location
        }
        deduped.push(curr);
      }

      // Generate arcs between consecutive distinct locations
      for (let i = 0; i < deduped.length - 1; i++) {
        const from = deduped[i];
        const to = deduped[i + 1];
        arcs.push({
          person_id: personId,
          from: {
            place: from.place,
            lat: from.lat,
            lng: from.lng,
            year: from.year || undefined,
            eventType: from.eventType,
          },
          to: {
            place: to.place,
            lat: to.lat,
            lng: to.lng,
            year: to.year || undefined,
            eventType: to.eventType,
          },
        });
      }
    }

    return NextResponse.json({ locations, arcs });
  } catch (error) {
    console.error('Error fetching globe data:', error);
    return NextResponse.json({ error: 'Failed to fetch globe data' }, { status: 500 });
  }
}

// Event type sort priority for same-year events (deterministic ordering)
const eventTypePriority: Record<string, number> = {
  birth: 0,
  census: 1,
  residence: 2,
  occupation: 3,
  migration: 4,
  military: 5,
  marriage: 6,
  burial: 7,
  death: 8,
  other: 9,
};
