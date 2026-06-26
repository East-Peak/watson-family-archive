import { executeQuery } from '@/lib/neo4j/client';
import { siteConfig } from '@/lib/siteConfig';
import type { GraphDictionaries } from './types';

const DEFAULT_TREE_ID = siteConfig.defaultTreeId;

// Cache is module-level (per serverless function instance).
// On Vercel: each cold start creates a fresh cache; warm instances reuse it.
// The 5-minute TTL is "best effort" — instances may recycle before TTL expires.
// This is fine: the dictionary queries are lightweight (~50ms on a 2,600-person tree).
let cachedDictionaries: GraphDictionaries | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getGraphDictionaries(): Promise<GraphDictionaries> {
  const now = Date.now();
  if (cachedDictionaries && now - cacheTimestamp < CACHE_TTL) {
    return cachedDictionaries;
  }

  const [surnameRows, placeRows, occupationRows] = await Promise.all([
    executeQuery<{ surname: string }>(
      `MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
       WHERE p.surname IS NOT NULL AND p.surname <> ''
       RETURN DISTINCT toLower(p.surname) as surname`,
      { treeId: DEFAULT_TREE_ID },
    ),
    executeQuery<{ name: string }>(
      `MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)-[:BORN_IN|DIED_IN|LIVED_IN]->(pl:Place)
       WHERE pl.name IS NOT NULL
       RETURN DISTINCT toLower(pl.name) as name`,
      { treeId: DEFAULT_TREE_ID },
    ),
    executeQuery<{ title: string }>(
      `MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)-[:HAD_OCCUPATION]->(o:Occupation)
       RETURN DISTINCT toLower(o.title) as title`,
      { treeId: DEFAULT_TREE_ID },
    ),
  ]);

  // Also add country names and place fragments for better matching
  const places = new Set<string>();
  for (const row of placeRows) {
    places.add(row.name);
    // Split on commas to get city/state/country fragments
    for (const part of row.name.split(',')) {
      const trimmed = part.trim().toLowerCase();
      if (trimmed.length > 2) places.add(trimmed);
    }
  }

  cachedDictionaries = {
    places,
    surnames: new Set(surnameRows.map((r) => r.surname)),
    occupations: new Set(occupationRows.map((r) => r.title)),
  };
  cacheTimestamp = now;

  return cachedDictionaries;
}
