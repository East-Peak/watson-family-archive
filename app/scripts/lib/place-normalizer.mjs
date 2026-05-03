/**
 * place-normalizer.mjs
 *
 * Normalizes messy place strings from YAML into canonical place IDs with alias maps.
 * Used by generate-locations.mjs (Task 5) to build the shared place registry.
 */

// ---------------------------------------------------------------------------
// Abbreviation expansion table
// ---------------------------------------------------------------------------
const ABBREV_MAP = [
  // County variants — "Co." followed by comma, whitespace, or end of string
  [/\bCo\.(?=\s*,|\s+|$)/g, 'County'],
  // "Co" (no period) immediately before a comma
  [/\bCo(?=,)/g, 'County'],
  // Saint/St.
  [/\bSt\.\s+/g, 'Saint '],
  // Mount / Mt.
  [/\bMt\.\s+/g, 'Mount '],
  // Fort / Ft.
  [/\bFt\.\s+/g, 'Fort '],
  // Township
  [/\bTwp\.(?=\s*,|\s+|$)/g, 'Township'],
  [/\bTwp(?=,|\s+|$)/g, 'Township'],
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Normalize a raw place string:
 * - Expand common abbreviations
 * - Trim leading/trailing whitespace
 * - Remove trailing commas (and any whitespace before them)
 * - Collapse multiple internal spaces
 *
 * @param {string} raw
 * @returns {string}
 */
export function normalizePlaceString(raw) {
  if (!raw || typeof raw !== 'string') return '';

  let s = raw;

  // Apply abbreviation expansions
  for (const [pattern, replacement] of ABBREV_MAP) {
    s = s.replace(pattern, replacement);
  }

  // Collapse multiple spaces
  s = s.replace(/  +/g, ' ');

  // Trim
  s = s.trim();

  // Remove trailing commas (possibly with surrounding whitespace) repeatedly
  // e.g. "Dane County, Wisconsin, " → "Dane County, Wisconsin"
  s = s.replace(/[,\s]+$/, '');

  // Trim again after comma removal
  s = s.trim();

  return s;
}

/**
 * Generate a canonical slug ID from a normalized place name.
 * - Lowercase
 * - Replace non-alphanumeric characters with hyphens
 * - Collapse consecutive hyphens
 * - Trim leading/trailing hyphens
 *
 * @param {string} normalizedName
 * @returns {string}
 */
export function generateCanonicalId(normalizedName) {
  if (!normalizedName || typeof normalizedName !== 'string') return '';

  return normalizedName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Haversine distance between two lat/lng coordinates, in kilometres.
 *
 * @param {number} lat1
 * @param {number} lng1
 * @param {number} lat2
 * @param {number} lng2
 * @returns {number} distance in km
 */
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg) {
  return deg * (Math.PI / 180);
}

/**
 * Returns true if two coordinates are within thresholdKm of each other.
 *
 * @param {number} lat1
 * @param {number} lng1
 * @param {number} lat2
 * @param {number} lng2
 * @param {number} [thresholdKm=5]
 * @returns {boolean}
 */
export function areProximateCoords(lat1, lng1, lat2, lng2, thresholdKm = 5) {
  return haversineKm(lat1, lng1, lat2, lng2) <= thresholdKm;
}

/**
 * Build an alias map from extracted locations.
 *
 * Takes an array of extracted locations (from location-extractor.mjs, each with
 * a `cleaned` string), normalizes each, generates canonical IDs, and groups
 * variants. When geocodes are available, uses proximity dedup to merge entries
 * that have different canonical IDs but geocode to nearby coordinates.
 *
 * @param {Array<{ cleaned: string, lat?: number, lng?: number }>} extractedLocations
 *   The extracted location records (from Task 1's extractor). Each must have
 *   at least a `cleaned` string. May optionally carry `lat`/`lng` if already geocoded.
 * @param {Object} [existingAliases={}]
 *   Existing alias map: { rawString: canonicalId }
 * @param {Object} [existingPlaces={}]
 *   Existing places map: { canonicalId: { canonicalName: string, aliases: string[], lat?: number, lng?: number } }
 * @returns {{ aliases: Object, places: Object }}
 *   aliases: { rawString: canonicalId }
 *   places:  { canonicalId: { canonicalName: string, aliases: string[], lat?: number, lng?: number } }
 */
export function buildAliasMap(extractedLocations = [], existingAliases = {}, existingPlaces = {}) {
  // Deep-clone existing data so we don't mutate the callers' objects
  const aliases = Object.assign({}, existingAliases);
  const places = {};
  for (const [id, place] of Object.entries(existingPlaces)) {
    places[id] = {
      canonicalName: place.canonicalName,
      aliases: Array.isArray(place.aliases) ? [...place.aliases] : [],
      ...(place.lat != null ? { lat: place.lat } : {}),
      ...(place.lng != null ? { lng: place.lng } : {}),
    };
  }

  for (const loc of extractedLocations) {
    const raw = loc.cleaned;
    if (!raw) continue;

    const normalized = normalizePlaceString(raw);
    if (!normalized) continue;

    let canonicalId = generateCanonicalId(normalized);
    if (!canonicalId) continue;

    // --- Proximity dedup: if this entry has coords, check whether any existing
    //     place is close enough to be the same place (different canonical ID).
    if (loc.lat != null && loc.lng != null) {
      for (const [existingId, existingPlace] of Object.entries(places)) {
        if (existingPlace.lat != null && existingPlace.lng != null) {
          if (
            existingId !== canonicalId &&
            areProximateCoords(loc.lat, loc.lng, existingPlace.lat, existingPlace.lng)
          ) {
            // Merge into the existing canonical ID (keep earlier one as canonical)
            canonicalId = existingId;
            break;
          }
        }
      }
    }

    // Register the alias
    if (!aliases[raw]) {
      aliases[raw] = canonicalId;
    }

    // Register or update the place entry
    if (!places[canonicalId]) {
      places[canonicalId] = {
        canonicalName: normalized,
        aliases: [],
        ...(loc.lat != null ? { lat: loc.lat } : {}),
        ...(loc.lng != null ? { lng: loc.lng } : {}),
      };
    }

    // Add this raw string to the aliases list if not already there
    if (!places[canonicalId].aliases.includes(raw)) {
      places[canonicalId].aliases.push(raw);
    }

    // Also record the normalized form as an alias if it differs from the canonical name
    if (
      normalized !== places[canonicalId].canonicalName &&
      !places[canonicalId].aliases.includes(normalized)
    ) {
      places[canonicalId].aliases.push(normalized);
    }
  }

  return { aliases, places };
}
