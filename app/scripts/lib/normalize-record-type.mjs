/**
 * Normalizes record type strings to canonical form.
 *
 * Canonical types: census, death, birth, marriage, burial, military,
 * immigration, obituary, other
 */

/** @type {Map<string, string>} */
const RECORD_TYPE_MAP = new Map([
  // Census variants
  ['census, household member', 'census'],
  ['census enumeration', 'census'],
  ['census, household', 'census'],
  ['census (head-of-household only)', 'census'],
  ['census, u.s. federal', 'census'],
  ['household record', 'census'],
  ['state census', 'census'],

  // Death variants
  ['death index', 'death'],
  ['death_index', 'death'],
  ['death (ssdi)', 'death'],
  ['ssdi', 'death'],
  ['social_security', 'death'],
  ['death registration index', 'death'],
  ['death vital record', 'death'],
  ['death/social program correspondence', 'death'],
  ['death (mentioned in record of son)', 'death'],

  // Burial variants
  ['burial/death', 'burial'],
  ['death/burial', 'burial'],
  ['burial/death index', 'burial'],

  // Birth variants
  ['vital record (birth registration)', 'birth'],
  ['birth certificate', 'birth'],

  // Marriage variants
  ['parish marriage register', 'marriage'],

  // Obituary variants
  ["obituary (husband's)", 'obituary'],

  // Other
  ['social_program', 'other'],
  ['residence', 'other'],
]);

const CANONICAL_TYPES = new Set([
  'census', 'death', 'birth', 'marriage', 'burial',
  'military', 'immigration', 'obituary', 'other',
]);

/**
 * Maps a raw record type string to its canonical form.
 *
 * @param {string|null|undefined} rawType
 * @returns {string} Canonical record type
 */
export function normalizeRecordType(rawType) {
  if (!rawType) return 'other';

  const lower = rawType.toLowerCase().trim();
  if (!lower) return 'other';

  // Direct canonical match
  if (CANONICAL_TYPES.has(lower)) return lower;

  // Explicit mapping
  if (RECORD_TYPE_MAP.has(lower)) return RECORD_TYPE_MAP.get(lower);

  // Prefix matching: anything starting with "census" → census, etc.
  if (lower.startsWith('census')) return 'census';
  if (lower.startsWith('death')) return 'death';
  if (lower.startsWith('burial')) return 'burial';
  if (lower.startsWith('obituary')) return 'obituary';

  return rawType;
}
