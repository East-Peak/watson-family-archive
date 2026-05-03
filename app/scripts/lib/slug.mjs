import { existsSync, readdirSync } from 'fs';
import { getPath } from './config.mjs';

const CHARACTER_REPLACEMENTS = new Map([
  ['ß', 'ss'],
  ['Æ', 'AE'],
  ['æ', 'ae'],
  ['Ø', 'O'],
  ['ø', 'o'],
  ['Å', 'A'],
  ['å', 'a'],
  ['Ä', 'Ae'],
  ['ä', 'ae'],
  ['Ö', 'Oe'],
  ['ö', 'oe'],
  ['Ü', 'Ue'],
  ['ü', 'ue'],
]);

function transliterate(value) {
  return Array.from(value, ch => CHARACTER_REPLACEMENTS.get(ch) || ch).join('');
}

/**
 * Convert a person name to a slug.
 * "John William Smith Jr." → "john_william_smith_jr"
 * Strips titles (Sir, Lady, Captain, Mrs, etc.)
 */
export function nameToSlug(name) {
  if (typeof name !== 'string') return '';

  const normalized = transliterate(name)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .trim();

  if (!normalized) return '';

  return normalized
    .replace(/^(Sir|Lady|Captain|Capt\.?|Mrs?\.?|Dr\.?|Rev\.?|Deacon|Master)\s+/i, '')
    .replace(/["'`\u2018\u2019\u201C\u201D]/g, '')
    .replace(/\./g, '')
    .replace(/\s*\(.*?\)\s*/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

export function loadExistingSlugs(nodesDir = getPath('nodesDir')) {
  if (!existsSync(nodesDir)) return new Set();

  return new Set(
    readdirSync(nodesDir)
      .filter(f => f.endsWith('.md') && f !== '_TEMPLATE.md')
      .map(f => f.replace('.md', ''))
  );
}

/**
 * Given a desired slug, return a unique slug by appending birth year or _2, _3, etc.
 */
export function reserveUniqueSlug(baseSlug, birthYear, takenSlugs = loadExistingSlugs()) {
  if (!baseSlug) throw new Error('Cannot generate unique slug from an empty base slug');

  if (!takenSlugs.has(baseSlug)) {
    takenSlugs.add(baseSlug);
    return baseSlug;
  }

  if (birthYear) {
    const withYear = `${baseSlug}_${birthYear}`;
    if (!takenSlugs.has(withYear)) {
      takenSlugs.add(withYear);
      return withYear;
    }
  }

  for (let i = 2; i < 100; i++) {
    const candidate = `${baseSlug}_${i}`;
    if (!takenSlugs.has(candidate)) {
      takenSlugs.add(candidate);
      return candidate;
    }
  }

  throw new Error(`Cannot generate unique slug for ${baseSlug}`);
}

export function uniqueSlug(baseSlug, birthYear) {
  return reserveUniqueSlug(baseSlug, birthYear, loadExistingSlugs());
}

export function isValidSlug(slug) {
  return /^[a-z0-9_]+$/.test(slug);
}
