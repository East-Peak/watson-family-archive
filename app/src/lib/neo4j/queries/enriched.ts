import { executeQuery } from '../client';
import type { Neo4jPerson } from '../types';
import { siteConfig } from '@/lib/siteConfig';
import { cacheGraphRead } from '@/lib/cache/graphCache';

const DEFAULT_TREE_ID = siteConfig.defaultTreeId;

// ============================================
// Types for enriched data
// ============================================

export interface EnrichedPerson extends Neo4jPerson {
  markdownContent?: string;
  biography?: string;
  bioTier?: string;
  // NOTE: relationshipToStuart removed - use RelationshipDisplay component for dynamic calculation
  birthPlaceName?: string;
  deathPlaceName?: string;
  occupations?: Array<{
    title: string;
    category?: string;
    fromYear?: number;
    toYear?: number;
  }>;
  religions?: Array<{ name: string; convertedYear?: number }>;
  wars?: Array<{ name: string; unit?: string; rank?: string }>;
  legalStatus?: { status: string; notes?: string };
  ethnicities?: Array<{ name: string; dnaConfirmed?: boolean }>;
}

export interface FilterResult {
  id: string;
  name: string;
  count: number;
}

export interface PersonSummary {
  id: string;
  fullName: string;
  birthYear?: number;
  deathYear?: number;
  // NOTE: relationshipToStuart removed - calculate dynamically via path API or client-side
}

// ============================================
// Get Enriched Person
// ============================================

async function fetchEnrichedPerson(
  personId: string,
  treeId: string = DEFAULT_TREE_ID,
): Promise<EnrichedPerson | null> {
  const results = await executeQuery<{
    person: Neo4jPerson;
    markdownContent: string | null;
    biography: string | null;
    bioTier: string | null;
    birthPlace: string | null;
    deathPlace: string | null;
    occupations: Array<{
      title: string;
      category?: string;
      fromYear?: number;
      toYear?: number;
    }>;
    religions: Array<{ name: string; convertedYear?: number }>;
    wars: Array<{ name: string; unit?: string; rank?: string }>;
    legalStatus: { status: string; notes?: string } | null;
    ethnicities: Array<{ name: string; dnaConfirmed?: boolean }>;
  }>(
    `
    MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person {id: $personId})

    OPTIONAL MATCH (p)-[:BORN_IN]->(birthPlace:Place)
    OPTIONAL MATCH (p)-[:DIED_IN]->(deathPlace:Place)
    OPTIONAL MATCH (p)-[occRel:HAD_OCCUPATION]->(occ:Occupation)
    OPTIONAL MATCH (p)-[relRel:PRACTICED]->(rel:Religion)
    OPTIONAL MATCH (p)-[warRel:SERVED_IN]->(war:War)
    OPTIONAL MATCH (p)-[statusRel:HAD_STATUS]->(status:LegalStatus)
    OPTIONAL MATCH (p)-[ethRel:OF_ETHNICITY]->(eth:Ethnicity)

    RETURN p as person,
      p.markdownContent as markdownContent,
      p.biography as biography,
      p.bioTier as bioTier,
      birthPlace.name as birthPlace,
      deathPlace.name as deathPlace,
      collect(DISTINCT CASE WHEN occ IS NOT NULL THEN {
        title: occ.title,
        category: occ.category,
        fromYear: occRel.fromYear,
        toYear: occRel.toYear
      } ELSE null END) as occupations,
      collect(DISTINCT CASE WHEN rel IS NOT NULL THEN {
        name: rel.name,
        convertedYear: relRel.convertedYear
      } ELSE null END) as religions,
      collect(DISTINCT CASE WHEN war IS NOT NULL THEN {
        name: war.name,
        unit: warRel.unit,
        rank: warRel.rank
      } ELSE null END) as wars,
      CASE WHEN status IS NOT NULL THEN {
        status: status.status,
        notes: statusRel.notes
      } ELSE null END as legalStatus,
      collect(DISTINCT CASE WHEN eth IS NOT NULL THEN {
        name: eth.name,
        dnaConfirmed: ethRel.dnaConfirmed
      } ELSE null END) as ethnicities
    `,
    { personId, treeId },
  );

  if (results.length === 0) return null;

  const row = results[0];
  return {
    ...row.person,
    markdownContent: row.markdownContent ?? undefined,
    biography: row.biography ?? undefined,
    bioTier: row.bioTier ?? undefined,
    birthPlaceName: row.birthPlace ?? undefined,
    deathPlaceName: row.deathPlace ?? undefined,
    occupations: row.occupations.filter(
      (o): o is NonNullable<typeof o> => o !== null,
    ),
    religions: row.religions.filter(
      (r): r is NonNullable<typeof r> => r !== null,
    ),
    wars: row.wars.filter((w): w is NonNullable<typeof w> => w !== null),
    legalStatus: row.legalStatus ?? undefined,
    ethnicities: row.ethnicities.filter(
      (e): e is NonNullable<typeof e> => e !== null,
    ),
  };
}

