/**
 * Shared person matcher.
 *
 * Used by find_duplicates.mjs (scan/report) and fs_validate_staging.mjs
 * (pre-stub-creation guard). Returns a structured match result with
 * score, confidence, signals, and match_type.
 *
 * See docs/superpowers/specs/2026-04-07-tree-cleanup-design.md for the
 * full design rationale.
 */

import { fuzzyNameMatch } from './fuzzy_names.mjs';

export const CONFIDENCE = Object.freeze({
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
  SKIP: 'SKIP',
});

export const THRESHOLDS = Object.freeze({
  HIGH: 80,
  MEDIUM: 65,
  LOW: 50,
});

// Sex_mismatch dampener calibration. Scaled per shared child so it
// exactly cancels the relational pass's per-child boost (+30 each).
// Without scaling, a husband+wife pair with 3 shared children would
// re-surface at HIGH after the dampener (1×30 isn't enough to cancel
// 3×30). With scaling, the dampener is mathematically self-evident:
// "remove the shared_child contribution because the sex disagreement
// makes the relational signal non-evidentiary." This handles the
// realistic 19th-century farming couple case (5-10 shared children)
// uniformly.
export const SEX_MISMATCH_PENALTY_PER_SHARED_CHILD = -30;

// Opposite parent-role claims for the same child (one record says
// "Mother", the other says "Father") make the shared-child and
// shared-spouse signals non-evidentiary. This is the structural
// false-positive pattern behind pairs like alice_tapisfield ↔
// john_tapisfield: they are the two parents of the same child, not
// duplicate people. Per conflicting child, cancel the relational
// family contribution (+30 shared_child +25 shared_spouse).
export const PARENT_ROLE_MISMATCH_PENALTY_PER_CHILD = -55;

// Known sex values. The matcher only fires the dampener when both
// sides have a value in this set — anything else (null, '', 'Unknown',
// non-binary placeholders) is treated as missing. CLAUDE.md
// operational rule #2 says normalizeSex() returns 'M' / 'F' but
// production data has both short and long forms, so we accept both.
const KNOWN_SEX = new Set(['M', 'F', 'Male', 'Female']);

/**
 * Compare two person records and return a match result.
 *
 * @param {{slug: string, frontmatter: object}} a
 * @param {{slug: string, frontmatter: object}} b
 * @param {{allPersons: Array, parentsByChild: Map}} ctx
 * @returns {{score: number, confidence: string, signals: string[], match_type: string}}
 */
