/**
 * Record Families & Source Taxonomy
 *
 * Defines the controlled source vocabulary for research tracking sidecar files,
 * record family expectations per jurisdiction, and census year computation.
 *
 * Part of the Enrichment Scorecard system (Phase 1, Task 1e).
 */

// ── Source Taxonomy ─────────────────────────────────────────────────────
// Controlled vocabulary for sidecar `source` fields.
// Maps source keys to their Dimension B scoring bucket.

export const SOURCE_TAXONOMY = {
  // External platforms (15 pts total: 5 each)
  familysearch:     { bucket: 'external_platforms', description: 'Platform-level search' },
  wikitree:         { bucket: 'external_platforms', description: 'Platform-level search' },
  findagrave:       { bucket: 'external_platforms', description: 'Platform-level search' },

  // Vital records (25 pts)
  birth_record:     { bucket: 'vital_records', description: 'Birth certificate / registration' },
  death_record:     { bucket: 'vital_records', description: 'Death certificate / registration' },
  marriage_record:  { bucket: 'vital_records', description: 'Marriage certificate / registration' },

  // Census/enumeration (25 pts)
  // census_YYYY and state_census_YYYY are dynamic keys — matched by prefix
  census:           { bucket: 'census', description: 'Federal census by year (e.g., census_1920)' },
  state_census:     { bucket: 'census', description: 'State census by year (e.g., state_census_1855)' },

  // Supplementary records (15 pts)
  military:         { bucket: 'supplementary', description: 'Military service records' },
  immigration:      { bucket: 'supplementary', description: 'Immigration / naturalization' },
  emigration:       { bucket: 'supplementary', description: 'Emigration records' },
  probate:          { bucket: 'supplementary', description: 'Probate / will records' },
  land_record:      { bucket: 'supplementary', description: 'Land / deed / tax records' },
  tax_list:         { bucket: 'supplementary', description: 'Tax lists (colonial era)' },
  newspaper:        { bucket: 'supplementary', description: 'Newspaper / obituary' },
  parish_register:  { bucket: 'supplementary', description: 'Church / parish records (UK)' },
  church_book:      { bucket: 'supplementary', description: 'German church books (Kirchenbuch)' },
  bmd_registration: { bucket: 'supplementary', description: 'UK BMD civil registration' },
};

/**
 * Resolve the Dimension B bucket for a given source key.
 * Handles dynamic keys like census_1920, state_census_1855.
 *
 * @param {string} sourceKey
 * @returns {string} bucket name
 */
export function getBucket(sourceKey) {
  if (!sourceKey) return 'unknown';

  // Direct match
  if (SOURCE_TAXONOMY[sourceKey]) {
    return SOURCE_TAXONOMY[sourceKey].bucket;
  }

  // Dynamic census keys: census_YYYY or state_census_YYYY
  if (/^census_\d{4}$/.test(sourceKey)) return 'census';
  if (/^state_census_\d{4}$/.test(sourceKey)) return 'census';

  return 'unknown';
}


// ── Record Families by Jurisdiction ──────────────────────────────────────

/**
 * US federal census years (1790-1950, decennial).
 * 1890 census was largely destroyed by fire.
 */
const US_CENSUS_YEARS = [1790, 1800, 1810, 1820, 1830, 1840, 1850, 1860, 1870, 1880, 1890, 1900, 1910, 1920, 1930, 1940, 1950];

/**
 * England/Wales census years (1841-1921, decennial).
 */
const EW_CENSUS_YEARS = [1841, 1851, 1861, 1871, 1881, 1891, 1901, 1911, 1921];

/**
 * Scotland census years (same as England/Wales).
 */
const SCOTLAND_CENSUS_YEARS = [1841, 1851, 1861, 1871, 1881, 1891, 1901, 1911, 1921];

/**
 * Ireland surviving census years.
 */
const IRELAND_CENSUS_YEARS = [1901, 1911];

/**
 * Record family definitions per jurisdiction.
 */
