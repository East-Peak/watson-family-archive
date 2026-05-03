/**
 * Jurisdiction Resolver
 *
 * Normalizes origin_country into a canonical jurisdiction for record-family
 * scoring. Uses the existing alias-map pipeline (place-aliases.json -> places.json)
 * with UK disambiguation via birth.place string parsing.
 *
 * Part of the Enrichment Scorecard system (Phase 1, Task 1b).
 */

import { getRecordFamilies } from './record-families.mjs';

// ── UK Constituent Country Markers ──────────────────────────────────────
// Lightweight lookup table for disambiguating "United Kingdom" into
// England, Wales, or Scotland based on birth.place string parsing.

/** Welsh counties, regions, and distinctive place names */
const WALES_MARKERS = [
  // Counties (historic and modern)
  'wales', 'caernarfonshire', 'cardiganshire', 'carmarthenshire',
  'ceredigion', 'denbighshire', 'flintshire', 'glamorgan',
  'merionethshire', 'monmouthshire', 'montgomeryshire',
  'pembrokeshire', 'radnorshire', 'anglesey', 'brecknockshire',
  'breconshire', 'clwyd', 'dyfed', 'gwent', 'gwynedd', 'powys',
  'conwy', 'neath', 'swansea', 'wrexham', 'rhondda',
  // Distinctive cities/towns
  'cardiff', 'newport', 'bangor', 'aberystwyth', 'caernarfon',
  'machynlleth', 'penarth', 'rhiwlas', 'dinas mawddwy',
  'haverfordwest', 'llanelli', 'pontypridd', 'merthyr tydfil',
  'barry', 'bridgend', 'llandudno', 'colwyn bay', 'tenby',
  // Markers in place strings
  'north wales', 'south wales',
];

/** Scottish counties, regions, and distinctive place names */
const SCOTLAND_MARKERS = [
  // Counties/regions
  'scotland', 'aberdeenshire', 'angus', 'argyll', 'ayrshire',
  'banffshire', 'berwickshire', 'bute', 'caithness', 'clackmannanshire',
  'dumfriesshire', 'dunbartonshire', 'east lothian', 'fife',
  'inverness-shire', 'kincardineshire', 'kinross-shire',
  'kirkcudbrightshire', 'lanarkshire', 'midlothian', 'moray',
  'nairnshire', 'orkney', 'peeblesshire', 'perthshire',
  'renfrewshire', 'ross-shire', 'roxburghshire', 'selkirkshire',
  'shetland', 'stirlingshire', 'sutherland', 'west lothian',
  'wigtownshire',
  // Distinctive cities/towns
  'edinburgh', 'glasgow', 'aberdeen', 'dundee', 'inverness',
  'perth', 'stirling', 'paisley', 'kilmarnock', 'greenock',
  'dunfermline', 'falkirk', 'ayr', 'dumfries',
];

/** English counties and distinctive markers (used only to confirm England, not as default) */
const ENGLAND_MARKERS = [
  // Counties (historic and modern)
  'england', 'bedfordshire', 'berkshire', 'buckinghamshire',
  'cambridgeshire', 'cheshire', 'cornwall', 'cumberland',
  'derbyshire', 'devon', 'dorset', 'durham', 'essex',
  'gloucestershire', 'hampshire', 'herefordshire', 'hertfordshire',
  'huntingdonshire', 'kent', 'lancashire', 'leicestershire',
  'lincolnshire', 'london', 'middlesex', 'norfolk',
  'northamptonshire', 'northumberland', 'nottinghamshire',
  'oxfordshire', 'rutland', 'shropshire', 'somerset',
  'staffordshire', 'suffolk', 'surrey', 'sussex',
  'warwickshire', 'westmorland', 'wiltshire', 'worcestershire',
  'yorkshire', 'east riding', 'north riding', 'west riding',
  // Distinctive cities that are unambiguously English
  'bristol', 'birmingham', 'manchester', 'liverpool', 'leeds',
  'sheffield', 'newcastle upon tyne', 'nottingham', 'southampton',
  'portsmouth', 'plymouth', 'oxford', 'cambridge', 'bath',
  'canterbury', 'york', 'chester', 'exeter', 'norwich',
  'brighton', 'bournemouth', 'reading', 'coventry',
];