/**
 * Enriched single-person view. Cached (shared Redis graph cache), keyed by
 * person + tree: identical for every user and rebuildable.
 */
export const getEnrichedPerson = cacheGraphRead(fetchEnrichedPerson, [
  'enriched-person',
]);

// ============================================
// List all filter options
// ============================================

export async function listOccupations(
  treeId: string = DEFAULT_TREE_ID,
): Promise<FilterResult[]> {
  const results = await executeQuery<{
    id: string;
    name: string;
    count: number;
  }>(
    `
    MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)-[:HAD_OCCUPATION]->(o:Occupation)
    RETURN o.id as id, o.title as name, count(DISTINCT p) as count
    ORDER BY count DESC
    `,
    { treeId },
  );
  return results.map((r) => ({
    id: r.id,
    name: r.name,
    count: Number(r.count),
  }));
}

export async function listReligions(
  treeId: string = DEFAULT_TREE_ID,
): Promise<FilterResult[]> {
  const results = await executeQuery<{
    id: string;
    name: string;
    count: number;
  }>(
    `
    MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)-[:PRACTICED]->(r:Religion)
    RETURN r.id as id, r.name as name, count(DISTINCT p) as count
    ORDER BY count DESC
    `,
    { treeId },
  );
  return results.map((r) => ({
    id: r.id,
    name: r.name,
    count: Number(r.count),
  }));
}

export async function listWars(
  treeId: string = DEFAULT_TREE_ID,
): Promise<FilterResult[]> {
  const results = await executeQuery<{
    id: string;
    name: string;
    count: number;
  }>(
    `
    MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)-[:SERVED_IN]->(w:War)
    RETURN w.id as id, w.name as name, count(DISTINCT p) as count
    ORDER BY count DESC
    `,
    { treeId },
  );
  return results.map((r) => ({
    id: r.id,
    name: r.name,
    count: Number(r.count),
  }));
}

export async function listLegalStatuses(
  treeId: string = DEFAULT_TREE_ID,
): Promise<FilterResult[]> {
  const results = await executeQuery<{
    id: string;
    name: string;
    count: number;
  }>(
    `
    MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)-[:HAD_STATUS]->(l:LegalStatus)
    RETURN l.id as id, l.status as name, count(DISTINCT p) as count
    ORDER BY count DESC
    `,
    { treeId },
  );
  return results.map((r) => ({
    id: r.id,
    name: r.name,
    count: Number(r.count),
  }));
}

export async function listEthnicities(
  treeId: string = DEFAULT_TREE_ID,
): Promise<FilterResult[]> {
  const results = await executeQuery<{
    id: string;
    name: string;
    count: number;
  }>(
    `
    MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)-[:OF_ETHNICITY]->(e:Ethnicity)
    RETURN e.id as id, e.name as name, count(DISTINCT p) as count
    ORDER BY count DESC
    `,
    { treeId },
  );
  return results.map((r) => ({
    id: r.id,
    name: r.name,
    count: Number(r.count),
  }));
}

