import { Color, Rectangle } from 'cesium';
import { REGION_COLOR_HEX } from './regions';

export const REGION_COLORS: Record<string, Color> = Object.fromEntries(
  Object.entries(REGION_COLOR_HEX).map(([region, hex]) => [
    region,
    Color.fromCssColorString(hex),
  ]),
) as Record<string, Color>;

export const FAMILY_BRANCHES: Record<
  string,
  { label: string; surnames: string[] }
> = {
  all: { label: 'All Families', surnames: [] },
};

/** Legacy close-up of Marin County — kept for reference but no longer used as default. */
export const MARIN_VIEW = Rectangle.fromDegrees(-123.1, 37.8, -122.3, 38.35);

/** Default globe view: North Atlantic showing US east coast + Western Europe.
 *  Shows the transatlantic migration corridor where most family events cluster. */
export const DEFAULT_GLOBE_VIEW = Rectangle.fromDegrees(-100, 25, 15, 60);

/** Approximate-location ring radius in meters, keyed by precision level. */
export const APPROXIMATE_RING_RADIUS: Record<string, number> = {
  country: 200_000,
  state: 100_000,
  county: 40_000,
  city: 15_000,
  exact: 0, // never rendered as a ring
};

/** Arc color by century of departure. */
export const ERA_COLORS: Record<string, string> = {
  pre1700: '#3b82f6', // deep blue
  '1700s': '#14b8a6', // teal
  '1800s': '#f59e0b', // amber
  '1900s': '#f97316', // orange
  '2000s': '#ef4444', // red
  unknown: '#6b7280', // gray
};

/** Arc color by family surname (top surnames get distinct colors). */
export const FAMILY_ARC_COLORS: Record<string, string> = {
  watson: '#e63946',
  lindsay: '#2a9d8f',
  gorney: '#457b9d',
  martin: '#f4a261',
  woodman: '#e9c46a',
  keeler: '#06d6a0',
  mclean: '#118ab2',
  pais: '#a855f7',
  default: '#8d99ae',
};
