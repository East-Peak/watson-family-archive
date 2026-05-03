import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  getPersonById,
  getEnrichedPerson,
  getPersonTimeline,
  getPeopleBySurname,
  getPersonContextualMedia,
} from '@/lib/neo4j';
import type {
  Biography,
  FamilyRelationships,
  Individual,
  Journey,
  ParsedSource,
  PersonProfile,
  Photo,
  PhotosJson,
  SurnameMatch,
} from '@/types/person';
import { getPersonRecords, getRecordsByIds } from '@/lib/neo4j/queries/records';
import type { RecordNodeResult } from '@/lib/neo4j/queries/records';

let photosCachePromise: Promise<PhotosJson> | null = null;

async function readPhotosJson(): Promise<PhotosJson> {
  if (!photosCachePromise) {
    const filePath = path.join(process.cwd(), 'public', 'data', 'photos.json');
    photosCachePromise = readFile(filePath, 'utf-8').then((contents) => JSON.parse(contents) as PhotosJson);
  }

  return photosCachePromise;
}

const EMPTY_PHOTOS_JSON: PhotosJson = {
  photos: [],
  byPerson: {},
};

/**
 * Merge Record node data into ParsedSource entries.
 * Matches by record_id. Unmatched records are appended as new entries.
 * Deduplicates sources by record_id (keeps first occurrence).
 */
export function mergeRecordData(
  sources: ParsedSource[],
  records: RecordNodeResult[]
): ParsedSource[] {
  const recordMap = new Map(records.map((r) => [r.record.id, r]));
  const seenRecordIds = new Set<string>();

  const enrichSource = (source: ParsedSource, match: RecordNodeResult): ParsedSource => ({
    ...source,
    participants: match.participants.map((p) => ({
      name: p.name,
      role: p.role ?? undefined,
      age: p.age ?? undefined,
      occupation: p.occupation ?? undefined,
      birthplace: p.birthplace ?? undefined,
    })),
    details: match.record.place ? { place: match.record.place } : undefined,
    evidenceClass: match.record.evidenceClass ?? undefined,
    tier: match.record.tier ?? undefined,
  });

  const merged: ParsedSource[] = [];

  for (const source of sources) {
    // Dedupe by record_id
    if (source.record_id) {
      if (seenRecordIds.has(source.record_id)) continue;
      seenRecordIds.add(source.record_id);
    }

    const match = source.record_id ? recordMap.get(source.record_id) : undefined;
    merged.push(match ? enrichSource(source, match) : source);
  }

  // Append records not matched to any existing source
  for (const [id, rec] of recordMap) {
    if (seenRecordIds.has(id)) continue;
    seenRecordIds.add(id);
    const base: ParsedSource = {
      collection: rec.record.collection,
      provider: rec.record.provider,
      url: rec.record.ark,
      recordType: rec.record.type,
      year: rec.record.year,
      keyFacts: [],
      imageUrl: null,
      added: null,
      record_id: rec.record.id,
    };
    merged.push(enrichSource(base, rec));
  }

  return merged;
}

