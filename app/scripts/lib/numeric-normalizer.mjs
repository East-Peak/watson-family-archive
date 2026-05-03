/**
 * Parse a loose integer-like value into a real integer.
 *
 * Accepts numbers and strings like "84", "84 years", or "~1915".
 * Placeholder values like "-", "—", or "" return null.
 *
 * @param {unknown} value
 * @returns {number|null}
 */
export function parseLooseInteger(value) {
  if (value === null || value === undefined) return null;

  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.trunc(value) : null;
  }

  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed || trimmed === '-' || trimmed === '—') return null;

  const match = trimmed.match(/\d+/);
  return match ? parseInt(match[0], 10) : null;
}