export async function listPlaces(
  treeId: string = DEFAULT_TREE_ID,
  type?: string,
): Promise<FilterResult[]> {
  const typeClause = type ? 'AND pl.type = $type' : '';
  const results = await executeQuery<{
    id: string;
    name: string;
    count: number;
  }>(
    `
    MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)-[:BORN_IN|DIED_IN|LIVED_IN]->(pl:Place)
    WHERE pl.id IS NOT NULL ${typeClause}
    RETURN pl.id as id, pl.name as name, count(DISTINCT p) as count
    ORDER BY count DESC
    LIMIT 100
    `,
    { treeId, type },
  );
  return results.map((r) => ({
    id: r.id,
    name: r.name,
    count: Number(r.count),
  }));
}

// ============================================
// Filter people by criteria
// ============================================

export async function filterByOccupation(
  occupationId: string,
  treeId: string = DEFAULT_TREE_ID,
): Promise<PersonSummary[]> {
  const results = await executeQuery<PersonSummary>(
    `
    MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)-[:HAD_OCCUPATION]->(o:Occupation {id: $occupationId})
    RETURN p.id as id, p.fullName as fullName, p.birthYear as birthYear, p.deathYear as deathYear
    ORDER BY p.birthYear
    `,
    { occupationId, treeId },
  );
  return results.map((r) => ({
    id: r.id,
    fullName: r.fullName,
    birthYear: r.birthYear ? Number(r.birthYear) : undefined,
    deathYear: r.deathYear ? Number(r.deathYear) : undefined,
  }));
}

export async function filterByReligion(
  religionId: string,
  treeId: string = DEFAULT_TREE_ID,
): Promise<PersonSummary[]> {
  const results = await executeQuery<PersonSummary>(
    `
    MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)-[:PRACTICED]->(r:Religion {id: $religionId})
    RETURN p.id as id, p.fullName as fullName, p.birthYear as birthYear, p.deathYear as deathYear
    ORDER BY p.birthYear
    `,
    { religionId, treeId },
  );
  return results.map((r) => ({
    id: r.id,
    fullName: r.fullName,
    birthYear: r.birthYear ? Number(r.birthYear) : undefined,
    deathYear: r.deathYear ? Number(r.deathYear) : undefined,
  }));
}

export async function filterByWar(
  warId: string,
  treeId: string = DEFAULT_TREE_ID,
): Promise<PersonSummary[]> {
  const results = await executeQuery<PersonSummary>(
    `
    MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)-[:SERVED_IN]->(w:War {id: $warId})
    RETURN p.id as id, p.fullName as fullName, p.birthYear as birthYear, p.deathYear as deathYear
    ORDER BY p.birthYear
    `,
    { warId, treeId },
  );
  return results.map((r) => ({
    id: r.id,
    fullName: r.fullName,
    birthYear: r.birthYear ? Number(r.birthYear) : undefined,
    deathYear: r.deathYear ? Number(r.deathYear) : undefined,
  }));
}

export async function filterByLegalStatus(
  statusId: string,
  treeId: string = DEFAULT_TREE_ID,
): Promise<PersonSummary[]> {
  const results = await executeQuery<PersonSummary>(
    `
    MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)-[:HAD_STATUS]->(l:LegalStatus {id: $statusId})
    RETURN p.id as id, p.fullName as fullName, p.birthYear as birthYear, p.deathYear as deathYear
    ORDER BY p.birthYear
    `,
    { statusId, treeId },
  );
  return results.map((r) => ({
    id: r.id,
    fullName: r.fullName,
    birthYear: r.birthYear ? Number(r.birthYear) : undefined,
    deathYear: r.deathYear ? Number(r.deathYear) : undefined,
  }));
}

