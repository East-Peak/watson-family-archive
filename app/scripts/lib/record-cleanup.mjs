/**
 * Pure functions for record data cleanup.
 * Used by the one-time cleanup script and testable in isolation.
 */

import { normalizeRecordType } from './normalize-record-type.mjs';
import { inferTierFromType } from './infer-tier.mjs';

/**
 * Clean up a record's frontmatter: normalize type, infer missing tier.
 *
 * @param {object} fm - Record frontmatter
 * @returns {{ type: string, tier: string|null, changed: boolean }}
 */
export function cleanupRecordFrontmatter(fm) {
  let changed = false;

  const normalizedType = normalizeRecordType(fm.type);
  if (normalizedType !== fm.type) changed = true;

  let tier = fm.tier;
  if (!tier) {
    tier = inferTierFromType(normalizedType);
    if (tier) changed = true;
  }

  return { type: normalizedType, tier, changed };
}

/**
 * Try to match a person source entry to a record_id via its ARK URL.
 * Returns null if already has record_id, no URL, or no match.
 *
 * @param {object} source - Person source entry
 * @param {Map<string, string>} arkMap - Map of ARK URL → record_id
 * @returns {string|null} record_id or null
 */
export function matchArkToRecordId(source, arkMap) {
  if (source.record_id) return null;
  if (!source.url) return null;
  return arkMap.get(source.url) || null;
}
