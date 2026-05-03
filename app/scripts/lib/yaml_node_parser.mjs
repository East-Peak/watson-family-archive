/**
 * Shared YAML Node Parser & Writer Library
 *
 * Reads and writes verified_nodes markdown files with YAML frontmatter.
 * After the YAML frontmatter migration, this replaces the regex-based
 * parsing in rebuild-from-markdown.mjs and node_parser.mjs.
 *
 * ALL writes to verified_nodes/ should go through writePersonFile() or
 * createStubPersonFile(). This ensures schema validation, bidirectional
 * relationship integrity, and consistent formatting.
 */

import matter from 'gray-matter';
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, basename } from 'path';
import { fileURLToPath } from 'url';
import { getPath } from './config.mjs';

const __dirname = import.meta.dirname || (() => {
  const { dirname } = require('path');
  return dirname(fileURLToPath(import.meta.url));
})();

const DEFAULT_NODES_DIR = getPath('nodesDir');

/**
 * Parse a single verified_node markdown file with YAML frontmatter.
 *
 * @param {string} filePath - Path to the .md file
 * @returns {{ frontmatter: object, body: string, raw: string } | null}
 */
export function parsePersonFile(filePath) {
  const raw = readFileSync(filePath, 'utf8');
  const slug = basename(filePath, '.md');
  if (slug === '_TEMPLATE') return null;

  // Check if file has YAML frontmatter
  if (!raw.startsWith('---')) {
    // Legacy file — fall back to basic extraction
    return parseLegacyFile(filePath, raw, slug);
  }

  let parsed;
  try {
    parsed = matter(raw);
  } catch (error) {
    throw new Error(`Failed to parse YAML frontmatter in ${filePath}: ${error.message}`);
  }

  const { data: frontmatter, content: body } = parsed;
  return { frontmatter, body, raw };
}

/**
 * Parse all verified_node files from the directory.
 *
 * @param {string} [nodesDir] - Directory path (defaults to data/verified_nodes/)
 * @returns {Array<{ slug: string, frontmatter: object, body: string }>}
 */
export function parseAllPersonFiles(nodesDir = DEFAULT_NODES_DIR) {
  if (!existsSync(nodesDir)) return [];

  const files = readdirSync(nodesDir).filter(f => f.endsWith('.md') && !f.startsWith('_'));
  const results = [];

  for (const file of files) {
    const filePath = join(nodesDir, file);
    const parsed = parsePersonFile(filePath);
    if (!parsed) continue;
    results.push({
      slug: basename(file, '.md'),
      ...parsed,
    });
  }

  return results;
}

/**
 * Extract the full name from frontmatter, with fallback to slug.
 */
export function getFullName(fm) {
  if (fm?.name?.full) return fm.name.full;

  const parts = [fm?.name?.given, fm?.name?.surname, fm?.name?.suffix]
    .filter(Boolean)
    .join(' ')
    .trim();

  return parts || fm?.slug?.replace(/_/g, ' ') || '';
}

/**
 * Extract search parameters from frontmatter (for use by node_parser.mjs).
 */
export function toSearchParams(slug, fm) {
  const fullName = fm.name?.full || slug.replace(/_/g, ' ');
  const parts = fullName.split(/\s+/);

  return {
    nodeFile: slug,
    fullName,
    firstName: fm.name?.given || parts[0] || '',
    lastName: fm.name?.surname || parts[parts.length - 1] || '',
    middleName: parts.length > 2 ? parts.slice(1, -1).join(' ') : undefined,
    maidenName: fm.name?.maiden || undefined,
    birthDate: fm.birth?.date || '',
    birthYear: extractYear(fm.birth?.date),
    birthPlace: fm.birth?.place || '',
    birthState: extractState(fm.birth?.place),
    deathDate: fm.death?.date || '',
    deathYear: extractYear(fm.death?.date),
    gender: fm.sex?.toLowerCase() || '',
    likelyLiving: fm.status === 'living' ||
      (extractYear(fm.birth?.date) > 1940 && !fm.death?.date),
  };
}

