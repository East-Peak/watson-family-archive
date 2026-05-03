/**
 * Infer evidence tier from canonical record type.
 *
 * Tier A: Government vital records (birth, death, marriage)
 * Tier B: Census, military, immigration, other government enumerations
 * Tier C: Church, land, probate, burial, other institutional records
 * Tier D: Published genealogies, obituaries
 * Tier E: User trees, unsourced assertions
 */

/** @type {Record<string, string>} */
const TYPE_TO_TIER = {
  birth: 'A',
  death: 'A',
  marriage: 'A',
  census: 'B',
  military: 'B',
  immigration: 'B',
  burial: 'C',
  other: 'C',
  obituary: 'D',
};

/**
 * @param {string|null|undefined} type — canonical record type
 * @returns {string|null} tier letter, or null if type is missing
 */
export function inferTierFromType(type) {
  if (!type) return null;
  return TYPE_TO_TIER[type] || 'C';
}