export async function buildPersonProfile(personId: string, treeId: string): Promise<PersonProfile | null> {
  const [personData, enrichedData, timelineData, contextualMedia, photosData, personRecords] = await Promise.all([
    getPersonById(personId, treeId),
    getEnrichedPerson(personId, treeId),
    getPersonTimeline(personId, treeId),
    getPersonContextualMedia(personId).catch(() => []),
    readPhotosJson().catch(() => EMPTY_PHOTOS_JSON),
    getPersonRecords(personId, treeId).catch(() => []),
  ]);

  if (!personData) {
    return null;
  }

  const surnameMatchesRaw = personData.surname
    ? await getPeopleBySurname(personData.surname, treeId, 8, personId)
    : [];

  const person: Individual = {
    id: personData.id,
    gedcomId: personData.gedcomId || '',
    fullName: personData.fullName,
    givenName: personData.givenName || '',
    surname: personData.surname || '',
    suffix: personData.suffix || null,
    nickname: personData.nickname || null,
    title: personData.title || null,
    sex: personData.sex || 'U',
    birthDate: personData.birthDate || null,
    birthYear: personData.birthYear || null,
    birthPlace: personData.birthPlace || enrichedData?.birthPlaceName || null,
    birthCoords: null,
    deathDate: personData.deathDate || null,
    deathYear: personData.deathYear || null,
    deathPlace: personData.deathPlace || enrichedData?.deathPlaceName || null,
    deathCoords: null,
    isLiving: personData.isLiving ?? false,
    isDirectAncestor: false,
    generation: null,
    verificationStatus: personData.verificationStatus || null,
    confidenceGrade: personData.confidenceGrade || null,
    wikitreeId: personData.wikitreeId || null,
    findagraveId: personData.findagraveId || null,
    familysearchTreeId: enrichedData?.familysearchTreeId || personData?.familysearchTreeId || null,
  };

  const family: FamilyRelationships = {
    id: personData.id,
    name: personData.fullName,
    father: personData.father
      ? { id: personData.father.id, name: personData.father.name, birthYear: personData.father.birthYear || null }
      : null,
    mother: personData.mother
      ? { id: personData.mother.id, name: personData.mother.name, birthYear: personData.mother.birthYear || null }
      : null,
    spouses: (personData.spouses || []).map((spouse) => ({
      id: spouse.id,
      name: spouse.name,
      birthYear: spouse.birthYear || null,
      marriageDate: undefined,
      marriageYear: spouse.marriageYear,
    })),
    children: (personData.children || []).map((child) => ({
      id: child.id,
      name: child.name,
      birthYear: child.birthYear || null,
    })),
    siblings: (personData.siblings || []).map((sibling) => ({
      id: sibling.id,
      name: sibling.name,
      birthYear: sibling.birthYear || null,
    })),
  };

  const journeyRaw: Journey[] = timelineData
    .filter((event) => event.lat != null && event.lng != null)
    .map((event) => ({
      year: event.year || null,
      place: event.place || event.description,
      city: null,
      state: null,
      country: null,
      lat: event.lat ?? null,
      lng: event.lng ?? null,
      source: null,
      occupation: event.type === 'occupation'
        ? event.description.replace('Began working as ', '')
        : null,
    }));

  // Deduplicate journey stops by coordinates + year to avoid stacked pins
  const seenStops = new Set<string>();
  const journey: Journey[] = journeyRaw.filter((stop) => {
    const key = `${stop.lat?.toFixed(4)},${stop.lng?.toFixed(4)},${stop.year}`;
    if (seenStops.has(key)) return false;
    seenStops.add(key);
    return true;
  });

  const biography: Biography | null = enrichedData
    ? {
        notes: enrichedData.markdownContent ? [enrichedData.markdownContent] : [],
        occupations: enrichedData.occupations?.map((occupation) => occupation.title) || [],
        timelineHighlights: timelineData.length > 0
          ? timelineData.map((event) => ({
              year: event.year || 0,
              event: event.description,
              location: event.place || '',
            }))
          : [],
        verifiedFacts: [],
        keySources: [],
        externalLinks: [],
      }
    : null;

  const photoIndices = photosData.byPerson[personId] || [];
  const photos: Photo[] = photoIndices
    .map((index) => photosData.photos?.[index])
    .filter((photo): photo is Photo => photo !== undefined)
    .map((photo) => ({
      filename: photo.filename,
      path: photo.path,
      type: photo.type,
      isPortrait: photo.isPortrait,
      caption: photo.caption ?? '',
      date: photo.date ?? '',
      people: photo.people,
    }));

  const surnameMatches: SurnameMatch[] = surnameMatchesRaw.map((match) => ({
    id: match.id,
    fullName: match.fullName,
    givenName: match.givenName,
    surname: match.surname,
    birthYear: match.birthYear,
    deathYear: match.deathYear,
  }));

  return {
    person,
    family,
    journey,
    biography,
    photos,
    surnameMatches,
    contextualMedia,
    markdownContent: enrichedData?.markdownContent || null,
    narrativeBio: enrichedData?.biography || null,
    bioTier: enrichedData?.bioTier || null,
    sources: await (async () => {
      try {
        const raw = enrichedData?.sources;
        const parsed = raw ? JSON.parse(raw) : [];
        const baseSources: ParsedSource[] = parsed.map((s: Record<string, unknown>) => ({
          collection: (s.collection as string) ?? '',
          provider: (s.provider as string) ?? 'familysearch',
          url: (s.url as string) ?? (s.ark as string) ?? null,
          recordType: (s.recordType as string) ?? (s.record_type as string) ?? 'other',
          year: (s.year as number) ?? null,
          keyFacts: (s.keyFacts as string[]) ?? (s.key_facts as string[]) ?? [],
          imageUrl: (s.imageUrl as string) ?? (s.image_url as string) ?? null,
          added: (s.added as string) ?? null,
          record_id: (s.record_id as string) ?? undefined,
        }));

        // Start with EVIDENCED_BY records, then fetch any remaining by record_id
        const records = [...personRecords];
        const coveredIds = new Set(records.map((r) => r.record.id));
        const missingIds = baseSources
          .map((s) => s.record_id)
          .filter((id): id is string => id != null && !coveredIds.has(id));
        if (missingIds.length > 0) {
          const fallbackRecords = await getRecordsByIds(missingIds).catch(() => []);
          records.push(...fallbackRecords);
        }

        return mergeRecordData(baseSources, records);
      } catch { return []; }
    })(),
  };
}
