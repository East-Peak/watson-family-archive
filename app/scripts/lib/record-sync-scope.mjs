/**
 * record-sync-scope.mjs
 *
 * Pure helpers for scoping record reconciliation/source sync commands.
 */

/**
 * Return whether the caller supplied an explicit record scope.
 *
 * @param {object} scope
 * @returns {boolean}
 */
export function hasExplicitRecordScope(scope = {}) {
  return Boolean(scope.allRecords || scope.type || scope.since);
}

/**
 * Require an explicit scope before syncing sources back into person files.
 * Prevents accidental repo-wide rewrites from a command whose primary job is
 * participant reconciliation.
 *
 * @param {object} scope
 */
export function assertSafeSourceSyncScope(scope = {}) {
  if (hasExplicitRecordScope(scope)) return;

  throw new Error(
    'Refusing to sync sources without an explicit record scope. ' +
    'Pass --type, --since, or --all-records.'
  );
}

/**
 * Extract the most useful date available for a record node.
 * Prefers frontmatter ingested date, falls back to a date embedded in the
 * finding filename when present.
 *
 * @param {object} recordData
 * @returns {string|null}
 */
export function getRecordScopeDate(recordData = {}) {
  if (typeof recordData.ingested === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(recordData.ingested)) {
    return recordData.ingested;
  }

  const findingFile = typeof recordData.finding_file === 'string' ? recordData.finding_file : '';
  const match = findingFile.match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

/**
 * Return true if a record falls within the requested scope.
 *
 * @param {object} recordData
 * @param {object} scope
 * @returns {boolean}
 */
export function matchesRecordScope(recordData = {}, scope = {}) {
  if (scope.type && recordData.type !== scope.type) return false;

  if (scope.since) {
    const recordDate = getRecordScopeDate(recordData);
    if (!recordDate || recordDate < scope.since) return false;
  }

  return true;
}