export async function filterByEthnicity(
  ethnicityId: string,
  treeId: string = DEFAULT_TREE_ID,
): Promise<PersonSummary[]> {
  const results = await executeQuery<PersonSummary>(
    `
    MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)-[:OF_ETHNICITY]->(e:Ethnicity {id: $ethnicityId})
    RETURN p.id as id, p.fullName as fullName, p.birthYear as birthYear, p.deathYear as deathYear
    ORDER BY p.birthYear
    `,
    { ethnicityId, treeId },
  );
  return results.map((r) => ({
    id: r.id,
    fullName: r.fullName,
    birthYear: r.birthYear ? Number(r.birthYear) : undefined,
    deathYear: r.deathYear ? Number(r.deathYear) : undefined,
  }));
}

export async function filterByPlace(
  placeId: string,
  treeId: string = DEFAULT_TREE_ID,
): Promise<PersonSummary[]> {
  const results = await executeQuery<PersonSummary>(
    `
    MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)-[:BORN_IN|DIED_IN|LIVED_IN]->(pl:Place {id: $placeId})
    RETURN DISTINCT p.id as id, p.fullName as fullName, p.birthYear as birthYear, p.deathYear as deathYear
    ORDER BY p.birthYear
    `,
    { placeId, treeId },
  );
  return results.map((r) => ({
    id: r.id,
    fullName: r.fullName,
    birthYear: r.birthYear ? Number(r.birthYear) : undefined,
    deathYear: r.deathYear ? Number(r.deathYear) : undefined,
  }));
}

export async function filterByTimePeriod(
  fromYear: number,
  toYear: number,
  treeId: string = DEFAULT_TREE_ID,
): Promise<PersonSummary[]> {
  const results = await executeQuery<PersonSummary>(
    `
    MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
    WHERE (p.birthYear >= $fromYear AND p.birthYear <= $toYear)
       OR (p.deathYear >= $fromYear AND p.deathYear <= $toYear)
       OR (p.birthYear <= $fromYear AND (p.deathYear >= $toYear OR p.deathYear IS NULL))
    RETURN p.id as id, p.fullName as fullName, p.birthYear as birthYear, p.deathYear as deathYear
    ORDER BY p.birthYear
    `,
    { fromYear, toYear, treeId },
  );
  return results.map((r) => ({
    id: r.id,
    fullName: r.fullName,
    birthYear: r.birthYear ? Number(r.birthYear) : undefined,
    deathYear: r.deathYear ? Number(r.deathYear) : undefined,
  }));
}

// ============================================
// Get person timeline
// ============================================

export interface TimelineEvent {
  year?: number;
  date?: string;
  type: string;
  description: string;
  place?: string;
  lat?: number;
  lng?: number;
}