/**
 * Extract life events from the markdown body (they remain in the body, not frontmatter).
 */
export function parseLifeEvents(body) {
  const events = [];
  const lines = body.split('\n');
  let inEventsSection = false;

  for (const line of lines) {
    if (/^## Life Events/i.test(line)) { inEventsSection = true; continue; }
    if (inEventsSection && /^## [^#]/.test(line)) break;
    if (!inEventsSection) continue;

    const match = line.match(/^\|\s*([^|]*)\|\s*([^|]*)\|\s*([^|]*)\|\s*([^|]*)\|\s*([^|]*)\|/);
    if (!match) continue;
    const year = match[1].trim(), age = match[2].trim(), event = match[3].trim(),
          location = match[4].trim(), source = match[5].trim();
    if (year === 'Year' || year.startsWith('---') || !event) continue;
    events.push({ year, age, event, location, source });
  }
  return events;
}

/**
 * Extract biography section from the markdown body.
 */
export function extractBiography(body) {
  const lines = body.split('\n');
  let inBio = false;
  const result = [];
  for (const line of lines) {
    if (/^## Biography|^## Summary/i.test(line)) { inBio = true; continue; }
    if (inBio && /^## [^#]/.test(line)) break;
    if (inBio) result.push(line);
  }
  return result.length > 0 ? result.join('\n').trim() : '';
}

// --- Helpers ---

function extractYear(dateStr) {
  if (!dateStr) return undefined;
  const match = String(dateStr).match(/\b(1[4-9]\d{2}|20[0-2]\d)\b/);
  return match ? parseInt(match[1]) : undefined;
}

function extractState(place) {
  if (!place) return undefined;
  const stateMatch = place.match(/,\s*([A-Z]{2})\s*$/) || place.match(/,\s*(\w[\w\s]+)$/);
  return stateMatch ? stateMatch[1].trim() : undefined;
}

/**
 * Legacy file parser — minimal extraction for files not yet migrated.
 * Returns same shape as parsePersonFile but extracts from old format.
 */
function parseLegacyFile(filePath, raw, slug) {
  // Build minimal frontmatter from regex
  const titleMatch = raw.match(/^# Verified Node:\s*(.+)/m);
  const fullName = titleMatch ? titleMatch[1].trim() : slug.replace(/_/g, ' ');

  const fm = {
    slug,
    name: { full: fullName },
    status: 'needs_research',
  };

  return { frontmatter: fm, body: raw, raw };
}

// ═══════════════════════════════════════════════════════════════════════
// WRITE LAYER — All writes to verified_nodes/ go through these functions
// ═══════════════════════════════════════════════════════════════════════

const VALID_SEX = new Set(['Male', 'Female']);
const VALID_STATUS = new Set([
  'verified', 'partially_verified', 'needs_research',
  'auto_generated', 'deep_verified', 'living', 'cross_reference', 'stub',
]);
const VALID_BIO_TIER = new Set([
  'hand_crafted', 'composed', 'structured_only', 'stub',
]);
const SLUG_RE = /^[a-z0-9_]+$/;
const GARBAGE_PLACE_RE = /^(PARTIAL|NONE|Missing|Not specified|not specified|MODERATELY VERIFIED|HIGH|MEDIUM|LOW|UNKNOWN|N\/A)$/i;

/**
 * Validate frontmatter data against the verified_nodes schema.
 * Returns cleaned data with errors logged (not thrown — callers decide severity).
 *
 * @param {object} data - Frontmatter object to validate
 * @param {string} [expectedSlug] - If provided, slug must match this value
 * @returns {{ valid: boolean, errors: string[], warnings: string[], cleaned: object }}
 */
export function validateFrontmatter(data, expectedSlug) {
  const errors = [];
  const warnings = [];
  const cleaned = structuredClone(data);

  // Slug
  if (!cleaned.slug || typeof cleaned.slug !== 'string') {
    errors.push('Missing or invalid slug');
  } else if (!SLUG_RE.test(cleaned.slug)) {
    errors.push(`Slug contains invalid characters: "${cleaned.slug}"`);
  }
  if (expectedSlug && cleaned.slug !== expectedSlug) {
    errors.push(`Slug "${cleaned.slug}" does not match expected "${expectedSlug}"`);
  }

  // Sex
  if (cleaned.sex !== null && cleaned.sex !== undefined) {
    if (!VALID_SEX.has(cleaned.sex)) {
      warnings.push(`Invalid sex "${cleaned.sex}" → null`);
      cleaned.sex = null;
    }
  }

  // Status
  if (cleaned.status && !VALID_STATUS.has(cleaned.status)) {
    warnings.push(`Invalid status "${cleaned.status}" → "needs_research"`);
    cleaned.status = 'needs_research';
  }

  // Bio tier
  if (cleaned.bio_tier !== null && cleaned.bio_tier !== undefined) {
    if (!VALID_BIO_TIER.has(cleaned.bio_tier)) {
      warnings.push(`Invalid bio_tier "${cleaned.bio_tier}" → removed`);
      delete cleaned.bio_tier;
    }
  }

  // Parents: must be { father: slug|null, mother: slug|null }
  if (cleaned.parents) {
    if (typeof cleaned.parents !== 'object' || Array.isArray(cleaned.parents)) {
      warnings.push('Parents is not an object, resetting');
      cleaned.parents = { father: null, mother: null };
    } else {
      for (const role of ['father', 'mother']) {
        const val = cleaned.parents[role];
        if (val !== null && val !== undefined) {
          if (typeof val !== 'string' || !SLUG_RE.test(val)) {
            warnings.push(`Invalid parents.${role} "${val}" → null`);
            cleaned.parents[role] = null;
          }
        }
      }
    }
  }

  // Spouses: array of { slug, marriage_date, marriage_place } objects (convert bare strings)
  if (Array.isArray(cleaned.spouses)) {
    cleaned.spouses = cleaned.spouses
      .map(sp => {
        if (typeof sp === 'string') {
          if (!SLUG_RE.test(sp)) {
            warnings.push(`Removing garbage spouse "${sp}"`);
            return null;
          }
          return { slug: sp, marriage_date: null, marriage_place: null };
        }
        if (sp && typeof sp === 'object' && sp.slug) {
          if (!SLUG_RE.test(sp.slug)) {
            warnings.push(`Removing garbage spouse slug "${sp.slug}"`);
            return null;
          }
          return sp;
        }
        warnings.push(`Removing invalid spouse entry: ${JSON.stringify(sp)}`);
        return null;
      })
      .filter(Boolean);
  }

  // Children: array of slugs
  if (Array.isArray(cleaned.children)) {
    cleaned.children = cleaned.children.filter(child => {
      if (typeof child === 'string' && SLUG_RE.test(child) && child.length <= 60) return true;
      warnings.push(`Removing garbage child "${child}"`);
      return false;
    });
  }

  // Siblings: array of slugs
  if (Array.isArray(cleaned.siblings)) {
    cleaned.siblings = cleaned.siblings.filter(sib => {
      if (typeof sib === 'string' && SLUG_RE.test(sib) && sib.length <= 60) return true;
      warnings.push(`Removing garbage sibling "${sib}"`);
      return false;
    });
  }

  // Dates: must be strings or null (reject objects, numbers, confidence ratings)
  for (const section of ['birth', 'death']) {
    if (cleaned[section]?.date !== null && cleaned[section]?.date !== undefined) {
      const d = cleaned[section].date;
      if (typeof d !== 'string' || GARBAGE_PLACE_RE.test(d)) {
        warnings.push(`Invalid ${section}.date "${d}" → null`);
        cleaned[section].date = null;
      }
    }
  }

  // Places: must be strings or null (reject garbage values)
  for (const section of ['birth', 'death']) {
    if (cleaned[section]?.place !== null && cleaned[section]?.place !== undefined) {
      const p = cleaned[section].place;
      if (typeof p !== 'string' || GARBAGE_PLACE_RE.test(p)) {
        warnings.push(`Invalid ${section}.place "${p}" → null`);
        cleaned[section].place = null;
      }
    }
  }

  // Sources validation
  if (cleaned.sources != null) {
    if (!Array.isArray(cleaned.sources)) {
      warnings.push('sources should be an array');
      cleaned.sources = [];
    } else {
      const validProviders = new Set(['familysearch', 'findagrave', 'wikitree', 'newspapers', 'ancestry', 'other']);
      cleaned.sources = cleaned.sources.map((s, i) => {
        if (!s || typeof s !== 'object') {
          warnings.push(`sources[${i}]: not an object`);
          return null;
        }
        if (!s.collection || typeof s.collection !== 'string' || !s.collection.trim()) {
          warnings.push(`sources[${i}]: missing or empty collection`);
        }
        if (s.provider && !validProviders.has(s.provider)) {
          warnings.push(`sources[${i}]: unknown provider "${s.provider}"`);
        }
        if (s.url && typeof s.url === 'string' && !s.url.startsWith('http')) {
          warnings.push(`sources[${i}]: url should start with http`);
        }
        if (s.key_facts && !Array.isArray(s.key_facts)) {
          warnings.push(`sources[${i}]: key_facts should be an array`);
          s.key_facts = [];
        }
        return s;
      }).filter(Boolean);
    }
  } else {
    cleaned.sources = [];
  }

  const valid = errors.length === 0;
  return { valid, errors, warnings, cleaned };
}

/**
 * Write a verified_node file with validation.
 * Refuses to write if critical validation errors exist.
 *
 * @param {string} slug - Person slug (filename without .md)
 * @param {object} frontmatter - YAML frontmatter object
 * @param {string} markdownBody - Markdown body content
 * @param {object} [options]
 * @param {string} [options.nodesDir] - Override nodes directory
 * @returns {{ written: boolean, errors: string[], warnings: string[] }}
 */
export function writePersonFile(slug, frontmatter, markdownBody, options = {}) {
  const nodesDir = options.nodesDir || DEFAULT_NODES_DIR;
  const today = new Date().toISOString().slice(0, 10);

  // Auto-set last_updated
  frontmatter.last_updated = today;

  // Ensure slug is set
  frontmatter.slug = slug;

  // Validate
  const { valid, errors, warnings, cleaned } = validateFrontmatter(frontmatter, slug);

  if (!valid) {
    return { written: false, errors, warnings };
  }

  // Write
  const filePath = join(nodesDir, `${slug}.md`);
  mkdirSync(nodesDir, { recursive: true });
  const output = matter.stringify(markdownBody, cleaned);
  writeFileSync(filePath, output);

  return { written: true, errors: [], warnings };
}

/**
 * Create a new stub person file from minimal data.
 * Uses _TEMPLATE.md schema as base. Won't overwrite existing files.
 *
 * @param {string} slug - Person slug
 * @param {object} fields - Fields to set
 * @param {string} [fields.name] - Full name
 * @param {string} [fields.sex] - "Male", "Female", or null
 * @param {string} [fields.status] - Status enum value (default: "auto_generated")
 * @param {{ date?: string, place?: string }} [fields.birth]
 * @param {{ date?: string, place?: string }} [fields.death]
 * @param {{ father?: string, mother?: string }} [fields.parents]
 * @param {Array} [fields.spouses]
 * @param {Array<{ person: string, role: string }>} [fields.discovered_from]
 * @param {object} [fields.external_ids]
 * @param {object} [options]
 * @param {string} [options.nodesDir] - Override nodes directory
 * @param {string} [options.body] - Custom markdown body (uses default template if not provided)
 * @returns {{ written: boolean, errors: string[], warnings: string[] }}
 */
export function createStubPersonFile(slug, fields = {}, options = {}) {
  const nodesDir = options.nodesDir || DEFAULT_NODES_DIR;
  const filePath = join(nodesDir, `${slug}.md`);

  if (existsSync(filePath)) {
    return { written: false, errors: ['File already exists'], warnings: [] };
  }

  let name;
  if (fields.name && typeof fields.name === 'object' && !Array.isArray(fields.name)) {
    const given = fields.name.given?.trim() || null;
    const surname = fields.name.surname?.trim() || null;
    const suffix = fields.name.suffix?.trim() || null;
    const full = fields.name.full?.trim() || [given, surname, suffix].filter(Boolean).join(' ').trim() || slug.replace(/_/g, ' ');
    name = {
      full,
      given,
      surname,
      suffix,
      maiden: fields.name.maiden?.trim() || fields.maiden || null,
    };
  } else {
    const fullName = (typeof fields.name === 'string' && fields.name.trim()) ? fields.name.trim() : slug.replace(/_/g, ' ');
    const parts = fullName.split(/\s+/);
    let suffix = null;
    let surname = parts[parts.length - 1] || null;

    if (/^(sr|jr|ii|iii|iv|v)\.?$/i.test(surname || '') && parts.length > 2) {
      suffix = surname.replace(/\.$/, '');
      surname = parts[parts.length - 2] || null;
    }

    const givenParts = parts.slice(0, suffix ? -2 : -1);
    name = {
      full: fullName,
      given: givenParts.join(' ').trim() || parts[0] || null,
      surname,
      suffix,
      maiden: fields.maiden || null,
    };
  }

  const fm = {
    slug,
    name,
    sex: fields.sex || null,
    status: fields.status || 'auto_generated',
    birth: {
      date: fields.birth?.date || null,
      place: fields.birth?.place || null,
    },
    death: {
      date: fields.death?.date || null,
      place: fields.death?.place || null,
    },
    burial: null,
    parents: {
      father: fields.parents?.father || null,
      mother: fields.parents?.mother || null,
    },
    spouses: fields.spouses || [],
    children: fields.children || [],
    siblings: [],
    occupations: [],
    religion: null,
    origin_country: null,
    external_ids: {
      gedcom: fields.external_ids?.gedcom || null,
      wikitree: fields.external_ids?.wikitree || null,
      findagrave: fields.external_ids?.findagrave || null,
      familysearch_tree: fields.external_ids?.familysearch_tree || null,
    },
    sources: fields.sources || [],
    discovered_from: fields.discovered_from || [],
  };

  // Default body template
  const body = options.body || `
## Biography
[Auto-generated stub — needs research]

## Sources

## Research Notes

- [ ] Confirm identity and vital records
- [ ] Search FamilySearch for birth record
- [ ] Search FamilySearch for death record
- [ ] Search census records
- [ ] Search Find A Grave
`;

  return writePersonFile(slug, fm, body, { nodesDir });
}

/**
 * Ensure bidirectional relationship integrity between two people.
 * Reads both files, updates both sides, writes both via writePersonFile().
 * Idempotent — safe to call multiple times.
 *
 * @param {string} slugA - First person's slug
 * @param {'parent_child' | 'spouse'} relationship - Relationship type
 * @param {string} slugB - Second person's slug
 * @param {object} [options]
 * @param {string} [options.nodesDir] - Override nodes directory
 * @param {object} [options.spouseData] - Extra data for spouse entry { marriage_date, marriage_place }
 * @returns {{ changes: Array<{ file: string, field: string, action: string }>, errors: string[] }}
 */
export function ensureBidirectional(slugA, relationship, slugB, options = {}) {
  const nodesDir = options.nodesDir || DEFAULT_NODES_DIR;
  const changes = [];
  const errors = [];

  if (slugA === slugB) {
    return { changes, errors: ['Cannot create self-referential relationship'] };
  }

  // Read both files
  const fileA = join(nodesDir, `${slugA}.md`);
  const fileB = join(nodesDir, `${slugB}.md`);

  if (!existsSync(fileA)) {
    return { changes, errors: [`File not found: ${slugA}.md`] };
  }
  if (!existsSync(fileB)) {
    return { changes, errors: [`File not found: ${slugB}.md`] };
  }

  const rawA = readFileSync(fileA, 'utf8');
  const rawB = readFileSync(fileB, 'utf8');
  const parsedA = matter(rawA);
  const parsedB = matter(rawB);
  const fmA = parsedA.data;
  const fmB = parsedB.data;
  const bodyA = parsedA.content;
  const bodyB = parsedB.content;

  let dirtyA = false;
  let dirtyB = false;

  if (relationship === 'parent_child') {
    // slugA is the parent, slugB is the child

    // Ensure parent lists child
    if (!Array.isArray(fmA.children)) fmA.children = [];
    if (!fmA.children.includes(slugB)) {
      fmA.children.push(slugB);
      dirtyA = true;
      changes.push({ file: slugA, field: 'children', action: `added ${slugB}` });
    }

    // Ensure child lists parent (based on parent's sex)
    if (!fmB.parents) fmB.parents = { father: null, mother: null };
    const parentSex = fmA.sex;
    if (parentSex === 'Male') {
      if (fmB.parents.father !== slugA) {
        if (fmB.parents.father && fmB.parents.father !== slugA) {
          errors.push(`${slugB} already has father "${fmB.parents.father}", cannot set to "${slugA}"`);
        } else {
          fmB.parents.father = slugA;
          dirtyB = true;
          changes.push({ file: slugB, field: 'parents.father', action: `set to ${slugA}` });
        }
      }
    } else if (parentSex === 'Female') {
      if (fmB.parents.mother !== slugA) {
        if (fmB.parents.mother && fmB.parents.mother !== slugA) {
          errors.push(`${slugB} already has mother "${fmB.parents.mother}", cannot set to "${slugA}"`);
        } else {
          fmB.parents.mother = slugA;
          dirtyB = true;
          changes.push({ file: slugB, field: 'parents.mother', action: `set to ${slugA}` });
        }
      }
    } else {
      // Unknown sex — try father first, then mother
      if (!fmB.parents.father) {
        if (fmB.parents.father !== slugA) {
          fmB.parents.father = slugA;
          dirtyB = true;
          changes.push({ file: slugB, field: 'parents.father', action: `set to ${slugA} (sex unknown)` });
        }
      } else if (!fmB.parents.mother) {
        if (fmB.parents.mother !== slugA) {
          fmB.parents.mother = slugA;
          dirtyB = true;
          changes.push({ file: slugB, field: 'parents.mother', action: `set to ${slugA} (sex unknown)` });
        }
      } else {
        errors.push(`${slugB} already has both parents, cannot add ${slugA}`);
      }
    }

    // Also ensure parent's spouses list includes the other parent (if known)
    const otherParent = parentSex === 'Male' ? fmB.parents.mother : fmB.parents.father;
    if (otherParent && otherParent !== slugA) {
      if (!Array.isArray(fmA.spouses)) fmA.spouses = [];
      const aSpouseSlugs = fmA.spouses.map(s => typeof s === 'string' ? s : s?.slug).filter(Boolean);
      if (!aSpouseSlugs.includes(otherParent)) {
        fmA.spouses.push({ slug: otherParent, marriage_date: null, marriage_place: null });
        dirtyA = true;
        changes.push({ file: slugA, field: 'spouses', action: `added ${otherParent} (co-parent)` });
      }
    }

  } else if (relationship === 'spouse') {
    const spouseData = options.spouseData || {};

    // Ensure A lists B as spouse
    if (!Array.isArray(fmA.spouses)) fmA.spouses = [];
    const aSpouseSlugs = fmA.spouses.map(s => typeof s === 'string' ? s : s?.slug).filter(Boolean);
    if (!aSpouseSlugs.includes(slugB)) {
      fmA.spouses.push({
        slug: slugB,
        marriage_date: spouseData.marriage_date || null,
        marriage_place: spouseData.marriage_place || null,
      });
      dirtyA = true;
      changes.push({ file: slugA, field: 'spouses', action: `added ${slugB}` });
    }

    // Ensure B lists A as spouse
    if (!Array.isArray(fmB.spouses)) fmB.spouses = [];
    const bSpouseSlugs = fmB.spouses.map(s => typeof s === 'string' ? s : s?.slug).filter(Boolean);
    if (!bSpouseSlugs.includes(slugA)) {
      fmB.spouses.push({
        slug: slugA,
        marriage_date: spouseData.marriage_date || null,
        marriage_place: spouseData.marriage_place || null,
      });
      dirtyB = true;
      changes.push({ file: slugB, field: 'spouses', action: `added ${slugA}` });
    }
  }

  // Write dirty files
  if (dirtyA) {
    const result = writePersonFile(slugA, fmA, bodyA, { nodesDir });
    if (!result.written) {
      errors.push(`Failed to write ${slugA}: ${result.errors.join(', ')}`);
    }
  }
  if (dirtyB) {
    const result = writePersonFile(slugB, fmB, bodyB, { nodesDir });
    if (!result.written) {
      errors.push(`Failed to write ${slugB}: ${result.errors.join(', ')}`);
    }
  }

  return { changes, errors };
}

/**
 * Promote an auto_generated node to partially_verified if it meets quality criteria.
 *
 * Criteria: has FamilySearch PID, has full name (given + surname), has birth year,
 * and has at least one family connection (children, spouses, or parents).
 *
 * @param {string} slug - The person's slug
 * @param {object} options - { nodesDir, dryRun }
 * @returns {{ promoted: boolean, reason: string }}
 */
export function promoteIfEligible(slug, options = {}) {
  const nodesDir = options.nodesDir || DEFAULT_NODES_DIR;
  const dryRun = options.dryRun || false;
  const filePath = join(nodesDir, `${slug}.md`);

  if (!existsSync(filePath)) {
    return { promoted: false, reason: 'file not found' };
  }

  const parsed = parsePersonFile(filePath);
  if (!parsed) {
    return { promoted: false, reason: 'parse error' };
  }

  const fm = parsed.frontmatter;

  if (fm.status !== 'auto_generated') {
    return { promoted: false, reason: `status is ${fm.status}, not auto_generated` };
  }

  // Check criteria
  if (!fm.external_ids?.familysearch_tree) {
    return { promoted: false, reason: 'no FamilySearch PID' };
  }

  const given = fm.name?.given;
  const surname = fm.name?.surname;
  if (!given || !surname) {
    return { promoted: false, reason: 'missing given or surname' };
  }

  if (!fm.birth?.date) {
    return { promoted: false, reason: 'no birth date' };
  }

  const hasConnection =
    (Array.isArray(fm.children) && fm.children.length > 0) ||
    (Array.isArray(fm.spouses) && fm.spouses.length > 0) ||
    (fm.parents?.father || fm.parents?.mother);

  if (!hasConnection) {
    return { promoted: false, reason: 'no family connections' };
  }

  if (dryRun) {
    return { promoted: true, reason: 'eligible (dry run)' };
  }

  fm.status = 'partially_verified';
  const result = writePersonFile(slug, fm, parsed.body, { nodesDir });

  if (result.written) {
    return { promoted: true, reason: 'promoted to partially_verified' };
  }

  return { promoted: false, reason: `write error: ${result.errors.join(', ')}` };
}
