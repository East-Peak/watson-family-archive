/**
 * Fuzzy Name Matching for Genealogy Records
 *
 * Uses Daitch-Mokotoff Soundex (designed for Slavic/Germanic names)
 * and Jaro-Winkler string similarity for matching variant spellings.
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const daitchMokotoff = require('talisman/phonetics/daitch-mokotoff');
const { similarity: jaroWinkler } = require('talisman/metrics/jaro-winkler');

// --- English surname variant map ---
// Common historical spelling variations that Soundex/Jaro-Winkler miss

const ENGLISH_SURNAME_VARIANTS = new Map([
  ['watson', ['whatson', 'wattson', 'wasson']],
  ['whatson', ['watson', 'wattson', 'wasson']],
  ['davies', ['davis', 'davyes']],
  ['davis', ['davies', 'davyes']],
  ['tapsfield', ['tapesfield', 'tapsfeild']],
  ['tapesfield', ['tapsfield', 'tapsfeild']],
  ['hughes', ['hughs', 'hews']],
  ['bennett', ['bennet', 'benet']],
  ['bennet', ['bennett', 'benet']],
  ['thomson', ['thompson']],
  ['thompson', ['thomson']],
  ['smith', ['smyth', 'smithe']],
  ['smyth', ['smith', 'smithe']],
  ['griffith', ['griffiths', 'gruffydd']],
  ['griffiths', ['griffith', 'gruffydd']],
  ['lloyd', ['loyd', 'floyd']],
  ['price', ['pryce', 'preece']],
  ['pryce', ['price', 'preece']],
  ['rees', ['reese', 'rhys']],
  ['reese', ['rees', 'rhys']],
  ['owen', ['owens']],
  ['owens', ['owen']],
  ['lewis', ['lewes', 'louis']],
  ['jenkins', ['jenkin', 'jenkyns']],
  ['jenkin', ['jenkins', 'jenkyns']],
  ['edwards', ['edward']],
  ['edward', ['edwards']],
  ['roberts', ['robert']],
  ['robert', ['roberts']],
  ['williams', ['william', 'wiliams']],
  ['william', ['williams', 'wiliams']],
  ['jones', ['joanes', 'johnes']],
  ['evans', ['evens', 'heavens']],
  ['morgan', ['morgen']],
  ['thomas', ['tomas']],
]);

// --- Slavic transliteration rules ---

const SLAVIC_SUBSTITUTIONS = [
  // sz ↔ s / sch / sh
  [/sz/gi, ['s', 'sch', 'sh']],
  [/sch/gi, ['sz', 'sh', 's']],
  [/sh/gi, ['sz', 'sch', 's']],
  // cz ↔ ch / tch
  [/cz/gi, ['ch', 'tch']],
  [/ch/gi, ['cz', 'tch']],
  [/tch/gi, ['cz', 'ch']],
  // -ski ↔ -sky
  [/ski$/gi, ['sky']],
  [/sky$/gi, ['ski']],
  // -ow ↔ -ov / -of
  [/ow$/gi, ['ov', 'of']],
  [/ov$/gi, ['ow', 'of']],
  [/of$/gi, ['ow', 'ov']],
  // trailing -ey ↔ -y / -ie
  [/ey$/gi, ['y', 'ie']],
  [/y$/gi, ['ey', 'ie']],
  [/ie$/gi, ['ey', 'y']],
  // Polish ł → l
  [/ł/gi, ['l']],
  // -usz / -uz / -us endings
  [/usz$/gi, ['us', 'uz']],
  [/uz$/gi, ['usz', 'us']],
  [/us$/gi, ['usz', 'uz']],
  // w ↔ v (common in Polish/German)
  [/w/gi, ['v']],
  [/v/gi, ['w']],
];

/**
 * Generate spelling variants of a name using Slavic transliteration rules.
 * @param {string} name
 * @returns {string[]} Array of unique name variants (always includes original)
 */
export function generateNameVariants(name) {
  if (!name) return [];
  const variants = new Set([name.toLowerCase()]);

  for (const [pattern, replacements] of SLAVIC_SUBSTITUTIONS) {
    const lower = name.toLowerCase();
    if (pattern.test(lower)) {
      for (const rep of replacements) {
        // Reset regex lastIndex
        pattern.lastIndex = 0;
        variants.add(lower.replace(pattern, rep));
      }
    }
  }

  return [...variants];
}

/**
 * Get DM Soundex codes for a name.
 * @param {string} name
 * @returns {Set<string>} Set of DM Soundex codes
 */
export function getDMSoundex(name) {
  if (!name) return new Set();
  try {
    const codes = daitchMokotoff(name);
    // talisman returns array of code strings
    return new Set(Array.isArray(codes) ? codes : [codes]);
  } catch {
    return new Set();
  }
}

/**
 * Check if two names match using fuzzy criteria.
 * Match if DM Soundex codes overlap OR Jaro-Winkler > 0.85.
 *
 * @param {string} name1
 * @param {string} name2
 * @returns {{ match: boolean, method: string, score: number }}
 */