export async function getPersonTimeline(
  personId: string,
  treeId: string = DEFAULT_TREE_ID,
): Promise<TimelineEvent[]> {
  const results = await executeQuery<{
    birthYear: number;
    deathYear: number;
    birthPlace: string;
    deathPlace: string;
    burialPlace: string;
    birthLat: number | null;
    birthLng: number | null;
    deathLat: number | null;
    deathLng: number | null;
    burialLat: number | null;
    burialLng: number | null;
    immigrations: Array<{
      year: number;
      fromPlace: string;
      toPlace: string;
      ship: string;
      lat: number | null;
      lng: number | null;
    }>;
    occupations: Array<{ title: string; fromYear: number; toYear: number }>;
    wars: Array<{
      name: string;
      fromYear: number;
      toYear: number;
      unit: string;
    }>;
    religions: Array<{ name: string; convertedYear: number }>;
    lifeEvents: Array<{
      event: string;
      year: number;
      place: string | null;
      lat: number | null;
      lng: number | null;
      source: string | null;
    }>;
    marriages: Array<{
      year: number | null;
      date: string | null;
      place: string | null;
      lat: number | null;
      lng: number | null;
    }>;
  }>(
    `
    MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person {id: $personId})

    OPTIONAL MATCH (p)-[:BORN_IN]->(bp:Place)
    OPTIONAL MATCH (p)-[:DIED_IN]->(dp:Place)
    OPTIONAL MATCH (p)-[:BURIED_IN]->(burialPlace:Place)
    OPTIONAL MATCH (p)-[immRel:IMMIGRATED_TO]->(immPlace:Place)
    OPTIONAL MATCH (p)-[occRel:HAD_OCCUPATION]->(occ:Occupation)
    OPTIONAL MATCH (p)-[warRel:SERVED_IN]->(war:War)
    OPTIONAL MATCH (p)-[relRel:PRACTICED]->(rel:Religion)
    OPTIONAL MATCH (p)-[:EXPERIENCED]->(le:LifeEvent)
    OPTIONAL MATCH (le)-[:OCCURRED_AT]->(lep:Place)
    OPTIONAL MATCH (p)-[marRel:MARRIED_AT]->(mp:Place)

    RETURN
      p.birthYear as birthYear,
      p.deathYear as deathYear,
      bp.name as birthPlace,
      dp.name as deathPlace,
      burialPlace.name as burialPlace,
      bp.latitude as birthLat,
      bp.longitude as birthLng,
      dp.latitude as deathLat,
      dp.longitude as deathLng,
      burialPlace.latitude as burialLat,
      burialPlace.longitude as burialLng,
      collect(DISTINCT CASE WHEN immRel IS NOT NULL THEN {
        year: immRel.year,
        fromPlace: immRel.fromPlace,
        toPlace: immPlace.name,
        ship: immRel.ship,
        lat: immPlace.latitude,
        lng: immPlace.longitude
      } ELSE null END) as immigrations,
      collect(DISTINCT CASE WHEN occRel IS NOT NULL THEN {
        title: occ.title,
        fromYear: occRel.fromYear,
        toYear: occRel.toYear
      } ELSE null END) as occupations,
      collect(DISTINCT CASE WHEN warRel IS NOT NULL THEN {
        name: war.name,
        fromYear: warRel.fromYear,
        toYear: warRel.toYear,
        unit: warRel.unit
      } ELSE null END) as wars,
      collect(DISTINCT CASE WHEN relRel IS NOT NULL THEN {
        name: rel.name,
        convertedYear: relRel.convertedYear
      } ELSE null END) as religions,
      collect(DISTINCT CASE WHEN le IS NOT NULL THEN {
        event: le.event,
        year: le.yearInt,
        place: lep.name,
        lat: lep.latitude,
        lng: lep.longitude,
        source: le.source
      } ELSE null END) as lifeEvents,
      collect(DISTINCT CASE WHEN marRel IS NOT NULL THEN {
        year: marRel.marriageYear,
        date: marRel.marriageDate,
        place: mp.name,
        lat: mp.latitude,
        lng: mp.longitude
      } ELSE null END) as marriages
    `,
    { personId, treeId },
  );

  if (results.length === 0) return [];

  const row = results[0];
  const events: TimelineEvent[] = [];

  // Birth
  if (row.birthYear) {
    events.push({
      year: Number(row.birthYear),
      type: 'birth',
      description: 'Born',
      place: row.birthPlace,
      lat: row.birthLat ?? undefined,
      lng: row.birthLng ?? undefined,
    });
  }

  // Immigrations
  for (const imm of row.immigrations.filter((i) => i !== null)) {
    events.push({
      year: imm.year ? Number(imm.year) : undefined,
      type: 'immigration',
      description: `Immigrated from ${imm.fromPlace || 'unknown'} to ${imm.toPlace}${imm.ship ? ` aboard ${imm.ship}` : ''}`,
      place: imm.toPlace,
      lat: imm.lat ?? undefined,
      lng: imm.lng ?? undefined,
    });
  }

  // Occupations
  for (const occ of row.occupations.filter((o) => o !== null)) {
    if (occ.fromYear) {
      events.push({
        year: Number(occ.fromYear),
        type: 'occupation',
        description: `Began working as ${occ.title}`,
      });
    }
  }

  // Military service
  for (const war of row.wars.filter((w) => w !== null)) {
    if (war.fromYear) {
      events.push({
        year: Number(war.fromYear),
        type: 'military',
        description: `Served in ${war.name}${war.unit ? ` with ${war.unit}` : ''}`,
      });
    }
  }

  // Religious conversion
  for (const rel of row.religions.filter((r) => r !== null)) {
    if (rel.convertedYear) {
      events.push({
        year: Number(rel.convertedYear),
        type: 'religion',
        description: `Converted to ${rel.name}`,
      });
    }
  }

  // Life events (census records, residences, etc.)
  for (const le of row.lifeEvents.filter((e) => e !== null)) {
    events.push({
      year: le.year ? Number(le.year) : undefined,
      type: 'life_event',
      description: le.event,
      place: le.place ?? undefined,
      lat: le.lat ?? undefined,
      lng: le.lng ?? undefined,
    });
  }

  // Marriages
  for (const mar of row.marriages.filter((m) => m !== null)) {
    events.push({
      year: mar.year ? Number(mar.year) : undefined,
      date: mar.date ?? undefined,
      type: 'marriage',
      description: 'Married',
      place: mar.place ?? undefined,
      lat: mar.lat ?? undefined,
      lng: mar.lng ?? undefined,
    });
  }

  // Death
  if (row.deathYear) {
    events.push({
      year: Number(row.deathYear),
      type: 'death',
      description: 'Died',
      place: row.deathPlace,
      lat: row.deathLat ?? undefined,
      lng: row.deathLng ?? undefined,
    });
  }

  // Burial
  if (row.burialPlace) {
    events.push({
      year: row.deathYear ? Number(row.deathYear) : undefined,
      type: 'burial',
      description: 'Buried',
      place: row.burialPlace,
      lat: row.burialLat ?? undefined,
      lng: row.burialLng ?? undefined,
    });
  }

  // Sort by year, then by event type priority for same-year events
  const typePriority: Record<string, number> = {
    birth: 0,
    immigration: 1,
    life_event: 2,
    occupation: 3,
    religion: 4,
    marriage: 5,
    military: 6,
    death: 7,
    burial: 8,
  };
  const effectivePriority = (e: TimelineEvent): number => {
    // Life events with "Died" or "Buried" descriptions should sort like death/burial
    if (e.type === 'life_event') {
      const desc = e.description.toLowerCase();
      if (desc === 'died' || desc.startsWith('died '))
        return typePriority.death;
      if (desc === 'buried' || desc.startsWith('buried '))
        return typePriority.burial;
    }
    return typePriority[e.type] ?? 5;
  };
  return events.sort((a, b) => {
    const yearDiff = (a.year || 0) - (b.year || 0);
    if (yearDiff !== 0) return yearDiff;
    return effectivePriority(a) - effectivePriority(b);
  });
}

