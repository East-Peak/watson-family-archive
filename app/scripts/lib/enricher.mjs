/**
 * enricher.mjs
 *
 * Wikipedia + Wikimedia Commons + Google Maps enrichment service.
 * Used by generate-locations.mjs (Task 5) to fetch summaries, photos,
 * and map links for canonical places in the place registry.
 *
 * All APIs are free and require no key. Uses native fetch (Node.js 25+).
 */

// ---------------------------------------------------------------------------
// Wikipedia REST API
// ---------------------------------------------------------------------------

/**
 * Fetch a Wikipedia article summary for a place name.
 *
 * @param {string} placeName - Canonical place name (e.g. "Dane County, Wisconsin")
 * @returns {{ title: string, url: string, summary: string } | null}
 */
export async function fetchWikipediaSummary(placeName) {
  const endpoint = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(placeName)}`;

  try {
    const res = await fetch(endpoint, {
      headers: { 'User-Agent': 'GenealogyToolkit/1.0 (self-hosted genealogy research project)' },
    });

    if (res.status === 404) return null;
    if (!res.ok) {
      console.warn(`[enricher] Wikipedia HTTP ${res.status} for "${placeName}"`);
      return null;
    }

    const data = await res.json();

    // Disambiguation pages are not useful summaries
    if (data.type === 'disambiguation') return null;

    const title = data.title ?? null;
    const url = data.content_urls?.desktop?.page ?? null;
    const extract = data.extract ?? '';
    const summary = extract.substring(0, 300);

    if (!title || !url) return null;

    return { title, url, summary };
  } catch (err) {
    console.warn(`[enricher] Wikipedia fetch error for "${placeName}":`, err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Wikimedia Commons API
// ---------------------------------------------------------------------------

/** Strip HTML tags from a string (e.g. <a href="...">Artist Name</a> → Artist Name) */
function stripHtml(str) {
  if (!str) return null;
  return str.replace(/<[^>]+>/g, '').trim() || null;
}

/**
 * Score a Wikimedia search result page for relevance.
 * Higher is better. Returns a numeric score.
 *
 * @param {string} title - File title from API (e.g. "File:Dane_County_courthouse.jpg")
 * @param {string} placeName - The place we searched for
 * @param {number|undefined} targetYear - Optional year preference
 * @param {object} imageinfo - imageinfo object from API
 */
function scoreWikimediaResult(title, placeName, targetYear, imageinfo) {
  let score = 0;

  const titleLower = title.toLowerCase();
  const placeWords = placeName.toLowerCase().split(/[\s,]+/).filter(Boolean);

  // Penalize non-photo formats and irrelevant content
  if (/\.(svg|pdf|djvu|tiff?|gif|ogg|ogv|webm)$/i.test(titleLower)) return -Infinity;
  if (/\b(map|flag|coat.of.arms|logo|seal|emblem)\b/i.test(titleLower)) return -Infinity;

  // Reward title words that match the place name
  for (const word of placeWords) {
    if (word.length > 3 && titleLower.includes(word)) {
      score += 10;
    }
  }

  // Reward JPEG/PNG photos over other formats
  if (/\.(jpg|jpeg|png)$/i.test(titleLower)) score += 5;

  // Date proximity scoring
  if (targetYear && imageinfo?.extmetadata?.DateTime?.value) {
    const dateStr = imageinfo.extmetadata.DateTime.value;
    const yearMatch = dateStr.match(/\d{4}/);
    if (yearMatch) {
      const photoYear = parseInt(yearMatch[0], 10);
      const distance = Math.abs(photoYear - targetYear);
      // Closer years score higher; max bonus 20 at distance 0
      score += Math.max(0, 20 - distance);
    }
  }

  return score;
}

/**
 * Fetch a representative photo from Wikimedia Commons for a place.
 *
 * @param {string} placeName - Canonical place name
 * @param {{ targetYear?: number }} [options]
 * @returns {{ fileTitle: string, thumbnailUrl: string, attribution: string|null, license: string|null } | null}
 */
export async function fetchWikimediaPhoto(placeName, options = {}) {
  const { targetYear } = options;

  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrnamespace: '6',
    gsrsearch: placeName,
    gsrlimit: '5',
    prop: 'imageinfo',
    iiprop: 'url|extmetadata',
    iiurlwidth: '800',
    format: 'json',
    origin: '*',
  });

  const endpoint = `https://commons.wikimedia.org/w/api.php?${params}`;

  try {
    const res = await fetch(endpoint, {
      headers: { 'User-Agent': 'GenealogyToolkit/1.0 (self-hosted genealogy research project)' },
    });

    if (!res.ok) {
      console.warn(`[enricher] Wikimedia HTTP ${res.status} for "${placeName}"`);
      return null;
    }

    const data = await res.json();
    const pages = data?.query?.pages;
    if (!pages) return null;

    // Score all candidate pages
    const candidates = Object.values(pages)
      .map((page) => {
        const imageinfo = page.imageinfo?.[0] ?? null;
        const score = scoreWikimediaResult(page.title ?? '', placeName, targetYear, imageinfo);
        return { page, imageinfo, score };
      })
      .filter((c) => c.score > -Infinity && c.imageinfo?.url)
      .sort((a, b) => b.score - a.score);

    if (candidates.length === 0) return null;

    const best = candidates[0];
    const { page, imageinfo } = best;

    const fileTitle = page.title ?? null;
    const thumbnailUrl = imageinfo.thumburl ?? imageinfo.url ?? null;
    const license = imageinfo.extmetadata?.LicenseShortName?.value ?? null;
    const attribution = stripHtml(imageinfo.extmetadata?.Artist?.value ?? null);

    if (!fileTitle || !thumbnailUrl) return null;

    return { fileTitle, thumbnailUrl, attribution, license };
  } catch (err) {
    console.warn(`[enricher] Wikimedia fetch error for "${placeName}":`, err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Google Maps URL generator
// ---------------------------------------------------------------------------

/**
 * Generate Google Maps URLs from coordinates.
 *
 * @param {number} lat
 * @param {number} lng
 * @returns {{ url: string, embedUrl: string }}
 */
export function generateGoogleMapsUrls(lat, lng) {
  return {
    url: `https://www.google.com/maps?q=${lat},${lng}`,
    embedUrl: `https://maps.google.com/maps?q=${lat},${lng}&z=12&output=embed`,
  };
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Enrich a canonical place with Wikipedia summary, Wikimedia photo, and Google Maps URLs.
 *
 * @param {string} canonicalName - Canonical place name
 * @param {number} lat
 * @param {number} lng
 * @param {{ targetYear?: number }} [options]
 * @returns {{
 *   wikipedia: { title: string, url: string, summary: string } | null,
 *   wikimedia: { fileTitle: string, thumbnailUrl: string, attribution: string|null, license: string|null } | null,
 *   googleMaps: { url: string, embedUrl: string }
 * }}
 */
export async function enrichPlace(canonicalName, lat, lng, options = {}) {
  const wikipedia = await fetchWikipediaSummary(canonicalName);

  // Polite 100ms delay between requests
  await new Promise((resolve) => setTimeout(resolve, 100));

  const wikimedia = await fetchWikimediaPhoto(canonicalName, options);

  const googleMaps = generateGoogleMapsUrls(lat, lng);

  return { wikipedia, wikimedia, googleMaps };
}
