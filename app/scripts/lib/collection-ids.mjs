/**
 * Resolves well-known genealogical collection names to their canonical IDs.
 *
 * Known mappings:
 *   SSDI / Social Security Death Index / SS Death Index → "1202535"
 *   Find a Grave / Find a Grave Index / findagrave      → "2075263"
 *   obituary / obituary collections / obituaries        → "obituary"
 *
 * All matching is case-insensitive. Unknown collection names are converted to
 * lowercase with spaces replaced by underscores.
 */

/** @type {Array<{ patterns: string[], id: string }>} */
const KNOWN_COLLECTIONS = [
  {
    patterns: ['ssdi', 'social security death index', 'ss death index'],
    id: '1202535',
  },
  {
    patterns: ['find a grave', 'find a grave index', 'findagrave'],
    id: '2075263',
  },
  {
    patterns: ['obituary', 'obituary collections', 'obituaries'],
    id: 'obituary',
  },
];

/**
 * Resolves a collection name to a canonical collection ID.
 *
 * @param {string} collectionName - The raw collection name from a finding file.
 * @returns {string} The resolved collection ID, or a slugified fallback for
 *   unknown collections.
 */
export function resolveCollectionId(collectionName) {
  const lower = collectionName.toLowerCase().trim();

  for (const { patterns, id } of KNOWN_COLLECTIONS) {
    if (patterns.includes(lower)) {
      return id;
    }
  }

  // Unknown collections: lowercase, spaces → underscores
  return lower.replace(/\s+/g, '_');
}