// ============================================
// Graph stats
// ============================================

export interface GraphStats {
  persons: number;
  places: number;
  occupations: number;
  religions: number;
  wars: number;
  legalStatuses: number;
  ethnicities: number;
  relationships: {
    parentChild: number;
    spouse: number;
    bornIn: number;
    diedIn: number;
    hadOccupation: number;
    practiced: number;
    servedIn: number;
    hadStatus: number;
    ofEthnicity: number;
  };
}

async function fetchGraphStats(
  treeId: string = DEFAULT_TREE_ID,
): Promise<GraphStats> {
  const results = await executeQuery<GraphStats>(
    `
    // Count persons - try Tree relationship first, fall back to all Person nodes
    OPTIONAL MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(tp:Person)
    WITH count(DISTINCT tp) as treePersons
    OPTIONAL MATCH (ap:Person)
    WITH treePersons, count(DISTINCT ap) as allPersons
    WITH CASE WHEN treePersons > 0 THEN treePersons ELSE allPersons END as persons

    OPTIONAL MATCH (:Place) WITH persons, count(*) as places
    OPTIONAL MATCH (:Occupation) WITH persons, places, count(*) as occupations
    OPTIONAL MATCH (:Religion) WITH persons, places, occupations, count(*) as religions
    OPTIONAL MATCH (:War) WITH persons, places, occupations, religions, count(*) as wars
    OPTIONAL MATCH (:LegalStatus) WITH persons, places, occupations, religions, wars, count(*) as legalStatuses
    OPTIONAL MATCH (:Ethnicity) WITH persons, places, occupations, religions, wars, legalStatuses, count(*) as ethnicities

    OPTIONAL MATCH ()-[pc:PARENT_OF]->() WITH persons, places, occupations, religions, wars, legalStatuses, ethnicities, count(pc) as parentChild
    OPTIONAL MATCH ()-[sp:SPOUSE_OF]->() WITH persons, places, occupations, religions, wars, legalStatuses, ethnicities, parentChild, count(sp) as spouse
    OPTIONAL MATCH ()-[bi:BORN_IN]->() WITH persons, places, occupations, religions, wars, legalStatuses, ethnicities, parentChild, spouse, count(bi) as bornIn
    OPTIONAL MATCH ()-[di:DIED_IN]->() WITH persons, places, occupations, religions, wars, legalStatuses, ethnicities, parentChild, spouse, bornIn, count(di) as diedIn
    OPTIONAL MATCH ()-[ho:HAD_OCCUPATION]->() WITH persons, places, occupations, religions, wars, legalStatuses, ethnicities, parentChild, spouse, bornIn, diedIn, count(ho) as hadOccupation
    OPTIONAL MATCH ()-[pr:PRACTICED]->() WITH persons, places, occupations, religions, wars, legalStatuses, ethnicities, parentChild, spouse, bornIn, diedIn, hadOccupation, count(pr) as practiced
    OPTIONAL MATCH ()-[si:SERVED_IN]->() WITH persons, places, occupations, religions, wars, legalStatuses, ethnicities, parentChild, spouse, bornIn, diedIn, hadOccupation, practiced, count(si) as servedIn
    OPTIONAL MATCH ()-[hs:HAD_STATUS]->() WITH persons, places, occupations, religions, wars, legalStatuses, ethnicities, parentChild, spouse, bornIn, diedIn, hadOccupation, practiced, servedIn, count(hs) as hadStatus
    OPTIONAL MATCH ()-[oe:OF_ETHNICITY]->() WITH persons, places, occupations, religions, wars, legalStatuses, ethnicities, parentChild, spouse, bornIn, diedIn, hadOccupation, practiced, servedIn, hadStatus, count(oe) as ofEthnicity

    RETURN {
      persons: persons,
      places: places,
      occupations: occupations,
      religions: religions,
      wars: wars,
      legalStatuses: legalStatuses,
      ethnicities: ethnicities,
      relationships: {
        parentChild: parentChild,
        spouse: spouse,
        bornIn: bornIn,
        diedIn: diedIn,
        hadOccupation: hadOccupation,
        practiced: practiced,
        servedIn: servedIn,
        hadStatus: hadStatus,
        ofEthnicity: ofEthnicity
      }
    } as stats
    `,
    { treeId },
  );

  const first = results[0] as unknown as { stats?: GraphStats } | undefined;
  return first?.stats ?? (results[0] as unknown as GraphStats);
}

/**
 * Whole-tree aggregate stats. Cached (shared Redis graph cache): identical for
 * every user and rebuildable, so safe to memoize. Used by `/api/stats`.
 */
export const getGraphStats = cacheGraphRead(fetchGraphStats, ['graph-stats']);