const RECORD_FAMILIES = {
  'United States': {
    census_years: US_CENSUS_YEARS,
    vital_records: ['birth_record', 'death_record', 'marriage_record'],
    supplementary: ['military', 'immigration', 'probate', 'land_record', 'newspaper'],
    platforms: ['familysearch', 'wikitree', 'findagrave'],
    era_gate: { census_start: 1790, vital_start: 1850 },
  },
  'England': {
    census_years: EW_CENSUS_YEARS,
    vital_records: ['birth_record', 'death_record', 'marriage_record'],
    supplementary: ['bmd_registration', 'parish_register', 'probate', 'newspaper'],
    platforms: ['familysearch', 'wikitree', 'findagrave'],
    era_gate: { census_start: 1841, civil_registration_start: 1837 },
  },
  'Wales': {
    census_years: EW_CENSUS_YEARS,
    vital_records: ['birth_record', 'death_record', 'marriage_record'],
    supplementary: ['bmd_registration', 'parish_register', 'probate', 'newspaper'],
    platforms: ['familysearch', 'wikitree', 'findagrave'],
    era_gate: { census_start: 1841, civil_registration_start: 1837 },
  },
  'Scotland': {
    census_years: SCOTLAND_CENSUS_YEARS,
    vital_records: ['birth_record', 'death_record', 'marriage_record'],
    supplementary: ['parish_register', 'probate', 'newspaper'],
    platforms: ['familysearch', 'wikitree', 'findagrave'],
    era_gate: { census_start: 1841, statutory_start: 1855 },
  },
  'Germany': {
    census_years: [],
    vital_records: ['birth_record', 'death_record', 'marriage_record'],
    supplementary: ['church_book', 'emigration', 'newspaper'],
    platforms: ['familysearch'],
    era_gate: { civil_registration_start: 1876 },
  },
  'Ireland': {
    census_years: IRELAND_CENSUS_YEARS,
    vital_records: ['birth_record', 'death_record', 'marriage_record'],
    supplementary: ['parish_register', 'probate', 'newspaper'],
    platforms: ['familysearch', 'wikitree', 'findagrave'],
    era_gate: { census_start: 1901 },
  },
  'Colonial US': {
    census_years: [],
    vital_records: ['birth_record', 'death_record', 'marriage_record'],
    supplementary: ['land_record', 'probate', 'parish_register', 'tax_list', 'newspaper'],
    platforms: ['familysearch', 'wikitree', 'findagrave'],
    era_gate: {},
  },
  'living': {
    census_years: [],
    vital_records: ['birth_record', 'marriage_record'],
    supplementary: [],
    platforms: ['familysearch', 'wikitree'],
    era_gate: {},
  },
  'unknown': {
    census_years: [],
    vital_records: ['birth_record', 'death_record', 'marriage_record'],
    supplementary: [],
    platforms: ['familysearch', 'wikitree', 'findagrave'],
    era_gate: {},
  },
};

/**
 * Compute the expected US federal census years where a person was alive.
 * A person appears in a census if they were alive during the enumeration year
 * (born before or during that year AND died during or after that year).
 *
 * @param {number|undefined} birthYear
 * @param {number|undefined} deathYear
 * @param {string} jurisdiction
 * @returns {number[]} Array of census years
 */
export function getExpectedCensusYears(birthYear, deathYear, jurisdiction) {
  if (!birthYear) return [];

  let censusYears;
  switch (jurisdiction) {
    case 'United States':
      censusYears = US_CENSUS_YEARS;
      break;
    case 'England':
    case 'Wales':
      censusYears = EW_CENSUS_YEARS;
      break;
    case 'Scotland':
      censusYears = SCOTLAND_CENSUS_YEARS;
      break;
    case 'Ireland':
      censusYears = IRELAND_CENSUS_YEARS;
      break;
    default:
      return [];
  }

  return censusYears.filter(year => {
    // Person must be born by census year
    if (birthYear > year) return false;
    // If we know when they died, they must be alive during the census year
    if (deathYear && deathYear < year) return false;
    return true;
  });
}

/**
 * Get the applicable record families for a jurisdiction.
 * Applies era gating based on birth year and death year.
 *
 * @param {string} jurisdiction - Resolved jurisdiction
 * @param {number|undefined} birthYear
 * @param {number|undefined} deathYear
 * @returns {{ expectedCensusYears: number[], vitalRecords: string[], supplementary: string[], platforms: string[] }}
 */
export function getRecordFamilies(jurisdiction, birthYear, deathYear) {
  // Determine effective jurisdiction
  let effectiveJurisdiction = jurisdiction;

  // Colonial US: US person born before 1790
  if (jurisdiction === 'United States' && birthYear && birthYear < 1790) {
    effectiveJurisdiction = 'Colonial US';
  }

  const family = RECORD_FAMILIES[effectiveJurisdiction] || RECORD_FAMILIES['unknown'];

  const expectedCensusYears = getExpectedCensusYears(birthYear, deathYear, effectiveJurisdiction);

  return {
    jurisdiction: effectiveJurisdiction,
    expectedCensusYears,
    vitalRecords: [...family.vital_records],
    supplementary: [...family.supplementary],
    platforms: [...family.platforms],
  };
}
