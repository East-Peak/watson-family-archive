import { Cartesian3 } from 'cesium';
import { FAMILY_BRANCHES } from './constants';

export function getPersonBranch(name: string): string {
  const lowerName = name.toLowerCase();
  for (const [branch, { surnames }] of Object.entries(FAMILY_BRANCHES)) {
    if (branch === 'all') continue;
    if (surnames.some((surname) => lowerName.includes(surname))) {
      return branch;
    }
  }
  return 'other';
}

export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const radiusKm = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return radiusKm * c;
}

function getArcAltitude(distanceKm: number): number {
  const minAltitude = 5000;
  const maxAltitude = 500000;

  if (distanceKm < 50) return minAltitude;

  const normalized = Math.log10(distanceKm / 50) / Math.log10(400);
  return minAltitude + (maxAltitude - minAltitude) * Math.min(Math.max(normalized, 0), 1);
}

function computeArcPositions(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  numPoints: number = 50
): Cartesian3[] {
  const positions: Cartesian3[] = [];
  const distance = haversineDistance(fromLat, fromLng, toLat, toLng);
  const maxAltitude = getArcAltitude(distance);

  for (let i = 0; i <= numPoints; i += 1) {
    const t = i / numPoints;
    const lat = fromLat + (toLat - fromLat) * t;
    const lng = fromLng + (toLng - fromLng) * t;
    const altitude = maxAltitude * 4 * t * (1 - t);
    positions.push(Cartesian3.fromDegrees(lng, lat, altitude));
  }

  return positions;
}

// --- Arc geometry memoization ---
// Keyed by "fromLat,fromLng,toLat,toLng" so identical endpoints reuse geometry.
// Filter changes (opacity/color) do not regenerate positions.

const arcPositionCache = new Map<string, Cartesian3[]>();

export function arcCacheKey(fromLat: number, fromLng: number, toLat: number, toLng: number): string {
  return `${fromLat},${fromLng},${toLat},${toLng}`;
}

export function generateArcPositions(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  numPoints: number = 50
): Cartesian3[] {
  const key = arcCacheKey(fromLat, fromLng, toLat, toLng);
  const cached = arcPositionCache.get(key);
  if (cached) return cached;

  const positions = computeArcPositions(fromLat, fromLng, toLat, toLng, numPoints);
  arcPositionCache.set(key, positions);
  return positions;
}

/** Clear the arc position cache (useful for testing). */
export function clearArcPositionCache(): void {
  arcPositionCache.clear();
}

/** Return the current cache size (useful for testing). */
export function getArcPositionCacheSize(): number {
  return arcPositionCache.size;
}