/**
 * Parse a birth.place string to identify which UK constituent country it refers to.
 *
 * @param {string} birthPlace - The birth.place string from YAML frontmatter
 * @returns {'England'|'Wales'|'Scotland'|null} - Constituent country or null if ambiguous
 */
export function parseUKConstituent(birthPlace) {
  if (!birthPlace) return null;

  const lower = birthPlace.toLowerCase().trim();

  // Check Wales markers first (more specific wins)
  for (const marker of WALES_MARKERS) {
    if (lower.includes(marker)) return 'Wales';
  }

  // Check Scotland markers
  for (const marker of SCOTLAND_MARKERS) {
    if (lower.includes(marker)) return 'Scotland';
  }

  // Check England markers
  for (const marker of ENGLAND_MARKERS) {
    if (lower.includes(marker)) return 'England';
  }

  return null;
}

/**
 * Normalize origin_country values to canonical jurisdiction names.
 * Handles common aliases: United Kingdom, Great Britain, UK, Britain, etc.
 */
const COUNTRY_NORMALIZATION = {
  'united states': 'United States',
  'united states of america': 'United States',
  'usa': 'United States',
  'us': 'United States',
  'america': 'United States',
  'germany': 'Germany',
  'deutschland': 'Germany',
  'prussia': 'Germany',
  'ireland': 'Ireland',
  'england': 'England',
  'wales': 'Wales',
  'scotland': 'Scotland',
  'australia': 'Australia',
  'canada': 'Canada',
  'france': 'France',
  'switzerland': 'Switzerland',
  'netherlands': 'Netherlands',
  'holland': 'Netherlands',
};

/** Countries that trigger UK disambiguation */
const UK_ALIASES = new Set([
  'united kingdom', 'great britain', 'uk', 'britain',
]);

/**
 * Attempt to resolve country from birth.place using the alias-map pipeline.
 * Looks up birth.place in place-aliases.json to get a canonical place ID,
 * then checks the place string itself for country clues.
 *
 * @param {string} birthPlace - The birth.place string
 * @param {object} placesData - Parsed places.json
 * @param {object} aliasMap - Parsed place-aliases.json
 * @returns {string|null} - Country name or null
 */
function resolveCountryFromBirthPlace(birthPlace, placesData, aliasMap) {
  if (!birthPlace) return null;

  // Try alias-map lookup
  const canonicalId = aliasMap?.[birthPlace];
  if (canonicalId && placesData?.[canonicalId]) {
    // places.json does not have a country field, so we parse the canonical name
    const canonicalName = placesData[canonicalId].canonicalName || '';
    return extractCountryFromPlaceString(canonicalName);
  }

  // Direct parsing of the birth.place string
  return extractCountryFromPlaceString(birthPlace);
}

/**
 * Extract country from a place string by looking at the last components.
 *
 * @param {string} placeStr
 * @returns {string|null}
 */
