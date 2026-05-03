/**
 * record-id.mjs
 *
 * Normalizes ARK identifiers (FamilySearch and other providers) to canonical
 * record_id strings used as filenames in data/records/.
 */

/** Standard FamilySearch ARK prefix components. */
const FS_NAAN = '61903';
const FS_QUALIFIER = '1:1';
const FS_PREFIX = `${FS_NAAN}-${FS_QUALIFIER.replace(/:/g, '-')}`;

/**
 * A short-form FamilySearch record ID looks like "V198-JW3" or "SG5S-5G2":
 *   - First segment: 4 alphanumeric chars
 *   - Dash
 *   - Second segment: 3–4 alphanumeric chars
 * Both segments are uppercase alphanumeric only.
 */
const SHORT_FORM_PATTERN = /^[A-Z0-9]{4}-[A-Z0-9]{3,4}$/i;

/**
 * Match the canonical FS long-form ARK structure (NAAN/Q1:Q2:SHORT-FORM)
 * anywhere in a string. The trailing \b word boundary stops matching at
 * the end of the short-form ID, so trailing free-text annotations like
 * " (head — Sulvester)" are excluded from the captured ARK.
 *
 * Capture groups: 1=NAAN, 2=qualifier1, 3=qualifier2, 4=short-form ID
 */
const LONG_FORM_PATTERN =
  /(\d+)\/(\d+):(\d+):([A-Z0-9]{4}-[A-Z0-9]{3,4})\b/i;

/**
 * Normalize an ARK identifier to a canonical record_id string.
 *
 * Handles:
 *   - Full FamilySearch URL: https://www.familysearch.org/ark:/61903/1:1:SG5S-5G2
 *   - Path-only ARK:         /ark:/61903/1:1:MMKV-FKY
 *   - Short-form record ID:  V198-JW3  (prepends standard FS prefix)
 *   - Non-FS provider:       arkToRecordId('12345678', 'findagrave') → 'findagrave-12345678'
 *
 * Returns null for empty, null, undefined, or placeholder inputs.
 *
 * @param {string|null|undefined} ark - The ARK or record identifier to normalize.
 * @param {string} [provider] - Optional provider name (e.g. 'findagrave'). When
 *   supplied, the result is prefixed with the provider slug rather than the FS NAAN.
 * @returns {string|null} Canonical record_id, or null if the input is invalid.
 */
export function arkToRecordId(ark, provider) {
  // Reject empty / null / undefined
  if (ark == null || ark === '') return null;
  if (typeof ark !== 'string') return null;

  const trimmed = ark.trim();
  if (!trimmed) return null;

  // Reject pure placeholder strings (free-text descriptions in parentheses).
  if (trimmed.startsWith('(')) return null;

  // Non-FamilySearch provider: sanitize the raw ID.
  if (provider && provider !== 'familysearch') {
    const sanitized = trimmed.replace(/[/:]/g, '-');
    return `${provider}-${sanitized}`;
  }

  // FamilySearch long-form: extract the canonical NAAN/Q1:Q2:SHORT-FORM
  // structure from anywhere in the input. The \b in LONG_FORM_PATTERN
  // ensures trailing free-text (e.g. "(head — Sulvester)") is excluded.
  const longFormMatch = trimmed.match(LONG_FORM_PATTERN);
  if (longFormMatch) {
    const [, naan, q1, q2, shortForm] = longFormMatch;
    return `${naan}-${q1}-${q2}-${shortForm.toUpperCase()}`;
  }

  // Short-form bare ID: "V198-JW3". Must match the whole trimmed string —
  // surrounding context disqualifies it (use long-form for that case).
  if (SHORT_FORM_PATTERN.test(trimmed)) {
    return `${FS_PREFIX}-${trimmed.toUpperCase()}`;
  }

  return null;
}

/**
 * Convert a canonical record_id to a filename by appending ".md".
 *
 * @param {string} recordId - The canonical record ID (e.g. "61903-1-1-SG5S-5G2").
 * @returns {string} The corresponding filename (e.g. "61903-1-1-SG5S-5G2.md").
 */
export function recordIdToFilename(recordId) {
  return `${recordId}.md`;
}
