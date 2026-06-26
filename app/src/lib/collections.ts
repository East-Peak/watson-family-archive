import { executeQuery } from '@/lib/neo4j/client';
import { siteConfig } from '@/lib/siteConfig';

const TREE_ID = siteConfig.defaultTreeId;

export interface CollectionMeta {
  type: string;
  title: string;
  emoji: string;
  description: string;
  category: string;
  memberCount?: number;
}

export interface CollectionConfig {
  title: string;
  emoji: string;
  description: string;
  query: string;
  params?: Record<string, unknown>;
  category: 'heritage' | 'immigration' | 'era' | 'military' | 'thematic';
}

export interface CollectionPerson {
  id: string;
  fullName: string;
  birthYear?: number;
  deathYear?: number;
  birthPlace?: string;
  deathPlace?: string;
}

// Country/region patterns to match in birthPlace strings
export const COUNTRY_PATTERNS: Record<
  string,
  { label: string; emoji: string; patterns: string[] }
> = {
  wales: {
    label: 'Welsh',
    emoji: '\u{1F3F4}\u{E0067}\u{E0062}\u{E0077}\u{E006C}\u{E0073}\u{E007F}',
    patterns: ['Wales'],
  },
  england: {
    label: 'English',
    emoji: '\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}',
    patterns: ['England'],
  },
  scotland: {
    label: 'Scottish',
    emoji: '\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}',
    patterns: ['Scotland'],
  },
  ireland: {
    label: 'Irish',
    emoji: '\u{1F1EE}\u{1F1EA}',
    patterns: ['Ireland'],
  },
  germany: {
    label: 'German',
    emoji: '\u{1F1E9}\u{1F1EA}',
    patterns: ['Germany', 'Prussia', 'Bavaria', 'Saxony', 'Württemberg'],
  },
  switzerland: {
    label: 'Swiss',
    emoji: '\u{1F1E8}\u{1F1ED}',
    patterns: ['Switzerland'],
  },
  france: {
    label: 'French',
    emoji: '\u{1F1EB}\u{1F1F7}',
    patterns: ['France'],
  },
  netherlands: {
    label: 'Dutch',
    emoji: '\u{1F1F3}\u{1F1F1}',
    patterns: ['Netherlands', 'Holland'],
  },
};