export function matchPerson(a, b, ctx) {
  const signals = [];
  let score = 0;

  const givenA = (a.frontmatter?.name?.given || '').toLowerCase().trim();
  const givenB = (b.frontmatter?.name?.given || '').toLowerCase().trim();
  const surnameA = canonicalSurname(a.frontmatter);
  const surnameB = canonicalSurname(b.frontmatter);

  // Surname comparison — emit surname_mismatch on hard mismatch but
  // do NOT short-circuit. The relational pass (Task 5) can add
  // shared_child/shared_spouse signals that lift the score back into
  // a non-SKIP confidence even when surnames disagree (the canonical
  // maiden/married duplicate case).
  if (surnameA && surnameB) {
    if (surnameA === surnameB) {
      score += 25;
      signals.push('surname_exact');
    } else {
      // fuzzyNameMatch returns { match, method, score } — score is
      // always populated when match is true. Capped at 20 to stay
      // below surname_exact's 25.
      const fuzzy = fuzzyNameMatch(surnameA, surnameB);
      if (fuzzy.match) {
        score += Math.min(20, Math.round(fuzzy.score * 25));
        signals.push(`surname_fuzzy(${surnameA}/${surnameB})`);
      } else {
        signals.push('surname_mismatch');
      }
    }
  }
  if (givenA && givenB && givenA === givenB) {
    score += 20;
    signals.push('given_exact');
  }

  // Signal naming convention:
  //   - `prefix(value)` for numeric or composite values:
  //     `birth_year_close(2)`, `surname_fuzzy(wagner/whatson)`
  //   - `prefix:value` for slug-like singletons:
  //     `shared_child:joan_carol_jandt`, `pid_match:GHW9-PK5`
  //   - bare `prefix` for boolean signals:
  //     `surname_exact`, `surname_mismatch`, `given_exact`
  // Downstream consumers (Task 7 PID corroboration check, triage doc
  // generators) MUST match by `startsWith`, never by exact equality.
  const birthA = extractYear(a.frontmatter?.birth?.date);
  const birthB = extractYear(b.frontmatter?.birth?.date);
  if (birthA != null && birthB != null) {
    const gap = Math.abs(birthA - birthB);
    if (gap === 0) { score += 15; signals.push('birth_year_exact'); }
    else if (gap <= 1) { score += 12; signals.push(`birth_year_close(${gap})`); }
    else if (gap <= 3) { score += 8; signals.push(`birth_year_close(${gap})`); }
    else if (gap <= 5) { score += 4; signals.push(`birth_year_window(${gap})`); }
  }

  // ── Relational pass (signal family 2) ────────────────────────────
  // Shared child / shared spouse + birth state. This pass is
  // independent of the surname-fuzzy family and is the primary
  // catcher for the maiden-vs-married duplicate failure mode
  // (see the Bertha case in __fixtures__/person-matcher/).
  const childrenA = (a.frontmatter?.children || []).filter(Boolean);
  const childrenB = (b.frontmatter?.children || []).filter(Boolean);
  const sharedChildren = childrenA.filter(c => childrenB.includes(c));
  for (const child of sharedChildren) {
    score += 30;
    signals.push(`shared_child:${child}`);
  }

  const spousesA = (a.frontmatter?.spouses || [])
    .map(s => (typeof s === 'string' ? s : s?.slug))
    .filter(Boolean);
  const spousesB = (b.frontmatter?.spouses || [])
    .map(s => (typeof s === 'string' ? s : s?.slug))
    .filter(Boolean);
  const sharedSpouses = spousesA.filter(s => spousesB.includes(s));
  for (const spouse of sharedSpouses) {
    score += 25;
    signals.push(`shared_spouse:${spouse}`);
  }

  // Birth state match (when both have a birth place)
  const stateA = extractState(a.frontmatter?.birth?.place);
  const stateB = extractState(b.frontmatter?.birth?.place);
  if (stateA && stateB && stateA === stateB) {
    score += 8;
    signals.push(`birth_state:${stateA}`);
  }

  // ── PID boost (HIGH-only when corroborated) ─────────────────────
  // Per CODEX: PID alone is not sufficient for HIGH. Identical
  // FS PIDs do show up on data-entry mistakes. Requires at least
  // one corroborating signal — see scoreToConfidence below.
  // FS PIDs are case-sensitive base-36 checksummed identifiers,
  // so strict === is correct — do NOT lowercase before comparing.
  const pidA = a.frontmatter?.external_ids?.familysearch_tree;
  const pidB = b.frontmatter?.external_ids?.familysearch_tree;
  if (pidA && pidB && pidA === pidB) {
    score += 30;
    signals.push(`pid_match:${pidA}`);
  }

  // ── discovered_from boost ─────────────────────────────────────────
  // Fires when the candidate (a) was discovered from a child whose
  // opposite-sex parent slot is empty AND that child is also in the
  // existing record's (b) children AND the discovered role matches
  // the empty slot. Per CODEX: this is a BOOST, not a standalone
  // match rule, and is NOT in the PID corroborating list.
  //
  // Role whitelist (strict): only "Mother" / "Father" with optional
  // trailing context (e.g. "Mother of deceased (...)"). Excludes
  // Stepmother, Grandmother, Maternal Grandfather, Mother-in-law,
  // and other near-matches that production data is full of and that
  // a lenient .includes('mother') would silently misclassify.
  const discoveredEntries = a.frontmatter?.discovered_from || [];
  for (const entry of discoveredEntries) {
    if (!entry?.person || !entry?.role) continue;
    const childParents = ctx.parentsByChild?.get(entry.person);
    if (!childParents) continue;
    const slot = extractDiscoveredParentRole(entry.role);
    if (!slot) continue;
    if (childParents[slot]) continue; // slot is filled, no boost
    const childInB = (b.frontmatter?.children || []).includes(entry.person);
    if (!childInB) continue;
    score += 15;
    signals.push('discovered_from_boost');
    break; // only count once per match
  }

  // ── Parent-role mismatch dampener ───────────────────────────────
  // When two records claim opposite parent slots for the same child
  // ("Mother" vs "Father"), they are almost certainly the two
  // parents from one household rather than duplicate people. This
  // guard handles the common post-sweep false-positive case where
  // both records still have sex: null so the sex_mismatch dampener
  // cannot fire.
  const discoveredRolesA = buildDiscoveredRoleMap(a.frontmatter);
  const discoveredRolesB = buildDiscoveredRoleMap(b.frontmatter);
  for (const [child, roleA] of discoveredRolesA.entries()) {
    const roleB = discoveredRolesB.get(child);
    if (!roleB || roleA === roleB) continue;
    score += PARENT_ROLE_MISMATCH_PENALTY_PER_CHILD;
    signals.push(`parent_role_mismatch:${child}(${roleA}/${roleB})`);
  }

  // ── Sex mismatch dampener ────────────────────────────────────────
  // When both records have a KNOWN but differing sex, scale a
  // dampener proportional to the shared-children count to exactly
  // cancel the relational pass's contribution. The PID corroboration
  // rule in scoreToConfidence is also blocked when sex_mismatch is
  // present — see the rule body for the rationale.
  //
  // Auto-generated stubs often leave top-level sex null even when
  // discovered_from already knows the record is a Father/Mother.
  // Resolve sex from explicit frontmatter first, then from an
  // unambiguous discovered_from parent role. Unknown-sex records are
  // still treated as missing.
  const sexA = resolveKnownSex(a.frontmatter);
  const sexB = resolveKnownSex(b.frontmatter);
  if (KNOWN_SEX.has(sexA) && KNOWN_SEX.has(sexB) && sexA !== sexB) {
    // Per-child scaling: cancel the shared_child boost at the same
    // rate it was applied. A couple with 5 shared children gets
    // -150, exactly canceling +150.
    score += SEX_MISMATCH_PENALTY_PER_SHARED_CHILD * Math.max(1, sharedChildren.length);
    signals.push(`sex_mismatch(${sexA}/${sexB})`);
  }

  const hasFuzzy = signals.some(s => s.startsWith('surname_'));
  const hasRelational = signals.some(s =>
    s.startsWith('shared_') || s.startsWith('discovered_from'));
  let match_type = 'surname_fuzzy';
  if (hasRelational && hasFuzzy) match_type = 'mixed';
  else if (hasRelational) match_type = 'relational';

  return {
    score,
    confidence: scoreToConfidence(score, signals),
    signals,
    match_type,
  };
}

