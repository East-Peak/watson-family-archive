/**
 * Nominatim OpenStreetMap geocoding service
 *
 * Rate limited to 1100ms between requests per Nominatim ToS.
 * Uses native fetch (Node.js 18+).
 */

const RATE_LIMIT_MS = 2000;  // 2s between requests — Nominatim needs breathing room
const RETRY_DELAY_MS = 10000; // Wait 10s on 429 before retrying
const MAX_RETRIES = 3;
const USER_AGENT = 'GenealogyToolkit/2.0 (self-hosted genealogy project)';
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';

// Track last request time globally to enforce rate limiting across all calls
let lastRequestTime = 0;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Geocode a single place name via Nominatim.
 *
 * @param {string} placeName  - Full place string (e.g. "Dane County, Wisconsin, USA")
 * @param {string} [country]  - Optional country hint (unused if already embedded in placeName)
 * @returns {Promise<{ lat: number, lng: number, confidence: 'exact'|'fallback'|'failed' } | null>}
 */
export async function geocodePlace(placeName, country) {
  if (!placeName) return null;

  // Build the primary query
  const primaryQuery = country && !placeName.includes(country)
    ? `${placeName}, ${country}`
    : placeName;

  // --- Primary attempt ---
  const primaryResult = await _fetchNominatim(primaryQuery);
  if (primaryResult) {
    return { ...primaryResult, confidence: 'exact' };
  }

  // --- Fallback: try state+country only ---
  // Extract a potential state-level fallback from the query string
  // Heuristic: last two comma-separated tokens (e.g. "Wisconsin, USA")
  const parts = primaryQuery.split(',').map(p => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const fallbackQuery = parts.slice(-2).join(', ');
    if (fallbackQuery !== primaryQuery) {
      const fallbackResult = await _fetchNominatim(fallbackQuery);
      if (fallbackResult) {
        return { ...fallbackResult, confidence: 'fallback' };
      }
    }
  }

  return { lat: null, lng: null, confidence: 'failed' };
}

/**
 * Internal: fetch one query from Nominatim. Caller is responsible for rate limiting
 * BEFORE this call when retrying (first call has no prior delay requirement).
 *
 * @param {string} query
 * @returns {Promise<{ lat: number, lng: number } | null>}
 */
async function _fetchNominatim(query) {
  // Enforce global rate limit — wait if last request was too recent
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_MS) {
    await sleep(RATE_LIMIT_MS - elapsed);
  }

  const url = `${NOMINATIM_BASE}?q=${encodeURIComponent(query)}&format=json&limit=1`;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      lastRequestTime = Date.now();
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT }
      });

      if (response.status === 429) {
        const retryDelay = RETRY_DELAY_MS * (attempt + 1);
        console.error(`  Nominatim 429 for "${query}" — retrying in ${retryDelay / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await sleep(retryDelay);
        continue;
      }

      if (!response.ok) {
        console.error(`  Nominatim HTTP ${response.status} for "${query}"`);
        return null;
      }

      const data = await response.json();

      if (!Array.isArray(data) || data.length === 0) {
        return null;
      }

      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon)
      };
    } catch (err) {
      console.error(`  Error geocoding "${query}":`, err.message);
      return null;
    }
  }

  console.error(`  Nominatim failed after ${MAX_RETRIES} retries for "${query}"`);
  return null;
}

/**
 * Geocode a batch of places sequentially, respecting Nominatim rate limits.
 *
 * @param {Array<{ canonicalId: string, canonicalName: string, country?: string }>} places
 * @param {{ existingPlaces?: Map<string, { lat: number, lng: number }> }} [options]
 * @returns {Promise<Map<string, { lat: number|null, lng: number|null, confidence: string }>>}
 */
export async function geocodeBatch(places, options = {}) {
  const existingPlaces = options.existingPlaces || new Map();
  const results = new Map();
  const total = places.length;
  let processed = 0;
  let firstRequest = true;

  for (const place of places) {
    const { canonicalId, canonicalName, country } = place;

    // Skip places that already have coordinates
    if (existingPlaces.has(canonicalId)) {
      const existing = existingPlaces.get(canonicalId);
      results.set(canonicalId, { ...existing, confidence: 'existing' });
      processed++;
      if (processed % 50 === 0) {
        console.log(`Geocoded ${processed}/${total} places...`);
      }
      continue;
    }

    // Rate limiting is now handled globally inside _fetchNominatim
    const result = await geocodePlace(canonicalName, country);
    results.set(canonicalId, result || { lat: null, lng: null, confidence: 'failed' });

    processed++;
    if (processed % 50 === 0) {
      console.log(`Geocoded ${processed}/${total} places...`);
    }
  }

  return results;
}