// Thematic collections that don't depend on data distribution
const THEMATIC_COLLECTIONS: Record<string, CollectionConfig> = {
  'civil-war': {
    title: 'Civil War Generation',
    emoji: '\u{1F3BA}',
    description: 'Ancestors who lived through the American Civil War',
    category: 'era',
    query: `
      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
      WHERE p.birthYear IS NOT NULL AND p.birthYear >= 1820 AND p.birthYear <= 1850
      RETURN p.id as id, p.fullName as fullName, p.birthYear as birthYear,
             p.deathYear as deathYear, p.birthPlace as birthPlace, p.deathPlace as deathPlace
      ORDER BY p.birthYear
    `,
  },
  'colonial-era': {
    title: 'Colonial Era',
    emoji: '\u{1F3DB}\u{FE0F}',
    description: 'Ancestors born before American independence',
    category: 'era',
    query: `
      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
      WHERE p.birthYear IS NOT NULL AND p.birthYear < 1776
      RETURN p.id as id, p.fullName as fullName, p.birthYear as birthYear,
             p.deathYear as deathYear, p.birthPlace as birthPlace, p.deathPlace as deathPlace
      ORDER BY p.birthYear
    `,
  },
  longevity: {
    title: 'Long-Lived Ancestors',
    emoji: '\u{1F382}',
    description: 'Ancestors who lived past 90 years',
    category: 'thematic',
    query: `
      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
      WHERE p.birthYear IS NOT NULL AND p.deathYear IS NOT NULL
        AND (p.deathYear - p.birthYear) >= 90
      RETURN p.id as id, p.fullName as fullName, p.birthYear as birthYear,
             p.deathYear as deathYear, p.birthPlace as birthPlace, p.deathPlace as deathPlace
      ORDER BY (p.deathYear - p.birthYear) DESC
    `,
  },
  'large-families': {
    title: 'Large Families',
    emoji: '\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}\u{200D}\u{1F466}',
    description: 'Parents with 8 or more children',
    category: 'thematic',
    query: `
      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)-[:PARENT_OF]->(child:Person)
      WITH p, count(child) as childCount
      WHERE childCount >= 8
      RETURN p.id as id, p.fullName as fullName, p.birthYear as birthYear,
             p.deathYear as deathYear, p.birthPlace as birthPlace, p.deathPlace as deathPlace
      ORDER BY childCount DESC, p.birthYear
    `,
  },
  quakers: {
    title: 'Quaker Ancestors',
    emoji: '\u{269C}\u{FE0F}',
    description: 'Family members who followed the Religious Society of Friends',
    category: 'thematic',
    query: `
      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)-[:PRACTICED]->(r:Religion)
      WHERE toLower(r.name) CONTAINS 'quaker' OR toLower(r.name) CONTAINS 'society of friends'
      RETURN DISTINCT p.id as id, p.fullName as fullName, p.birthYear as birthYear,
             p.deathYear as deathYear, p.birthPlace as birthPlace, p.deathPlace as deathPlace
      ORDER BY p.birthYear
    `,
  },
  'wwii-veterans': {
    title: 'WWII Veterans',
    emoji: '\u{2B50}',
    description: 'Family members who served in World War II',
    category: 'military',
    query: `
      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)-[:SERVED_IN]->(w:War)
      WHERE toLower(w.name) CONTAINS 'world war ii' OR toLower(w.name) CONTAINS 'wwii'
      RETURN DISTINCT p.id as id, p.fullName as fullName, p.birthYear as birthYear,
             p.deathYear as deathYear, p.birthPlace as birthPlace, p.deathPlace as deathPlace
      ORDER BY p.birthYear
    `,
  },
  'wwi-veterans': {
    title: 'WWI Veterans',
    emoji: '\u{1F396}\u{FE0F}',
    description: 'Family members who served in the Great War',
    category: 'military',
    query: `
      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)-[:SERVED_IN]->(w:War)
      WHERE toLower(w.name) CONTAINS 'world war i' OR toLower(w.name) CONTAINS 'wwi'
            OR toLower(w.name) CONTAINS 'great war'
      RETURN DISTINCT p.id as id, p.fullName as fullName, p.birthYear as birthYear,
             p.deathYear as deathYear, p.birthPlace as birthPlace, p.deathPlace as deathPlace
      ORDER BY p.birthYear
    `,
  },
  'civil-war-veterans': {
    title: 'Civil War Veterans',
    emoji: '\u{1FA96}',
    description: 'Family members who served in the American Civil War',
    category: 'military',
    query: `
      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)-[:SERVED_IN]->(w:War)
      WHERE toLower(w.name) CONTAINS 'civil war'
      RETURN DISTINCT p.id as id, p.fullName as fullName, p.birthYear as birthYear,
             p.deathYear as deathYear, p.birthPlace as birthPlace, p.deathPlace as deathPlace
      ORDER BY p.birthYear
    `,
  },
  'revolutionary-war-veterans': {
    title: 'Revolutionary War Veterans',
    emoji: '\u{1F985}',
    description: 'Family members who served in the American Revolution',
    category: 'military',
    query: `
      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)-[:SERVED_IN]->(w:War)
      WHERE toLower(w.name) CONTAINS 'revolutionary' OR toLower(w.name) CONTAINS 'revolution'
      RETURN DISTINCT p.id as id, p.fullName as fullName, p.birthYear as birthYear,
             p.deathYear as deathYear, p.birthPlace as birthPlace, p.deathPlace as deathPlace
      ORDER BY p.birthYear
    `,
  },
  'military-service': {
    title: 'Military Service',
    emoji: '\u{1F396}\u{FE0F}',
    description: 'All ancestors who served in wartime',
    category: 'military',
    query: `
      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)-[:SERVED_IN]->(w:War)
      RETURN DISTINCT p.id as id, p.fullName as fullName, p.birthYear as birthYear,
             p.deathYear as deathYear, p.birthPlace as birthPlace, p.deathPlace as deathPlace
      ORDER BY p.birthYear
    `,
  },
};