/**
 * Return the canonical (birth) surname for a person frontmatter.
 * If `name.maiden` is set, that's the canonical birth surname.
 * Otherwise `name.surname` is treated as canonical (consistent with
 * migration/audit_surnames.mjs convention).
 */
export function canonicalSurname(fm) {
  if (!fm?.name) return '';
  const maiden = (fm.name.maiden || '').toLowerCase().trim();
  if (maiden) return maiden;
  return (fm.name.surname || '').toLowerCase().trim();
}

export function scoreToConfidence(score, signals = []) {
  // PID corroboration rule (CODEX requirement): shared FS PID +
  // at least one corroborating signal forces HIGH regardless of
  // raw score. PID alone is NOT sufficient — identical PIDs can
  // come from data-entry mistakes.
  //
  // Source of truth for the corroborating list:
  // docs/superpowers/specs/2026-04-07-tree-cleanup-design.md (HIGH threshold).
  //
  // The rule meaningfully fires in the low-corroboration case:
  // pid_match (+30) + birth_state (+8) + birth_year_close (+12) = 50,
  // which is LOW by raw score but HIGH per CODEX. The rule rescues
  // those mid-score pairs. It also covers high-score cases where
  // raw thresholds would already promote to HIGH (belt-and-suspenders).
  //
  // birth_year_window (the +4 weak signal at 4-5 year gap) is
  // intentionally EXCLUDED from corroboration — a 5-year birth
  // discrepancy + a PID mistake should NOT auto-merge.
  const hasPid = signals.some(s => s.startsWith('pid_match'));
  const hasCorroborating = signals.some(s =>
    s.startsWith('shared_child') ||
    s.startsWith('shared_spouse') ||
    s.startsWith('birth_year_exact') ||
    s.startsWith('birth_year_close') ||
    s.startsWith('birth_state'));
  // Sex mismatch vetoes the PID corroboration rule. A husband+wife
  // pair with a typo'd PID would otherwise be auto-promoted to HIGH
  // by the corroboration shortcut, even with the per-child dampener.
  // Sex disagreement is a strong-enough signal that we want it
  // surfaced for human review (MEDIUM at most), never auto-merged.
  const hasSexMismatch = signals.some(s => s.startsWith('sex_mismatch'));
  const hasParentRoleMismatch = signals.some(s => s.startsWith('parent_role_mismatch'));
  if (hasPid && hasCorroborating && !hasSexMismatch && !hasParentRoleMismatch) return CONFIDENCE.HIGH;

  if (score >= THRESHOLDS.HIGH) return CONFIDENCE.HIGH;
  if (score >= THRESHOLDS.MEDIUM) return CONFIDENCE.MEDIUM;
  if (score >= THRESHOLDS.LOW) return CONFIDENCE.LOW;
  return CONFIDENCE.SKIP;
}

