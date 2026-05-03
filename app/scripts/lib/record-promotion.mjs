/**
 * record-promotion.mjs
 *
 * Shared core for promoting finding file records into Record node files.
 * Phase 1: Record creation + source fan-out. No conflict detection.
 *
 * Used by both apply-findings.mjs (non-census) and fs_validate_staging.mjs (census).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import matter from 'gray-matter';
import { arkToRecordId, recordIdToFilename } from './record-id.mjs';
import { parseFinding } from './finding-parser.mjs';
import { deriveKeyFacts } from './key-facts.mjs';
import { normalizeRecordType } from './normalize-record-type.mjs';
import { inferCountry } from './country-inference.mjs';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Fields that belong on a participant object. */
const PARTICIPANT_FIELDS = new Set([
  'name', 'age', 'sex', 'role', 'occupation',
  'birth_place', 'birthplace', 'marital_status', 'race',
  'birth_year_est', 'birth_year',
]);

/** Fields that belong in details{}. */
const DETAIL_FIELDS = new Set([
  'event_date', 'event_place', 'event_type',
  'enumeration_district', 'line_number', 'page_number', 'residence',
  'fathers_birthplace', 'mothers_birthplace',
  'number_of_children', 'number_of_living_children', 'years_married',
  'immigration_year', 'naturalization_status',
  'cause_of_death', 'birth_date', 'birth_place',
  'death_date', 'death_place', 'burial_date', 'burial_place',
  'fathers_name', 'mothers_name', 'spouse_name',
  'cemetery', 'marriage_date', 'marriage_place',
  'informant', 'photograph',
  // Draft card (WWI/WWII military registration)
  'employer', 'employer_address', 'dependents',
  'physical_description', 'has_previously_served', 'citizenship',
]);

/**
 * Fields that create additional participants (father, mother, spouse).
 * These are extracted from the field table and turned into participant entries.
 */