// Build a heritage collection query for a given country
function buildHeritageQuery(patterns: string[]): string {
  const conditions = patterns
    .map((p) => `p.birthPlace CONTAINS '${p}'`)
    .join(' OR ');
  return `
    MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
    WHERE ${conditions}
    RETURN p.id as id, p.fullName as fullName, p.birthYear as birthYear,
           p.deathYear as deathYear, p.birthPlace as birthPlace, p.deathPlace as deathPlace
    ORDER BY p.birthYear
  `;
}

// Build an immigration collection query (born in X, died in US)
function buildImmigrationQuery(patterns: string[]): string {
  const birthConditions = patterns
    .map((p) => `p.birthPlace CONTAINS '${p}'`)
    .join(' OR ');
  return `
    MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
    WHERE (${birthConditions})
      AND p.deathPlace IS NOT NULL
      AND NOT (${patterns.map((p) => `p.deathPlace CONTAINS '${p}'`).join(' OR ')})
    RETURN p.id as id, p.fullName as fullName, p.birthYear as birthYear,
           p.deathYear as deathYear, p.birthPlace as birthPlace, p.deathPlace as deathPlace
    ORDER BY p.birthYear
  `;
}

/**
 * Discover which heritage/immigration collections have enough data to display.
 * Queries Neo4j once for country distribution, returns only collections with 3+ people.
 */
export async function discoverCollections(
  treeId?: string,
): Promise<Record<string, CollectionConfig>> {
  const resolvedTreeId = treeId ?? TREE_ID;
  const all: Record<string, CollectionConfig> = {};

  // Count people by birth country pattern
  const countQuery = `
    MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
    WHERE p.birthPlace IS NOT NULL
    RETURN p.birthPlace as birthPlace
  `;

  const results = await executeQuery<{ birthPlace: string }>(countQuery, {
    treeId: resolvedTreeId,
  });

  // Count matches per country
  const countryCounts: Record<string, number> = {};
  const immigrationCounts: Record<string, number> = {};

  for (const { birthPlace } of results) {
    for (const [key, config] of Object.entries(COUNTRY_PATTERNS)) {
      if (config.patterns.some((p) => birthPlace.includes(p))) {
        countryCounts[key] = (countryCounts[key] || 0) + 1;
      }
    }
  }

  // Also count immigration (born abroad, died elsewhere)
  const immigrationQuery = `
    MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
    WHERE p.birthPlace IS NOT NULL AND p.deathPlace IS NOT NULL
    RETURN p.birthPlace as birthPlace, p.deathPlace as deathPlace
  `;

  const immResults = await executeQuery<{
    birthPlace: string;
    deathPlace: string;
  }>(immigrationQuery, { treeId: resolvedTreeId });

  for (const { birthPlace, deathPlace } of immResults) {
    for (const [key, config] of Object.entries(COUNTRY_PATTERNS)) {
      const bornThere = config.patterns.some((p) => birthPlace.includes(p));
      const diedThere = config.patterns.some((p) => deathPlace.includes(p));
      if (bornThere && !diedThere) {
        immigrationCounts[key] = (immigrationCounts[key] || 0) + 1;
      }
    }
  }

  // Generate heritage collections for countries with 3+ people
  for (const [key, config] of Object.entries(COUNTRY_PATTERNS)) {
    const count = countryCounts[key] || 0;
    if (count >= 3) {
      all[`${key}-heritage`] = {
        title: `${config.label} Heritage`,
        emoji: config.emoji,
        description: `Ancestors born in ${config.patterns[0]}`,
        category: 'heritage',
        query: buildHeritageQuery(config.patterns),
      };
    }

    // Immigration collections for countries with 3+ immigrants
    const immCount = immigrationCounts[key] || 0;
    if (immCount >= 3) {
      all[`${key}-immigration`] = {
        title: `${config.patterns[0]} to America`,
        emoji: '\u{1F6A2}',
        description: `Ancestors who emigrated from ${config.patterns[0]}`,
        category: 'immigration',
        query: buildImmigrationQuery(config.patterns),
      };
    }
  }

  // Add all thematic collections
  Object.assign(all, THEMATIC_COLLECTIONS);

  return all;
}