export function fuzzyNameMatch(name1, name2) {
  if (!name1 || !name2) return { match: false, method: 'none', score: 0 };

  const a = name1.toLowerCase().trim();
  const b = name2.toLowerCase().trim();

  // Exact match
  if (a === b) return { match: true, method: 'exact', score: 1.0 };

  // Jaro-Winkler
  const jwScore = jaroWinkler(a, b);
  if (jwScore > 0.85)
    return { match: true, method: 'jaro-winkler', score: jwScore };

  // DM Soundex overlap
  const codesA = getDMSoundex(a);
  const codesB = getDMSoundex(b);
  for (const code of codesA) {
    if (codesB.has(code)) {
      return { match: true, method: 'dm-soundex', score: 0.8 };
    }
  }

  // Check English surname variants
  const engVariantsA = ENGLISH_SURNAME_VARIANTS.get(a);
  if (engVariantsA && engVariantsA.includes(b)) {
    return { match: true, method: 'english-variant', score: 0.92 };
  }
  const engVariantsB = ENGLISH_SURNAME_VARIANTS.get(b);
  if (engVariantsB && engVariantsB.includes(a)) {
    return { match: true, method: 'english-variant', score: 0.92 };
  }

  // Check Slavic variants of name1 against name2
  const variants1 = generateNameVariants(a);
  for (const v of variants1) {
    if (v === b) return { match: true, method: 'slavic-variant', score: 0.9 };
    const vJw = jaroWinkler(v, b);
    if (vJw > 0.85)
      return { match: true, method: 'slavic-variant+jw', score: vJw };
  }

  return { match: false, method: 'none', score: jwScore };
}

/**
 * Score a search result against known person parameters.
 * Returns 0-100 score with confidence level.
 *
 * @param {object} params - { firstName, lastName, birthYear, deathYear }
 * @param {object} result - { firstName, lastName, birthYear, deathYear, birthPlace, deathPlace }
 * @param {boolean} fuzzy - Use fuzzy matching
 * @returns {{ score: number, confidence: string, notes: string[] }}
 */
export function scoreMatch(params, result, fuzzy = false) {
  let score = 0;
  const notes = [];

  // First name
  const pFirst = (params.firstName || '').toLowerCase();
  const rFirst = (result.firstName || '').toLowerCase();
  if (pFirst && rFirst) {
    if (pFirst === rFirst) {
      score += 20;
      notes.push('First name exact');
    } else if (fuzzy) {
      const fm = fuzzyNameMatch(pFirst, rFirst);
      if (fm.match) {
        score += 15;
        notes.push(`First name fuzzy (${fm.method}, ${fm.score.toFixed(2)})`);
      } else if (
        pFirst.startsWith(rFirst.slice(0, 3)) ||
        rFirst.startsWith(pFirst.slice(0, 3))
      ) {
        score += 10;
        notes.push('First name partial');
      }
    } else if (
      pFirst.startsWith(rFirst.slice(0, 3)) ||
      rFirst.startsWith(pFirst.slice(0, 3))
    ) {
      score += 10;
      notes.push('First name partial');
    }
  }

  // Last name
  const pLast = (params.lastName || '').toLowerCase();
  const rLast = (result.lastName || '').toLowerCase();
  if (pLast && rLast) {
    if (pLast === rLast) {
      score += 20;
      notes.push('Last name exact');
    } else if (fuzzy) {
      const fm = fuzzyNameMatch(pLast, rLast);
      if (fm.match) {
        score += 15;
        notes.push(`Last name fuzzy (${fm.method}, ${fm.score.toFixed(2)})`);
      }
    }
  }

  // Birth year
  if (params.birthYear && result.birthYear) {
    const diff = Math.abs(params.birthYear - result.birthYear);
    if (diff === 0) {
      score += 30;
      notes.push(`Birth year exact (${result.birthYear})`);
    } else if (diff <= 2) {
      score += 15;
      notes.push(
        `Birth year close (${result.birthYear} vs ${params.birthYear})`,
      );
    } else if (diff <= 5) {
      score += 5;
      notes.push(
        `Birth year near (${result.birthYear} vs ${params.birthYear})`,
      );
    }
  }

  // Death year
  if (params.deathYear && result.deathYear) {
    const diff = Math.abs(params.deathYear - result.deathYear);
    if (diff === 0) {
      score += 15;
      notes.push(`Death year exact (${result.deathYear})`);
    } else if (diff <= 2) {
      score += 5;
      notes.push('Death year close');
    }
  }

  // State/location bonus
  if (params.birthState && result.birthPlace) {
    const state = params.birthState.toLowerCase();
    const place = result.birthPlace.toLowerCase();
    if (place.includes(state)) {
      score += 10;
      notes.push(`Birth location matches (${result.birthPlace})`);
    }
  }

  const confidence = score >= 70 ? 'HIGH' : score >= 40 ? 'MEDIUM' : 'LOW';
  return { score, confidence, notes };
}
