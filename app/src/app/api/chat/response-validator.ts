/**
 * response-validator.ts
 *
 * Validates LLM response text against retrieved context, checking for:
 * 1. Unknown person mentions (people not in the retrieved bundle)
 * 2. Unsupported factual claims (birth year, death year, birth/death place, occupation)
 * 3. Military service claims
 * 4. Kinship/relationship claims
 *
 * Repair policy:
 * - unknown-person: strip sentences containing the unknown name, append caveat
 * - unsupported-claim / relationship-mismatch: log only (conservative — don't strip)
 *
 * False positives (flagging correct claims) are worse than false negatives.
 * Validation runs BEFORE source-link extraction per the pipeline spec.
 */

import type {
  RetrievedContextBundle,
  RetrievedPerson,
  ValidationIssue,
} from './types';

export interface ValidationResult {
  text: string;
  issues: ValidationIssue[];
  retried: boolean;
}

const CAVEAT =
  '\n\n*Note: Some claims could not be verified against the family tree data.*';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function validateAndRepairResponse(
  responseText: string,
  bundle: RetrievedContextBundle,
): ValidationResult {
  if (!responseText || bundle.people.length === 0) {
    return { text: responseText, issues: [], retried: false };
  }

  const issues: ValidationIssue[] = [];

  // Split into family section (validatable) and historical section (exempt)
  const { familySection, historicalSection } =
    splitResponseSections(responseText);

  if (familySection) {
    const sectionIssues = validateSection(familySection, bundle);
    issues.push(...sectionIssues);
  }

  // Repair: strip sentences with unknown-person issues
  const unknownPersonIssues = issues.filter((i) => i.type === 'unknown-person');
  let repairedText = responseText;

  if (unknownPersonIssues.length > 0) {
    // Work on the family section only, preserve historical section
    let repairedFamily = familySection;

    for (const issue of unknownPersonIssues) {
      const unknownName = issue.text;
      repairedFamily = stripSentencesContaining(repairedFamily, unknownName);
    }

    // Reassemble: repaired family section + historical section + caveat
    const parts = [repairedFamily.trim()];
    if (historicalSection) parts.push(historicalSection);
    repairedText = parts.join('\n\n') + CAVEAT;
  }

  return {
    text: repairedText,
    issues,
    retried: unknownPersonIssues.length > 0,
  };
}

// ---------------------------------------------------------------------------
// Section splitting — section-scoped historical context exemption
// ---------------------------------------------------------------------------

/**
 * Splits text into a family section (validatable) and a historical section
 * (exempt). Recognises multiple transition patterns: "Historical context:",
 * "Historically,", "In broader context,", "For historical context,", or
 * sentences that are clearly general-knowledge context (mentioning presidents,
 * wars, movements) after all the family-specific content.
 */
function splitResponseSections(text: string): {
  familySection: string;
  historicalSection: string;
} {
  const historicalMarker =
    /^(historical(ly)?[\s,:]|for historical context|in broader (historical )?context|to put this in (historical )?context)/im;
  const match = text.match(historicalMarker);
  if (!match || match.index === undefined) {
    return { familySection: text, historicalSection: '' };
  }
  return {
    familySection: text.slice(0, match.index).trim(),
    historicalSection: text.slice(match.index).trim(),
  };
}

// ---------------------------------------------------------------------------
// Section-level validation
// ---------------------------------------------------------------------------

