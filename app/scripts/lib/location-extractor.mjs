/**
 * location-extractor.mjs
 *
 * Extracts and classifies location strings from person YAML+markdown files.
 * Used by generate-locations.mjs (Task 5) to build the shared place registry.
 */

import { parseLifeEvents } from './yaml_node_parser.mjs';

// Strings that should always be rejected as meaningless
const REJECT_STRINGS = new Set([
  'unknown',
  'details unknown',
  'not specified',
  'not known',
  'n/a',
  'na',
  'tbd',
  '?',
  '-',
  '--',
]);

// Parenthetical qualifiers that indicate approximate/uncertain locations
// Pattern: matches trailing parentheticals like (likely), (?), (area), (South Pasadena area), etc.
const QUALIFIER_PATTERN = /\s*\(([^)]+)\)\s*$/;

/**
 * Classify a raw location string.
 *
 * @param {string|null|undefined} raw
 * @returns {{ classification: 'exact'|'approx'|'reject', cleaned: string, qualifier: string|null, reason: string|null }}
 */
export function classifyLocation(raw) {
  // Reject null/undefined/empty
  if (raw == null || raw === '') {
    return { classification: 'reject', cleaned: '', qualifier: null, reason: 'empty' };
  }

  const str = String(raw).trim();

  // Reject empty after trim
  if (str === '') {
    return { classification: 'reject', cleaned: '', qualifier: null, reason: 'empty' };
  }

  // Reject strings over 100 chars
  if (str.length > 100) {
    return { classification: 'reject', cleaned: str, qualifier: null, reason: 'too_long' };
  }

  // Reject strings under 3 chars
  if (str.length < 3) {
    return { classification: 'reject', cleaned: str, qualifier: null, reason: 'too_short' };
  }

  // Reject known meaningless strings (case-insensitive)
  if (REJECT_STRINGS.has(str.toLowerCase())) {
    return { classification: 'reject', cleaned: str, qualifier: null, reason: 'meaningless' };
  }

  // Check for parenthetical qualifier
  const qualifierMatch = str.match(QUALIFIER_PATTERN);
  if (qualifierMatch) {
    const qualifier = qualifierMatch[1].trim();
    const cleaned = str.slice(0, qualifierMatch.index).trim();

    // If stripped value is empty or too short, reject
    if (cleaned.length < 3) {
      return { classification: 'reject', cleaned, qualifier, reason: 'too_short_after_strip' };
    }

    return { classification: 'approx', cleaned, qualifier, reason: null };
  }

  // No qualifier — classify as exact
  return { classification: 'exact', cleaned: str, qualifier: null, reason: null };
}

/**
 * Extract all locations from a parsed person record.
 *
 * @param {{ frontmatter: object, body: string }} person
 * @returns {Array<{ raw: string, cleaned: string, classification: 'exact'|'approx'|'reject', source: 'birth'|'death'|'marriage'|'burial'|'life_event', year: string|null, qualifier: string|null }>}
 */
export function extractLocationsFromPerson(person) {
  const { frontmatter, body } = person;
  const results = [];

  /**
   * Helper: add a location entry if it passes classification.
   */
  function addLocation(raw, source, year = null) {
    if (!raw) return;
    const classified = classifyLocation(raw);
    if (classified.classification === 'reject') return;
    results.push({
      raw,
      cleaned: classified.cleaned,
      classification: classified.classification,
      source,
      year: year ? String(year) : null,
      qualifier: classified.qualifier,
    });
  }

  // Birth place
  if (frontmatter.birth?.place) {
    const year = frontmatter.birth?.date
      ? String(frontmatter.birth.date).match(/\b(1[4-9]\d{2}|20[0-2]\d)\b/)?.[0] ?? null
      : null;
    addLocation(frontmatter.birth.place, 'birth', year);
  }

  // Death place
  if (frontmatter.death?.place) {
    const year = frontmatter.death?.date
      ? String(frontmatter.death.date).match(/\b(1[4-9]\d{2}|20[0-2]\d)\b/)?.[0] ?? null
      : null;
    addLocation(frontmatter.death.place, 'death', year);
  }

  // Burial place
  if (frontmatter.burial?.place) {
    const year = frontmatter.death?.date
      ? String(frontmatter.death.date).match(/\b(1[4-9]\d{2}|20[0-2]\d)\b/)?.[0] ?? null
      : null;
    addLocation(frontmatter.burial.place, 'burial', year);
  }

  // Marriage places from spouses array
  const spouses = Array.isArray(frontmatter.spouses) ? frontmatter.spouses : [];
  for (const spouse of spouses) {
    if (spouse?.marriage_place) {
      const year = spouse?.marriage_date
        ? String(spouse.marriage_date).match(/\b(1[4-9]\d{2}|20[0-2]\d)\b/)?.[0] ?? null
        : null;
      addLocation(spouse.marriage_place, 'marriage', year);
    }
  }

  // Life events from body markdown table
  const lifeEvents = body ? parseLifeEvents(body) : [];
  for (const evt of lifeEvents) {
    if (evt.location) {
      addLocation(evt.location, 'life_event', evt.year || null);
    }
  }

  return results;
}
