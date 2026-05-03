/**
 * participant-matcher.mjs
 *
 * Fuzzy matching of record participants to Person nodes in the tree.
 * Matches by surname + given name (with abbreviation expansion) + birth year proximity.
 */

import { parseLooseInteger } from './numeric-normalizer.mjs';

/** Common given name abbreviations found in historical records */
const GIVEN_NAME_ABBREVS = new Map([
  ['wm', 'william'],
  ['jas', 'james'],
  ['jno', 'john'],
  ['thos', 'thomas'],
  ['chas', 'charles'],
  ['geo', 'george'],
  ['benj', 'benjamin'],
  ['danl', 'daniel'],
  ['edw', 'edward'],
  ['fdk', 'frederick'],
  ['fredk', 'frederick'],
  ['saml', 'samuel'],
  ['robt', 'robert'],
  ['richd', 'richard'],
  ['nathl', 'nathaniel'],
  ['eliz', 'elizabeth'],
  ['margt', 'margaret'],
  ['cath', 'catherine'],
  ['kath', 'katherine'],
  ['alex', 'alexander'],
  ['abr', 'abraham'],
  ['andr', 'andrew'],
]);

/** Maximum birth year difference for a match */
const BIRTH_YEAR_TOLERANCE = 3;

/**
 * Build an index of people keyed by lowercase surname.
 * @param {Array<{id: string, fullName: string, surname: string, givenName: string, birthYear: number|null, deathYear: number|null}>} people
 * @returns {Map<string, Array>}
 */
export function buildPersonIndex(people) {
  const index = new Map();
  for (const person of people) {
    if (!person.surname) continue;
    const key = person.surname.toLowerCase().trim();
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(person);
  }
  return index;
}

/**
 * Expand a given name to include abbreviation variants.
 * "Wm" → ["wm", "william"], "John" → ["john"]
 * @param {string} given
 * @returns {string[]}
 */
function expandGivenName(given) {
  const lower = given.toLowerCase().trim();
  const variants = [lower];
  // Check if it's an abbreviation
  if (GIVEN_NAME_ABBREVS.has(lower)) {
    variants.push(GIVEN_NAME_ABBREVS.get(lower));
  }
  // Check if it's a full name that has abbreviations pointing to it
  for (const [abbrev, full] of GIVEN_NAME_ABBREVS) {
    if (full === lower) variants.push(abbrev);
  }
  return variants;
}

/**
 * Extract surname and given name from a participant name string.
 * @param {string} name
 * @returns {{ given: string, surname: string }}
 */
function parseName(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return { given: '', surname: '' };
  if (parts.length === 1) return { given: parts[0], surname: '' };
  // Last token is surname, rest is given name(s)
  const surname = parts[parts.length - 1];
  const given = parts.slice(0, -1).join(' ');
  return { given, surname };
}

/**
 * Match a record participant to a Person node.
 *
 * @param {object} participant - { name, age, birth_year_est }
 * @param {number} recordYear - Year of the record (for computing birth year from age)
 * @param {Map} personIndex - From buildPersonIndex()
 * @returns {{ slug: string|null, confidence: 'high'|'ambiguous'|null, candidates?: Array }}
 */
export function matchParticipant(participant, recordYear, personIndex) {
  if (!participant.name) return { slug: null, confidence: null };

  const { given, surname } = parseName(participant.name);
  if (!surname) return { slug: null, confidence: null };

  const candidates = personIndex.get(surname.toLowerCase());
  if (!candidates || candidates.length === 0) return { slug: null, confidence: null };

  // Estimate birth year
  let estBirthYear = parseLooseInteger(participant.birth_year_est);
  if (estBirthYear == null && participant.age != null && recordYear != null) {
    const participantAge = parseLooseInteger(participant.age);
    if (participantAge != null) {
      estBirthYear = recordYear - participantAge;
    }
  }

  // Expand given name variants
  const givenVariants = expandGivenName(given);

  // Score each candidate
  const matches = [];
  for (const person of candidates) {
    // Check given name match
    const personGiven = (person.givenName || '').toLowerCase().trim();
    const givenMatch = givenVariants.some(v =>
      v === personGiven ||
      personGiven.startsWith(v) ||
      v.startsWith(personGiven)
    );
    if (!givenMatch) continue;

    // Check birth year proximity
    if (estBirthYear != null && person.birthYear != null) {
      const diff = Math.abs(estBirthYear - person.birthYear);
      if (diff > BIRTH_YEAR_TOLERANCE) continue;
      matches.push({ person, yearDiff: diff });
    } else {
      // No birth year to compare — weaker match
      matches.push({ person, yearDiff: null });
    }
  }

  if (matches.length === 0) return { slug: null, confidence: null };

  if (matches.length === 1) {
    return { slug: matches[0].person.id, confidence: 'high' };
  }

  // Multiple matches — check if one is clearly better
  const withYear = matches.filter(m => m.yearDiff != null);
  if (withYear.length > 0) {
    withYear.sort((a, b) => a.yearDiff - b.yearDiff);
    const best = withYear[0];
    const secondBest = withYear[1];
    // If the best match is significantly closer, pick it
    if (!secondBest || best.yearDiff + BIRTH_YEAR_TOLERANCE < secondBest.yearDiff) {
      return { slug: best.person.id, confidence: 'high' };
    }
  }

  return {
    slug: null,
    confidence: 'ambiguous',
    candidates: matches.map(m => ({ id: m.person.id, name: m.person.fullName, yearDiff: m.yearDiff })),
  };
}