function extractCountryFromPlaceString(placeStr) {
  if (!placeStr) return null;

  const lower = placeStr.toLowerCase().trim();

  // Check for US state indicators
  const usStatePatterns = [
    /,\s*(california|new york|pennsylvania|virginia|maryland|massachusetts|connecticut|ohio|illinois|indiana|iowa|kentucky|tennessee|georgia|north carolina|south carolina|missouri|wisconsin|michigan|minnesota|arkansas|texas|idaho|oregon|washington|colorado|nebraska|kansas|new jersey|delaware|rhode island|new hampshire|vermont|maine|west virginia|alabama|mississippi|louisiana|florida|montana|south dakota|north dakota|wyoming|nevada|utah|arizona|new mexico|oklahoma|hawaii)\s*$/i,
    /,\s*[A-Z]{2}\s*$/,
    /united states/i,
  ];
  for (const pattern of usStatePatterns) {
    if (pattern.test(placeStr)) return 'United States';
  }

  // Check for country names at end of string
  if (/,\s*england\s*$/i.test(placeStr)) return 'England';
  if (/,\s*wales\s*$/i.test(placeStr)) return 'Wales';
  if (/,\s*scotland\s*$/i.test(placeStr)) return 'Scotland';
  if (/,\s*ireland\s*$/i.test(placeStr)) return 'Ireland';
  if (/,\s*germany\s*$/i.test(placeStr)) return 'Germany';
  if (/,\s*(prussia|bavaria|saxony|württemberg|hesse|baden)\s*$/i.test(placeStr)) return 'Germany';
  if (/,\s*united kingdom\s*$/i.test(placeStr)) return 'United Kingdom';
  if (/,\s*australia\s*$/i.test(placeStr)) return 'Australia';
  if (/,\s*canada\s*$/i.test(placeStr)) return 'Canada';
  if (/,\s*france\s*$/i.test(placeStr)) return 'France';
  if (/,\s*switzerland\s*$/i.test(placeStr)) return 'Switzerland';
  if (/,\s*netherlands\s*$/i.test(placeStr)) return 'Netherlands';

  // Check for "Province of Maryland" etc. (colonial patterns)
  if (/province of maryland/i.test(placeStr)) return 'United States';
  if (/colony/i.test(placeStr)) return 'United States';

  return null;
}

/**
 * Resolve jurisdiction for a person based on origin_country, birth.place, and birth year.
 *
 * Resolution order:
 * 1. origin_country (when present and normalized)
 * 2. UK disambiguation via birth.place parsing (if origin_country is UK variant)
 * 3. Alias-map fallback from birth.place
 * 4. Defaults to 'unknown'
 *
 * @param {string|null} originCountry - origin_country from YAML frontmatter
 * @param {string|null} birthPlace - birth.place from YAML frontmatter
 * @param {number|undefined} birthYear - Parsed birth year
 * @param {object} placesData - Parsed places.json (can be null for testing)
 * @param {object} aliasMap - Parsed place-aliases.json (can be null for testing)
 * @returns {{ jurisdiction: string, recordFamilies: object }}
 */
export function resolveJurisdiction(originCountry, birthPlace, birthYear, placesData, aliasMap) {
  let jurisdiction = 'unknown';

  if (originCountry) {
    const normalized = COUNTRY_NORMALIZATION[originCountry.toLowerCase().trim()];

    if (normalized) {
      jurisdiction = normalized;
    } else if (UK_ALIASES.has(originCountry.toLowerCase().trim())) {
      // UK disambiguation: try birth.place parsing
      const constituent = parseUKConstituent(birthPlace);
      jurisdiction = constituent || 'unknown';
    } else {
      // Use the raw value if no normalization found (covers edge cases)
      jurisdiction = originCountry;
    }
  }

  // If still unknown, try alias-map fallback from birth.place
  if (jurisdiction === 'unknown' && birthPlace) {
    const resolved = resolveCountryFromBirthPlace(birthPlace, placesData || {}, aliasMap || {});
    if (resolved) {
      const normalizedResolved = COUNTRY_NORMALIZATION[resolved.toLowerCase().trim()];
      if (normalizedResolved) {
        jurisdiction = normalizedResolved;
      } else if (UK_ALIASES.has(resolved.toLowerCase().trim())) {
        const constituent = parseUKConstituent(birthPlace);
        jurisdiction = constituent || 'unknown';
      } else {
        jurisdiction = resolved;
      }
    }
  }

  // Even if origin_country was explicit (e.g., "United Kingdom"), birth.place might
  // give a more specific signal (e.g., "Pembrokeshire, Wales")
  if (UK_ALIASES.has((originCountry || '').toLowerCase().trim())) {
    const constituent = parseUKConstituent(birthPlace);
    if (constituent) {
      jurisdiction = constituent;
    }
  }

  // Determine death year for record families (not available at this level,
  // caller should pass through getRecordFamilies separately if needed)
  const recordFamilies = getRecordFamilies(jurisdiction, birthYear, undefined);

  return { jurisdiction, recordFamilies };
}