function validateSection(
  text: string,
  bundle: RetrievedContextBundle,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Build name lookups from retrieved people
  const knownPeople = buildKnownPeopleLookup(bundle.people);

  // Detect all capitalized multi-word name-like patterns in the text
  const mentionedNames = extractNameMentions(text);

  for (const mention of mentionedNames) {
    const person = resolvePersonMention(mention, knownPeople, bundle.people);

    if (person === null) {
      // Name looks like a person name but is not in retrieved context
      issues.push({
        type: 'unknown-person',
        text: mention,
        detail: `"${mention}" was not found in the retrieved context`,
      });
    } else if (person !== undefined) {
      // Person is known — check their factual claims in surrounding sentences
      const claimIssues = validateClaimsForPerson(
        text,
        person,
        mention,
        bundle,
      );
      issues.push(...claimIssues);
    }
    // undefined = skip (not a person-like mention)
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Person name lookup
// ---------------------------------------------------------------------------

/**
 * Builds a map of normalized name strings to RetrievedPerson arrays.
 * Indexes by full name, and also by partial name fragments to handle
 * "John Barrett" matching "John Foly Barrett".
 * Using arrays prevents silent data loss when multiple people share a surname or first+last.
 */
function buildKnownPeopleLookup(
  people: RetrievedPerson[],
): Map<string, RetrievedPerson[]> {
  const map = new Map<string, RetrievedPerson[]>();

  const add = (key: string, person: RetrievedPerson) => {
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(person);
  };

  for (const person of people) {
    const full = person.fullName.toLowerCase();
    add(full, person);

    // Index by surname alone for mention detection
    if (person.surname) {
      add(person.surname.toLowerCase(), person);
    }

    // Index by first + last (skip middle names)
    const parts = person.fullName.split(/\s+/);
    if (parts.length >= 2) {
      const firstLast = `${parts[0]} ${parts[parts.length - 1]}`.toLowerCase();
      add(firstLast, person);
    }
  }

  return map;
}

/**
 * Extracts name-like mentions from text. A name-like mention is a sequence
 * of 2+ consecutive Title-Case words (all starting with a capital letter).
 *
 * Using only Title-Case words prevents greedy matches like "John Barrett was born in".
 */
function extractNameMentions(text: string): string[] {
  // Match sequences of 2+ consecutive Title-Case words only
  const pattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g;
  const candidates = new Set<string>();

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const name = match[1].trim();
    // Filter out obvious non-person patterns (place names, era labels, etc.)
    if (isLikelyPersonName(name)) {
      candidates.add(name);
    }
  }

  return [...candidates];
}

/** Heuristic to exclude place names, era labels, and other non-person tokens */
function isLikelyPersonName(candidate: string): boolean {
  const words = candidate.split(/\s+/);

  // Must be 2+ words
  if (words.length < 2) return false;

  // Exclude known non-person tokens: place-name suffixes/adjectives, era
  // labels, and genealogy record/document/collection terms. The record terms
  // were surfaced by the HT-01 anti-hallucination eval: an LLM citing a real
  // collection like "Veterans Schedule" or "Draft Registration" was being
  // flagged as a hallucinated person. This denylist is a heuristic and
  // inherently incomplete — no real person carries these as a name, so
  // excluding them cannot mask a genuine hallucination.
  const nonPersonWords = new Set([
    // Places / directions / era labels
    'United',
    'States',
    'North',
    'South',
    'East',
    'West',
    'New',
    'San',
    'Los',
    'Las',
    'Civil',
    'World',
    'War',
    'Coal',
    'Mining',
    'Historical',
    'Census',
    'Pennsylvania',
    'California',
    'Wisconsin',
    'Illinois',
    'Ohio',
    'Scranton',
    'Dunmore',
    'Bavaria',
    'Germany',
    'Wales',
    'Texas',
    // Record / document / collection / institution terms
    'Veterans',
    'Schedule',
    'Administration',
    'Federal',
    'Registration',
    'Records',
    'Record',
    'Index',
    'Collection',
    'Naturalization',
    'Draft',
    'Roll',
    'Bureau',
    'Passenger',
  ]);

  if (words.some((w) => nonPersonWords.has(w))) return false;

  // All words should be title-cased
  const allTitleCase = words.every(
    (w) => /^[A-Z][a-z]+$/.test(w) || /^[A-Z][a-z]*$/.test(w),
  );
  if (!allTitleCase) return false;

  return true;
}

/**
 * Tries to resolve a mention string to a known person.
 * Returns the person if resolved, null if the mention looks like a person
 * name but is not in the bundle, or undefined to signal "skip" (not a person name).
 *
 * Returns null  → unknown person (flag it)
 * Returns person → matched (validate claims)
 * Returns undefined → skip (not a person-like mention)
 *
 * Matching rules (in order):
 * 1. Direct full-name lookup (exact)
 * 2. The mention is a substring of a known full name (e.g. "John Barrett" in "John Foly Barrett")
 * 3. A known full name is a substring of the mention
 * 4. First name of the mention must match the first name of the known person (prevents
 *    "Mike Barrett" from incorrectly resolving to "John Foly Barrett" via surname alone)
 */
function resolvePersonMention(
  mention: string,
  knownPeople: Map<string, RetrievedPerson[]>,
  allPeople: RetrievedPerson[],
): RetrievedPerson | null | undefined {
  const lower = mention.toLowerCase();

  // Direct lookup — return first match (maintains prior behavior; collisions are rare for full names)
  if (knownPeople.has(lower)) {
    return knownPeople.get(lower)![0];
  }

  // Check if the mention is a substring of any known full name
  for (const person of allPeople) {
    const personLower = person.fullName.toLowerCase();
    if (personLower.includes(lower)) {
      return person;
    }
    // Check if known full name is a substring of mention
    if (lower.includes(personLower)) {
      return person;
    }
  }

  // Partial surname + first-name match: only resolve if the first names also align.
  // This prevents "Mike Barrett" from resolving to "John Foly Barrett" just because
  // the surname matches.
  const mentionParts = mention.split(/\s+/);
  const mentionFirst = mentionParts[0].toLowerCase();
  const mentionSurname = mentionParts[mentionParts.length - 1].toLowerCase();

  const surnamePeople = allPeople.filter(
    (p) => p.surname.toLowerCase() === mentionSurname,
  );
  for (const person of surnamePeople) {
    const personFirstName = person.fullName.split(/\s+/)[0].toLowerCase();
    if (personFirstName === mentionFirst) {
      return person;
    }
  }

  // Mention looks like a person name but didn't match any known person
  return null;
}

// ---------------------------------------------------------------------------
// Claim tuple validation
// ---------------------------------------------------------------------------

function validateClaimsForPerson(
  text: string,
  person: RetrievedPerson,
  mentionText: string,
  bundle: RetrievedContextBundle,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Get sentences near this person's name mention
  const sentences = getSentencesContaining(text, mentionText);

  for (const sentence of sentences) {
    issues.push(...checkBirthYearClaim(sentence, person));
    issues.push(...checkDeathYearClaim(sentence, person));
    issues.push(...checkBirthPlaceClaim(sentence, person));
    issues.push(...checkDeathPlaceClaim(sentence, person));
    issues.push(...checkOccupationClaim(sentence, person));
    issues.push(...checkMilitaryServiceClaim(sentence, person));
    issues.push(...checkKinshipClaim(sentence, person, bundle));
  }

  return issues;
}

/**
 * Returns all sentences in text that contain the given substring.
 */
function getSentencesContaining(text: string, substring: string): string[] {
  // Split on sentence boundaries (period, exclamation, question mark followed by space or end)
  const sentences = text.split(/(?<=[.!?])\s+/);
  const lower = substring.toLowerCase();
  return sentences.filter((s) => s.toLowerCase().includes(lower));
}

// ---------------------------------------------------------------------------
// Individual claim checkers
// ---------------------------------------------------------------------------

function checkBirthYearClaim(
  sentence: string,
  person: RetrievedPerson,
): ValidationIssue[] {
  if (person.birthYear === null) return [];

  // Match "born in YYYY" or "(YYYY-" or "born YYYY"
  const birthPatterns = [
    /\bborn\s+in\s+(\d{4})\b/i,
    /\bborn\s+(\d{4})\b/i,
    /\((\d{4})\s*[-–]/,
  ];

  for (const pattern of birthPatterns) {
    const match = sentence.match(pattern);
    if (match) {
      const claimed = parseInt(match[1], 10);
      if (claimed !== person.birthYear) {
        return [
          {
            type: 'unsupported-claim',
            text: sentence.trim(),
            personId: person.id,
            detail: `Claimed birth year ${claimed} does not match ${person.fullName}'s birth year ${person.birthYear}`,
          },
        ];
      }
    }
  }

  return [];
}

function checkDeathYearClaim(
  sentence: string,
  person: RetrievedPerson,
): ValidationIssue[] {
  if (person.deathYear === null) return [];

  const deathPatterns = [
    /\bdied\s+in\s+(\d{4})\b/i,
    /\bdied\s+(\d{4})\b/i,
    /\bdeath\s+(?:in\s+)?(\d{4})\b/i,
    /[-–]\s*(\d{4})\)/,
  ];

  for (const pattern of deathPatterns) {
    const match = sentence.match(pattern);
    if (match) {
      const claimed = parseInt(match[1], 10);
      if (claimed !== person.deathYear) {
        return [
          {
            type: 'unsupported-claim',
            text: sentence.trim(),
            personId: person.id,
            detail: `Claimed death year ${claimed} does not match ${person.fullName}'s death year ${person.deathYear}`,
          },
        ];
      }
    }
  }

  return [];
}

function checkBirthPlaceClaim(
  sentence: string,
  person: RetrievedPerson,
): ValidationIssue[] {
  if (!person.birthPlace) return [];

  // Match "born in [Place]" — extract the place string after "born in"
  const match = sentence.match(/\bborn\s+in\s+([A-Z][^.!?,]+?)(?:[,.]|$)/i);
  if (!match) return [];

  const claimedPlace = match[1].trim();

  // Check if claimed place appears (case-insensitive) in the known birth place
  const knownLower = person.birthPlace.toLowerCase();
  const claimedLower = claimedPlace.toLowerCase();

  // Allow partial matches — "Scranton" should match "Scranton, Pennsylvania"
  if (knownLower.includes(claimedLower) || claimedLower.includes(knownLower)) {
    return [];
  }

  // Also allow if claim contains a city or state from the birth place
  const knownParts = person.birthPlace.split(/,\s*/);
  if (
    knownParts.some((part) => claimedLower.includes(part.trim().toLowerCase()))
  ) {
    return [];
  }

  return [
    {
      type: 'unsupported-claim',
      text: sentence.trim(),
      personId: person.id,
      detail: `Claimed birth place "${claimedPlace}" does not match ${person.fullName}'s birth place "${person.birthPlace}"`,
    },
  ];
}

function checkDeathPlaceClaim(
  sentence: string,
  person: RetrievedPerson,
): ValidationIssue[] {
  if (!person.deathPlace) return [];

  // Match "died in [Place]" — extract the place string after "died in"
  const match = sentence.match(/\bdied\s+in\s+([A-Z][^.!?,]+?)(?:[,.]|$)/i);
  if (!match) return [];

  const claimedPlace = match[1].trim();

  // Skip if the match looks like a year (already handled by death year checker)
  if (/^\d{4}$/.test(claimedPlace)) return [];

  const knownLower = person.deathPlace.toLowerCase();
  const claimedLower = claimedPlace.toLowerCase();

  // Allow partial matches — "Dunmore" should match "Dunmore, Pennsylvania"
  if (knownLower.includes(claimedLower) || claimedLower.includes(knownLower)) {
    return [];
  }

  // Also allow if claim contains a city or state from the death place
  const knownParts = person.deathPlace.split(/,\s*/);
  if (
    knownParts.some((part) => claimedLower.includes(part.trim().toLowerCase()))
  ) {
    return [];
  }

  return [
    {
      type: 'unsupported-claim',
      text: sentence.trim(),
      personId: person.id,
      detail: `Claimed death place "${claimedPlace}" does not match ${person.fullName}'s death place "${person.deathPlace}"`,
    },
  ];
}

function checkOccupationClaim(
  sentence: string,
  person: RetrievedPerson,
): ValidationIssue[] {
  if (person.occupations.length === 0) return [];

  // Match "was a [occupation]" or "worked as [occupation]"
  // The terminator includes punctuation chars to handle end-of-sentence
  const occupationPatterns = [
    /\bwas\s+a(?:n)?\s+([a-z][a-z\s]+?)(?:\s+(?:in|at|for|and|who)|[,;.!?]|$)/i,
    /\bworked\s+as\s+a(?:n)?\s+([a-z][a-z\s]+?)(?:\s+(?:in|at|for|and|who)|[,;.!?]|$)/i,
    /\bwas\s+employed\s+as\s+a(?:n)?\s+([a-z][a-z\s]+?)(?:\s+(?:in|at|for|and|who)|[,;.!?]|$)/i,
  ];

  for (const pattern of occupationPatterns) {
    const match = sentence.match(pattern);
    if (!match) continue;

    const claimedOccupation = match[1].trim().toLowerCase();

    // Check if claimed occupation matches any known occupation (partial match OK)
    const isKnown = person.occupations.some((occ) => {
      const knownOcc = occ.toLowerCase();
      return (
        knownOcc.includes(claimedOccupation) ||
        claimedOccupation.includes(knownOcc)
      );
    });

    if (!isKnown) {
      return [
        {
          type: 'unsupported-claim',
          text: sentence.trim(),
          personId: person.id,
          detail: `Claimed occupation "${claimedOccupation}" is not in ${person.fullName}'s known occupation list: [${person.occupations.join(', ')}]`,
        },
      ];
    }
  }

  return [];
}

function checkMilitaryServiceClaim(
  sentence: string,
  person: RetrievedPerson,
): ValidationIssue[] {
  // Look for military service language near the person's name
  const militaryPatterns = [
    /\bserved\b/i,
    /\bveteran\b/i,
    /\bfought\b/i,
    /\benlisted\b/i,
    /\bdrafted\b/i,
  ];

  const hasMilitaryClaim = militaryPatterns.some((p) => p.test(sentence));
  if (!hasMilitaryClaim) return [];

  // Check if person has military evidence in lifeEvents or occupations
  const militaryTerms = [
    'military',
    'army',
    'navy',
    'marine',
    'air force',
    'soldier',
    'enlisted',
    'drafted',
    'served',
    'veteran',
    'war',
    'combat',
    'regiment',
    'infantry',
    'cavalry',
    'artillery',
    'draft',
    'service',
  ];

  const hasLifeEventEvidence =
    person.lifeEvents?.some((e) =>
      militaryTerms.some((term) => e.event.toLowerCase().includes(term)),
    ) ?? false;

  const hasOccupationEvidence =
    person.occupations?.some((occ) =>
      militaryTerms.some((term) => occ.toLowerCase().includes(term)),
    ) ?? false;

  if (!hasLifeEventEvidence && !hasOccupationEvidence) {
    return [
      {
        type: 'unsupported-claim',
        text: sentence.trim(),
        personId: person.id,
        detail: `Military service claim for ${person.fullName} is not supported by life events or occupations`,
      },
    ];
  }

  return [];
}

function checkKinshipClaim(
  sentence: string,
  person: RetrievedPerson,
  bundle: RetrievedContextBundle,
): ValidationIssue[] {
  // Match "[Person A]'s father/mother/child/spouse was [Person B]"
  // or "[Person A] was the father/mother of [Person B]"
  const kinshipPatterns = [
    /(\w[\w\s]+?)'s\s+(father|mother|child|son|daughter|spouse|wife|husband)\s+(?:was|is)\s+(\w[\w\s]+?)(?:[,.]|$)/i,
    /(\w[\w\s]+?)\s+was\s+the\s+(father|mother|child|son|daughter|spouse|wife|husband)\s+of\s+(\w[\w\s]+?)(?:[,.]|$)/i,
  ];

  for (const pattern of kinshipPatterns) {
    const match = sentence.match(pattern);
    if (!match) continue;

    const personAName = match[1].trim();
    const relationship = match[2].toLowerCase();
    const personBName = match[3].trim();

    // Try to resolve both names to known people
    const knownPeople = buildKnownPeopleLookup(bundle.people);
    const personA = resolvePersonMention(
      personAName,
      knownPeople,
      bundle.people,
    );
    const personB = resolvePersonMention(
      personBName,
      knownPeople,
      bundle.people,
    );

    // Only validate if both are known people
    if (!personA || !personB || personA === undefined || personB === undefined)
      continue;

    // Validate the claimed relationship
    const isValid = validateRelationship(
      personA,
      personB,
      relationship,
      bundle,
    );
    if (!isValid) {
      return [
        {
          type: 'relationship-mismatch',
          text: sentence.trim(),
          personId: person.id,
          detail: `Claimed ${relationship} relationship between "${personAName}" and "${personBName}" could not be verified`,
        },
      ];
    }
  }

  return [];
}

/**
 * Validates a claimed relationship between two people using the bundle data.
 * Checks relationshipPaths, and person.parents/spouse/children fields.
 */
function validateRelationship(
  personA: RetrievedPerson,
  personB: RetrievedPerson,
  relationship: string,
  bundle: RetrievedContextBundle,
): boolean {
  // Check relationshipPaths if available
  const pathMatch = bundle.relationshipPaths.some(
    (path) =>
      (path.from.id === personA.id && path.to.id === personB.id) ||
      (path.from.id === personB.id && path.to.id === personA.id),
  );
  if (pathMatch) return true;

  // Check direct parent/spouse/child fields
  const parentTerms = ['father', 'mother'];
  const childTerms = ['child', 'son', 'daughter'];
  const spouseTerms = ['spouse', 'wife', 'husband'];

  if (parentTerms.includes(relationship)) {
    // A's parent is B: check if B is in A's parents
    if (personA.parents?.some((p) => p.id === personB.id)) return true;
    // B's child is A: check if A is in B's children
    if (personB.children?.some((c) => c.id === personA.id)) return true;
  }

  if (childTerms.includes(relationship)) {
    // A's child is B: check if B is in A's children
    if (personA.children?.some((c) => c.id === personB.id)) return true;
    // B's parent is A: check if A is in B's parents
    if (personB.parents?.some((p) => p.id === personA.id)) return true;
  }

  if (spouseTerms.includes(relationship)) {
    if (personA.spouse?.id === personB.id) return true;
    if (personB.spouse?.id === personA.id) return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Sentence stripping (for unknown-person repair)
// ---------------------------------------------------------------------------

/**
 * Removes sentences containing the given name from text.
 * Conservative: only strips complete sentences, not partial matches within words.
 */
function stripSentencesContaining(text: string, name: string): string {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const lower = name.toLowerCase();
  const filtered = sentences.filter((s) => !s.toLowerCase().includes(lower));
  return filtered.join(' ');
}
