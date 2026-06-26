/**
 * Utilities for parsing and working with place strings
 */

// US state names for detection
const US_STATES = new Set([
  'alabama',
  'alaska',
  'arizona',
  'arkansas',
  'california',
  'colorado',
  'connecticut',
  'delaware',
  'florida',
  'georgia',
  'hawaii',
  'idaho',
  'illinois',
  'indiana',
  'iowa',
  'kansas',
  'kentucky',
  'louisiana',
  'maine',
  'maryland',
  'massachusetts',
  'michigan',
  'minnesota',
  'mississippi',
  'missouri',
  'montana',
  'nebraska',
  'nevada',
  'new hampshire',
  'new jersey',
  'new mexico',
  'new york',
  'north carolina',
  'north dakota',
  'ohio',
  'oklahoma',
  'oregon',
  'pennsylvania',
  'rhode island',
  'south carolina',
  'south dakota',
  'tennessee',
  'texas',
  'utah',
  'vermont',
  'virginia',
  'washington',
  'west virginia',
  'wisconsin',
  'wyoming',
  'district of columbia',
]);

export interface ParsedPlace {
  region: string | undefined;
  country: string | undefined;
}

/**
 * Parse place string to extract region (state/county) and country
 */
export function parsePlace(place: string | undefined): ParsedPlace {
  if (!place) return { region: undefined, country: undefined };

  const parts = place.split(',').map((p) => p.trim());
  const lastPart = parts[parts.length - 1]?.toLowerCase() || '';

  // Check if last part is USA variation
  const isUSA =
    lastPart === 'usa' ||
    lastPart === 'u.s.' ||
    lastPart === 'u.s.a.' ||
    lastPart === 'united states' ||
    lastPart === 'united states of america' ||
    lastPart === 'america';

  // Check if last part is a US state (means country was omitted)
  const isUSState = US_STATES.has(lastPart);

  if (isUSA) {
    // Format: "City, State, United States" - get the state
    const statePart = parts[parts.length - 2]?.toLowerCase();
    if (statePart && US_STATES.has(statePart)) {
      return { region: parts[parts.length - 2], country: 'USA' };
    }
    return { region: undefined, country: 'USA' };
  }

  if (isUSState) {
    // Format: "City, State" or "County, State" - country omitted
    return { region: parts[parts.length - 1], country: 'USA' };
  }

  // UK variations
  const isUK =
    lastPart === 'uk' ||
    lastPart === 'u.k.' ||
    lastPart === 'united kingdom' ||
    lastPart === 'great britain' ||
    lastPart === 'britain' ||
    lastPart === 'england' ||
    lastPart === 'scotland' ||
    lastPart === 'wales' ||
    lastPart === 'ireland';

  if (isUK) {
    // Get the constituent country (England, Scotland, Wales) or county
    const regionPart = parts[parts.length - 2] || parts[parts.length - 1];
    return { region: regionPart, country: 'UK' };
  }

  // Other countries - just return the last part as country
  return { region: parts[parts.length - 2], country: parts[parts.length - 1] };
}

/**
 * Build journey description from birth and death places
 */
export function getJourneyDescription(
  birthPlace: string | undefined,
  deathPlace: string | undefined,
): string | undefined {
  const birth = parsePlace(birthPlace);
  const death = parsePlace(deathPlace);

  if (!birth.country || !death.country) return undefined;

  // Different countries - show country-to-country journey
  if (birth.country !== death.country) {
    return `Journeyed from ${birth.country} to ${death.country}`;
  }

  // Same country but different regions (e.g., Maryland to Kentucky)
  if (
    birth.region &&
    death.region &&
    birth.region.toLowerCase() !== death.region.toLowerCase()
  ) {
    return `Journeyed from ${birth.region} to ${death.region}`;
  }

  return undefined;
}

/**
 * Extract country from a place string
 */
export function extractCountry(place: string | undefined): string | undefined {
  return parsePlace(place).country;
}

/**
 * Check if a place is in the USA
 */
export function isUSAPlace(place: string | undefined): boolean {
  return parsePlace(place).country === 'USA';
}

/**
 * Check if a place is in the UK
 */
export function isUKPlace(place: string | undefined): boolean {
  return parsePlace(place).country === 'UK';
}
