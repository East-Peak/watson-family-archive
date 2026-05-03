import type { GlobeData, Location } from './types';

export const REGION_COLOR_HEX: Record<string, string> = {
  England: '#e63946',
  Wales: '#2a9d8f',
  Scotland: '#457b9d',
  'United Kingdom': '#8d99ae',
  USA: '#f4a261',
  Germany: '#e9c46a',
  Ireland: '#06d6a0',
  Canada: '#118ab2',
  France: '#9b5de5',
  Netherlands: '#fb8500',
  Poland: '#ef476f',
  Switzerland: '#f72585',
  default: '#8d99ae',
};

const PREFERRED_REGION_ORDER = [
  'England',
  'Wales',
  'Scotland',
  'United Kingdom',
  'USA',
  'Germany',
  'Ireland',
  'Canada',
  'France',
  'Netherlands',
  'Poland',
  'Switzerland',
];

const WALES_MARKERS = [
  'wales',
  'anglesey',
  'brecknockshire',
  'caernarfonshire',
  'cardiff',
  'cardiganshire',
  'carmarthenshire',
  'ceredigion',
  'denbighshire',
  'flintshire',
  'glamorgan',
  'merionethshire',
  'monmouthshire',
  'montgomeryshire',
  'pembrokeshire',
  'powys',
  'radnorshire',
  'swansea',
];

const SCOTLAND_MARKERS = [
  'scotland',
  'aberdeen',
  'argyll',
  'ayrshire',
  'dundee',
  'edinburgh',
  'fife',
  'glasgow',
  'highland',
  'inverness',
  'lanarkshire',
  'midlothian',
  'perthshire',
  'renfrewshire',
  'stirling',
];

const ENGLAND_MARKERS = [
  'england',
  'bedfordshire',
  'berkshire',
  'bristol',
  'buckinghamshire',
  'cambridgeshire',
  'cheshire',
  'cornwall',
  'cumberland',
  'derbyshire',
  'devon',
  'dorset',
  'durham',
  'essex',
  'gloucestershire',
  'hampshire',
  'hertfordshire',
  'kent',
  'lancashire',
  'leicestershire',
  'lincolnshire',
  'london',
  'middlesex',
  'norfolk',
  'northamptonshire',
  'northumberland',
  'nottinghamshire',
  'oxfordshire',
  'shropshire',
  'somerset',
  'staffordshire',
  'suffolk',
  'surrey',
  'sussex',
  'warwickshire',
  'wiltshire',
  'worcestershire',
  'yorkshire',
];

function containsAnyMarker(text: string, markers: string[]): boolean {
  return markers.some((marker) => text.includes(marker));
}

function isLikelyUnitedKingdomCoordinate(location: Pick<Location, 'lat' | 'lng'>): boolean {
  return location.lat >= 49 && location.lat <= 61 && location.lng >= -11 && location.lng <= 4;
}

function inferUnitedKingdomRegion(location: Pick<Location, 'name' | 'city' | 'state'>): string {
  const text = `${location.name} ${location.city} ${location.state}`.toLowerCase();

  if (containsAnyMarker(text, WALES_MARKERS)) return 'Wales';
  if (containsAnyMarker(text, SCOTLAND_MARKERS)) return 'Scotland';
  if (containsAnyMarker(text, ENGLAND_MARKERS)) return 'England';

  return 'United Kingdom';
}

export function getLocationRegion(
  location: Pick<Location, 'country' | 'name' | 'city' | 'state' | 'lat' | 'lng'>,
): string {
  const country = location.country.trim();
  if (!country) return '';

  if (country === 'United States' || country === 'USA') {
    return 'USA';
  }

  if (country === 'United Kingdom') {
    if (!isLikelyUnitedKingdomCoordinate(location)) {
      return 'United Kingdom';
    }
    return inferUnitedKingdomRegion(location);
  }

  return country;
}

function regionSort(a: string, b: string): number {
  const aIndex = PREFERRED_REGION_ORDER.indexOf(a);
  const bIndex = PREFERRED_REGION_ORDER.indexOf(b);

  if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
  if (aIndex !== -1) return -1;
  if (bIndex !== -1) return 1;

  return a.localeCompare(b);
}

export function getRegionOptions(globeData: GlobeData | null): string[] {
  if (!globeData) return [];

  const regions = new Set<string>();
  for (const location of globeData.locations) {
    const region = getLocationRegion(location);
    if (region) regions.add(region);
  }

  return Array.from(regions).sort(regionSort);
}