/**
 * Scan a candidate against a pool of existing persons and return all
 * non-SKIP matches sorted by score descending.
 */
export function findCandidateMatches(candidate, pool, ctx) {
  const results = [];
  for (const existing of pool) {
    if (existing.slug === candidate.slug) continue;
    const result = matchPerson(candidate, existing, ctx);
    if (result.confidence !== CONFIDENCE.SKIP) {
      results.push({ slug: existing.slug, ...result });
    }
  }
  return results.sort((x, y) => y.score - x.score);
}

function extractYear(dateStr) {
  if (!dateStr) return null;
  const match = String(dateStr).match(/\b(1[0-9]{3}|20[0-9]{2})\b/);
  return match ? parseInt(match[1], 10) : null;
}

// Country tokens that production data sometimes appends after the
// state, e.g. "Wisconsin, United States". The matcher must drop
// these so "Wisconsin" and "Wisconsin, USA" still produce a
// matching birth_state signal. Real cases observed in
// data/verified_nodes/ as of 2026-04-07.
const COUNTRY_TOKENS = new Set([
  'usa',
  'u.s.',
  'us',
  'u.s.a.',
  'united states',
  'united states of america',
  'america',
]);

function extractState(placeStr) {
  if (!placeStr) return null;
  // "Marin County, California" → "California"
  // "Wisconsin" → "Wisconsin"
  // "Grover, Marinette, Wisconsin" → "Wisconsin"
  // "Wisconsin, United States" → "Wisconsin" (country token stripped)
  // "Bourbon, Kentucky USA" → "Kentucky" (handles space-separated tail too)
  const parts = String(placeStr).split(',').map(p => p.trim()).filter(Boolean);
  while (parts.length > 1 && COUNTRY_TOKENS.has(parts[parts.length - 1].toLowerCase())) {
    parts.pop();
  }
  // Also handle the unsegmented "Kentucky USA" case where the country
  // is appended without a comma. Strip the trailing country word(s)
  // from the last segment if present.
  if (parts.length > 0) {
    const last = parts[parts.length - 1];
    for (const token of COUNTRY_TOKENS) {
      const suffix = ' ' + token;
      if (last.toLowerCase().endsWith(suffix)) {
        parts[parts.length - 1] = last.slice(0, -suffix.length).trim();
        break;
      }
    }
  }
  return parts[parts.length - 1] || null;
}

function extractDiscoveredParentRole(role) {
  if (!role) return null;
  const normalized = String(role).trim().toLowerCase();
  if (/^mother(\s|$|\()/.test(normalized)) return 'mother';
  if (/^father(\s|$|\()/.test(normalized)) return 'father';
  return null;
}

function buildDiscoveredRoleMap(frontmatter) {
  const rolesByChild = new Map();
  for (const entry of frontmatter?.discovered_from || []) {
    if (!entry?.person) continue;
    const role = extractDiscoveredParentRole(entry.role);
    if (!role) continue;
    rolesByChild.set(entry.person, role);
  }
  return rolesByChild;
}

function resolveKnownSex(frontmatter) {
  const explicitSex = frontmatter?.sex;
  if (KNOWN_SEX.has(explicitSex)) return explicitSex;

  const discoveredRoles = new Set(buildDiscoveredRoleMap(frontmatter).values());
  if (discoveredRoles.size === 1) {
    const [role] = discoveredRoles;
    if (role === 'mother') return 'Female';
    if (role === 'father') return 'Male';
  }

  return explicitSex;
}
