/**
 * Normalizes legacy and variant search type labels to canonical form.
 *
 * Canonical types: census, death, marriage, burial, parents, source_assessment
 */

/** @type {Map<string, string>} */
const SEARCH_TYPE_MAP = new Map([
  ['death_record', 'death'],
  ['marriage_record', 'marriage'],
  ['find_parents', 'parents'],
  ['source-assessment', 'source_assessment'],
  ['memorial', 'burial'],
]);

/**
 * Maps a raw search type string to its canonical form.
 *
 * - Legacy labels (e.g. "death_record") are mapped to their canonical equivalents.
 * - Census variants ending in "_census" (e.g. "1880_census") normalize to "census".
 * - Already-canonical types (e.g. "death", "marriage") pass through unchanged.
 * - Unknown types pass through unchanged.
 *
 * @param {string} rawType - The raw search type from a finding file.
 * @returns {string} The canonical search type.
 */
export function normalizeSearchType(rawType) {
  if (SEARCH_TYPE_MAP.has(rawType)) {
    return SEARCH_TYPE_MAP.get(rawType);
  }

  if (rawType.endsWith('_census')) {
    return 'census';
  }

  return rawType;
}