const RELATION_PARTICIPANT_FIELDS = new Set([
  'father', 'mother', 'spouse', 'spouse_name',
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Map evidence tier to evidence class.
 * @param {string|null} tier
 * @returns {string}
 */
export function inferEvidenceClass(tier) {
  if (!tier) return 'derivative';
  const t = tier.toUpperCase();
  if (t === 'A' || t === 'B') return 'primary';
  if (t === 'C') return 'secondary';
  return 'derivative'; // D, E
}

/**
 * Extract a 4-digit year from collection name or event_date field.
 * @param {object} section - ParsedRecord from finding-parser
 * @returns {number|null}
 */
export function extractYear(section) {
  // Try collection name first
  if (section.collection) {
    const match = section.collection.match(/\b(1[5-9]\d{2}|20[0-2]\d)\b/);
    if (match) return parseInt(match[1], 10);
  }
  // Try event_date field
  const eventDate = section.fields?.get?.('event_date');
  if (eventDate) {
    const match = eventDate.match(/\b(1[5-9]\d{2}|20[0-2]\d)\b/);
    if (match) return parseInt(match[1], 10);
  }
  return null;
}

/**
 * Infer country code from collection name using country-inference module.
 * @param {object} section - ParsedRecord from finding-parser
 * @returns {string|null}
 */
export function inferCountryFromSection(section) {
  const text = [section.collection, section.fields?.get?.('event_place')].filter(Boolean).join(' ');
  if (!text) return null;
  return inferCountry(text, { format: 'code' }) || null;
}

/**
 * Parse a parent/spouse field value that may contain parenthetical info.
 *
 * Formats handled:
 *   "Arthur M Wagner (Head, age 50, b. 1890 SD)"
 *   "Arthur M Wagner"
 *   "Eva N Reed"
 *
 * @param {string} value - Raw field value
 * @param {string} defaultRole - Default role if no parenthetical (e.g. "Father", "Mother")
 * @returns {{ name: string, role: string|null, age: string|null, birth_year_est: string|null, birthplace: string|null }}
 */
export function parseParentField(value, defaultRole) {
  if (!value) return null;

  const trimmed = value.trim();
  // Check for parenthetical: "Name (stuff)"
  const parenMatch = trimmed.match(/^(.+?)\s*\(([^)]+)\)\s*$/);

  if (!parenMatch) {
    return {
      name: trimmed,
      role: defaultRole,
      age: null,
      birth_year_est: null,
      birthplace: null,
    };
  }

  const name = parenMatch[1].trim();
  const parenContent = parenMatch[2].trim();

  // Parse parenthetical comma-separated parts
  const parts = parenContent.split(',').map((p) => p.trim());

  let role = defaultRole;
  let age = null;
  let birthYearEst = null;
  let birthplace = null;

  for (const part of parts) {
    const lc = part.toLowerCase();

    // Check for role keywords
    if (/^(head|wife|husband|son|daughter|mother|father|lodger|boarder|servant|brother|sister|groom|bride)$/i.test(part)) {
      role = part;
      continue;
    }

    // Check for "age NN"
    const ageMatch = part.match(/^age\s+(\d+)/i);
    if (ageMatch) {
      age = ageMatch[1];
      continue;
    }

    // Check for "b. YYYY" or "b. YYYY place"
    const birthMatch = part.match(/^b\.\s*(\d{4})\s*(.*)/i);
    if (birthMatch) {
      birthYearEst = birthMatch[1];
      if (birthMatch[2].trim()) {
        birthplace = birthMatch[2].trim();
      }
      continue;
    }

    // If it starts with "b." but no year, might be "b. StateName"
    const birthPlaceOnly = part.match(/^b\.\s+([A-Za-z].+)/i);
    if (birthPlaceOnly) {
      birthplace = birthPlaceOnly[1].trim();
      continue;
    }

    // Otherwise, if we haven't set a birthplace yet and this doesn't look like
    // a recognized pattern, treat it as birthplace (common for state abbreviations)
    // e.g. "SD", "Wisconsin"
    if (!birthplace && /^[A-Z]/.test(part) && part.length <= 20) {
      // Could be a state/place abbreviation — but only if we already have role/age
      if (role !== defaultRole || age) {
        birthplace = part;
      }
    }
  }

  return { name, role, age, birth_year_est: birthYearEst, birthplace };
}

/**
 * Normalize an ARK value to a full FamilySearch URL.
 * @param {string} ark - Raw ARK (short form, path, or full URL)
 * @returns {string|null}
 */
export function normalizeArkUrl(ark) {
  if (!ark) return null;
  const trimmed = ark.trim();

  // Already a full URL
  if (trimmed.startsWith('http')) return trimmed;

  // Path form: /ark:/61903/1:1:XXXX
  if (trimmed.startsWith('/ark:') || trimmed.startsWith('ark:')) {
    const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    return `https://www.familysearch.org${path}`;
  }

  // Short form: XXXX-XXX → build full URL
  if (/^[A-Z0-9]{4,}-[A-Z0-9]{3,4}$/i.test(trimmed)) {
    return `https://www.familysearch.org/ark:/61903/1:1:${trimmed}`;
  }

  return null;
}

/**
 * Normalize sex value to single uppercase letter.
 * @param {string|null} val
 * @returns {string|null}
 */
export function normalizeSex(val) {
  if (!val) return null;
  const first = val.trim().charAt(0).toUpperCase();
  if (first === 'M' || first === 'F') return first;
  return null;
}

/**
 * Compute estimated birth year from census year and age.
 * @param {Map<string,string>} fields
 * @param {object} section - ParsedRecord
 * @returns {string|null}
 */
export function computeBirthYearEst(fields, section) {
  // First check if birth_year_est is already in the fields
  const existing = fields.get('birth_year_est');
  if (existing) return existing.replace(/[^0-9]/g, '') || null;

  // Check birth_year
  const birthYear = fields.get('birth_year');
  if (birthYear) {
    const cleaned = birthYear.replace(/[^0-9]/g, '');
    if (cleaned.length === 4) return cleaned;
  }

  // Compute from year - age
  const age = fields.get('age');
  const year = extractYear(section);
  if (age && year) {
    const ageNum = parseInt(age.replace(/[^0-9]/g, ''), 10);
    if (!isNaN(ageNum)) {
      return String(year - ageNum);
    }
  }

  return null;
}

/**
 * Today's date as YYYY-MM-DD.
 * @returns {string}
 */
function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Normalize URLs for dedup checks.
 * @param {string|null|undefined} url
 * @returns {string|null}
 */
function normalizeSourceUrl(url) {
  if (!url || typeof url !== 'string') return null;
  return url
    .trim()
    .replace(/^http:\/\//i, 'https://')
    .replace(/\/+$/, '');
}

/**
 * Seed the main participant from the finding subject slug when available.
 * Approved findings are single-subject searches; preserving that slug on the
 * canonical Record node avoids a second fuzzy match for the primary subject.
 *
 * @param {object[]} participants
 * @param {object} finding
 */
function seedMainParticipantMatch(participants, finding) {
  if (!Array.isArray(participants) || participants.length === 0) return;
  if (!finding?.personSlug) return;

  const main = participants[0];
  if (!main || !main.name || main.matched_slug) return;
  main.matched_slug = finding.personSlug;
}

/**
 * Build the denormalized source entry for one participant/person file.
 * @param {object} recordNode
 * @param {object} participant
 * @returns {object}
 */
function buildSourceEntry(recordNode, participant) {
  return {
    record_id: recordNode.record_id,
    collection: recordNode.collection,
    provider: recordNode.provider,
    url: recordNode.ark,
    record_type: recordNode.type,
    year: recordNode.year,
    key_facts: deriveKeyFacts(participant, recordNode),
    image_url: recordNode.image_url || null,
    added: today(),
  };
}

/**
 * Merge canonical record-backed fields into an existing source entry that
 * already points at the same URL.
 *
 * @param {object} existing
 * @param {object} incoming
 * @returns {boolean} whether any field changed
 */
function mergeSourceEntry(existing, incoming) {
  let changed = false;

  if (!existing.record_id && incoming.record_id) {
    existing.record_id = incoming.record_id;
    changed = true;
  }
  if (!existing.collection && incoming.collection) {
    existing.collection = incoming.collection;
    changed = true;
  }
  if (!existing.provider && incoming.provider) {
    existing.provider = incoming.provider;
    changed = true;
  }
  if (!existing.url && incoming.url) {
    existing.url = incoming.url;
    changed = true;
  }
  if (!existing.record_type && incoming.record_type) {
    existing.record_type = incoming.record_type;
    changed = true;
  }
  if ((existing.year === null || existing.year === undefined) && incoming.year !== null && incoming.year !== undefined) {
    existing.year = incoming.year;
    changed = true;
  }
  if ((!Array.isArray(existing.key_facts) || existing.key_facts.length === 0) && incoming.key_facts.length > 0) {
    existing.key_facts = incoming.key_facts;
    changed = true;
  }
  if ((existing.image_url === null || existing.image_url === undefined) && incoming.image_url !== undefined) {
    existing.image_url = incoming.image_url;
    changed = true;
  }
  if (!existing.added && incoming.added) {
    existing.added = incoming.added;
    changed = true;
  }

  return changed;
}

// ---------------------------------------------------------------------------
// Main participant builder
// ---------------------------------------------------------------------------

/**
 * Build the participants array from a parsed record section.
 * @param {object} section - ParsedRecord from finding-parser
 * @returns {object[]}
 */
export function buildParticipants(section) {
  const { fields, household, contacts } = section;
  const participants = [];

  // --- Main person from fields ---
  const main = {
    name: fields.get('name') || null,
    age: fields.get('age') || null,
    sex: normalizeSex(fields.get('sex')),
    role: fields.get('role') || null,
    occupation: fields.get('occupation') || null,
    birthplace: fields.get('birth_place') || fields.get('birthplace') || null,
    marital_status: fields.get('marital_status') || null,
    race: fields.get('race') || null,
    birth_year_est: computeBirthYearEst(fields, section),
    matched_slug: null,
  };

  // Clean up null fields — keep them but don't add undefined
  participants.push(main);

  // --- Father ---
  const fatherVal = fields.get('father');
  if (fatherVal) {
    const parsed = parseParentField(fatherVal, 'Father');
    if (parsed) {
      participants.push({
        name: parsed.name,
        role: parsed.role,
        age: parsed.age,
        sex: 'M',
        birthplace: parsed.birthplace,
        birth_year_est: parsed.birth_year_est,
        matched_slug: null,
      });
    }
  }

  // --- Mother ---
  const motherVal = fields.get('mother');
  if (motherVal) {
    const parsed = parseParentField(motherVal, 'Mother');
    if (parsed) {
      participants.push({
        name: parsed.name,
        role: parsed.role,
        age: parsed.age,
        sex: 'F',
        birthplace: parsed.birthplace,
        birth_year_est: parsed.birth_year_est,
        matched_slug: null,
      });
    }
  }

  // --- Spouse (from spouse or spouse_name field) ---
  const spouseVal = fields.get('spouse') || fields.get('spouse_name');
  if (spouseVal) {
    const parsed = parseParentField(spouseVal, 'Spouse');
    if (parsed) {
      participants.push({
        name: parsed.name,
        role: parsed.role !== 'Spouse' ? parsed.role : 'Spouse',
        age: parsed.age,
        sex: null,
        birthplace: parsed.birthplace,
        birth_year_est: parsed.birth_year_est,
        matched_slug: null,
      });
    }
  }

  // --- Household members ---
  if (household && household.length > 0) {
    for (const member of household) {
      // Skip if this member is already the main person (same name)
      const memberName = member.Name || member.name || '';
      if (memberName === main.name) continue;

      participants.push({
        name: memberName,
        role: member.Relationship || member.relationship || member.Role || member.role || null,
        age: member.Age || member.age || null,
        sex: normalizeSex(member.Sex || member.sex),
        birthplace: member.Birthplace || member.birthplace || null,
        occupation: member.Occupation || member.occupation || null,
        marital_status: member['Marital Status'] || member.marital_status || null,
        matched_slug: null,
      });
    }
  }

  // --- Contacts (draft cards, pensions, etc.) ---
  // Contact rows become participants with arbitrary role strings (Brother,
  // Friend, Landlady, Physician, Witness). Unlike RELATION_PARTICIPANT_FIELDS,
  // the role vocabulary is not constrained — it's whatever the source record says.
  if (contacts && contacts.length > 0) {
    for (const contact of contacts) {
      const contactName = contact.Name || contact.name || '';
      if (!contactName) continue;
      // Skip if contact duplicates the main person
      if (contactName === main.name) continue;

      participants.push({
        name: contactName,
        role: contact.Relationship || contact.relationship || contact.Role || contact.role || null,
        age: contact.Age || contact.age || null,
        sex: null, // Contacts rarely have sex column; reconciler infers from name + role
        birthplace: contact.Birthplace || contact.birthplace || null,
        matched_slug: null,
      });
    }
  }

  return participants;
}

// ---------------------------------------------------------------------------
// Details builder
// ---------------------------------------------------------------------------

/**
 * Build the details object from a parsed record section.
 * Participant and relation fields are excluded.
 * @param {object} section - ParsedRecord from finding-parser
 * @returns {object}
 */
function buildDetails(section) {
  const { fields } = section;
  const details = {};
  const extraFields = {};

  for (const [key, value] of fields.entries()) {
    // Skip participant-level fields
    if (PARTICIPANT_FIELDS.has(key)) continue;

    // Skip relation fields that become participants
    if (RELATION_PARTICIPANT_FIELDS.has(key)) continue;

    if (DETAIL_FIELDS.has(key)) {
      details[key] = value;
    } else {
      extraFields[key] = value;
    }
  }

  if (Object.keys(extraFields).length > 0) {
    details.extra_fields = extraFields;
  }

  return details;
}

// ---------------------------------------------------------------------------
// promoteToRecord
// ---------------------------------------------------------------------------

/**
 * Process a finding file and create Record node files.
 *
 * @param {string} findingContent - Raw markdown of the finding file
 * @param {object} options - { recordsDir?, findingFile? }
 * @returns {{ recordNode: object|null, allRecordNodes: object[], skipped: object[] }}
 */
export function promoteToRecord(findingContent, options = {}) {
  const { recordsDir, findingFile } = options;

  // Resolve records directory
  const outDir = recordsDir || join(process.cwd(), '..', 'data', 'records');
  mkdirSync(outDir, { recursive: true });

  // Parse the finding
  const finding = parseFinding(findingContent);
  const { records } = finding;

  const allRecordNodes = [];
  const skipped = [];

  for (let i = 0; i < records.length; i++) {
    const section = records[i];

    // --- Eligibility checks ---

    // Skip tree-only records
    if (section.isTreeOnly) {
      skipped.push({
        index: i,
        collection: section.collection,
        reason: 'Tree-only record (user-contributed tree, not a source document)',
      });
      continue;
    }

    // Skip if ARK is null/invalid
    const recordId = arkToRecordId(section.ark);
    if (!recordId) {
      skipped.push({
        index: i,
        collection: section.collection,
        reason: 'No valid ARK identifier',
      });
      continue;
    }

    // Skip if no extracted fields
    if (!section.fields || section.fields.size === 0) {
      skipped.push({
        index: i,
        collection: section.collection,
        reason: 'No extracted fields',
      });
      continue;
    }

    // --- Build Record node ---
    const ark = normalizeArkUrl(section.ark);
    const year = extractYear(section);
    const country = inferCountryFromSection(section);
    const participants = buildParticipants(section);
    seedMainParticipantMatch(participants, finding);
    const details = buildDetails(section);
    const todayStr = today();

    const recordNode = {
      record_id: recordId,
      ark,
      type: normalizeRecordType(section.recordType),
      provider: 'familysearch',
      evidence_class: inferEvidenceClass(section.tier),
      collection: section.collection || null,
      collection_id: null,
      year,
      country,
      tier: section.tier || null,
      place: section.fields.get('event_place') || null,
      participants,
      details,
      image_url: null,
      finding_file: findingFile || null,
      ingested: todayStr,
      last_updated: todayStr,
    };

    // --- Write Record node file ---
    const filename = recordIdToFilename(recordId);
    const filePath = join(outDir, filename);

    const body = `## Transcription\n\n${section.rawContent.trim()}\n`;
    const fileContent = matter.stringify(body, recordNode);
    writeFileSync(filePath, fileContent, 'utf-8');

    allRecordNodes.push(recordNode);
  }

  return {
    recordNode: allRecordNodes.length > 0 ? allRecordNodes[0] : null,
    allRecordNodes,
    skipped,
  };
}

// ---------------------------------------------------------------------------
// applyRecordToAllMatchedPersons
// ---------------------------------------------------------------------------

/**
 * Add denormalized source entries to all matched person nodes.
 * Phase 1: source fan-out only, no conflict detection.
 *
 * @param {object} recordNode - The Record node data
 * @param {object} options - { nodesDir? }
 * @returns {{ updates: object[] }}
 */
export function applyRecordToAllMatchedPersons(recordNode, options = {}) {
  const nodesDir = options.nodesDir || join(process.cwd(), '..', 'data', 'verified_nodes');
  const dryRun = options.dryRun === true;
  const updates = [];

  if (!recordNode || !recordNode.participants) return { updates };

  for (const participant of recordNode.participants) {
    const slug = participant.matched_slug;
    if (!slug) continue;

    const personPath = join(nodesDir, `${slug}.md`);
    if (!existsSync(personPath)) continue;

    // Read person file
    const raw = readFileSync(personPath, 'utf-8');
    const parsed = matter(raw);
    const data = parsed.data;

    // Ensure sources array exists
    if (!Array.isArray(data.sources)) {
      data.sources = [];
    }

    // Dedup: canonical Record reference already present
    if (data.sources.some((s) => s.record_id === recordNode.record_id)) {
      continue;
    }

    const sourceEntry = buildSourceEntry(recordNode, participant);
    const recordUrl = normalizeSourceUrl(sourceEntry.url);
    const existingByUrl = recordUrl
      ? data.sources.find((s) => normalizeSourceUrl(s.url) === recordUrl)
      : null;

    let changed = false;
    let action = 'added';

    if (existingByUrl) {
      changed = mergeSourceEntry(existingByUrl, sourceEntry);
      action = 'upgraded';
    } else {
      data.sources.push(sourceEntry);
      changed = true;
      action = 'added';
    }

    if (!changed) continue;

    data.last_updated = today();

    if (!dryRun) {
      const updated = matter.stringify(parsed.content, data);
      writeFileSync(personPath, updated, 'utf-8');
    }

    updates.push({ slug, record_id: recordNode.record_id, action });
  }

  return { updates };
}