// Backward-compatible aliases for old collection URLs
const ALIASES: Record<string, string> = {
  'welsh-heritage': 'wales-heritage',
  'welsh-immigration': 'wales-immigration',
  'english-heritage': 'england-heritage',
  'scottish-heritage': 'scotland-heritage',
  'irish-heritage': 'ireland-heritage',
  'german-heritage': 'germany-heritage',
  'gold-rush': 'colonial-era',
  'england-to-california': 'england-immigration',
};

/**
 * Get a specific collection config — tries discovered first, falls back to thematic.
 * Also supports dynamic surname collections (e.g. "surname-smith").
 */
export async function getCollection(
  type: string,
  treeId?: string,
): Promise<CollectionConfig | null> {
  // Resolve aliases
  const resolvedType = ALIASES[type] || type;

  // Check thematic first (no DB query needed)
  if (THEMATIC_COLLECTIONS[resolvedType])
    return THEMATIC_COLLECTIONS[resolvedType];

  // Dynamic surname collection: "surname-smith" → people with surname "Smith"
  const surnameMatch = type.match(/^surname-(.+)$/);
  if (surnameMatch) {
    const surname = surnameMatch[1];
    const displayName = surname.charAt(0).toUpperCase() + surname.slice(1);
    return {
      title: `The ${displayName} Line`,
      emoji: '\u{1F333}',
      description: `All ${displayName} ancestors in the family tree`,
      category: 'heritage',
      query: `
        MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
        WHERE toLower(p.surname) = toLower($surname)
        RETURN p.id as id, p.fullName as fullName, p.birthYear as birthYear,
               p.deathYear as deathYear, p.birthPlace as birthPlace, p.deathPlace as deathPlace
        ORDER BY CASE WHEN p.birthYear IS NULL THEN 1 ELSE 0 END, p.birthYear
      `,
      params: { surname },
    };
  }

  // Check if it's a heritage/immigration pattern
  const collections = await discoverCollections(treeId);
  return collections[resolvedType] || null;
}

/**
 * List all available collections, optionally with member counts.
 * Used by the home page to show collection cards.
 *
 * @param options.treeId - Override the default tree ID
 * @param options.includeCounts - When true, run a count query per collection and include
 *   `memberCount` on each result. Collections with zero members are omitted.
 *   When false (default), all discovered collections are returned without counts.
 */
export async function listCollections(options?: {
  treeId?: string;
  includeCounts?: boolean;
}): Promise<CollectionMeta[]> {
  const resolvedTreeId = options?.treeId ?? TREE_ID;
  const includeCounts = options?.includeCounts ?? false;

  const collections = await discoverCollections(resolvedTreeId);
  const results: CollectionMeta[] = [];

  for (const [type, config] of Object.entries(collections)) {
    if (includeCounts) {
      // Convert the member query to a count query by replacing everything from RETURN onwards
      const returnIdx = config.query.lastIndexOf('RETURN');
      if (returnIdx === -1) continue;
      const countQuery =
        config.query.substring(0, returnIdx) +
        'RETURN count(DISTINCT p) as count';
      const countResult = await executeQuery<{ count: number }>(countQuery, {
        treeId: resolvedTreeId,
        ...config.params,
      });
      const memberCount = countResult[0]?.count || 0;
      if (memberCount > 0) {
        results.push({
          type,
          title: config.title,
          emoji: config.emoji,
          description: config.description,
          category: config.category,
          memberCount,
        });
      }
    } else {
      results.push({
        type,
        title: config.title,
        emoji: config.emoji,
        description: config.description,
        category: config.category,
      });
    }
  }

  // Sort: heritage first (by memberCount desc), then immigration, then era, military, thematic
  const categoryOrder = {
    heritage: 0,
    immigration: 1,
    era: 2,
    military: 3,
    thematic: 4,
  };
  results.sort((a, b) => {
    const catDiff =
      (categoryOrder[a.category as keyof typeof categoryOrder] ?? 5) -
      (categoryOrder[b.category as keyof typeof categoryOrder] ?? 5);
    if (catDiff !== 0) return catDiff;
    return (b.memberCount ?? 0) - (a.memberCount ?? 0);
  });

  return results;
}
