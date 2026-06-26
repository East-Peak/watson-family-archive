import { fuzzyNameMatch } from './fuzzy_names.mjs';
import {
  canonicalSurname,
  CONFIDENCE,
  matchPerson,
} from './person-matcher.mjs';

export function getParentSnapshot(frontmatter) {
  const father = frontmatter?.parents?.father || null;
  const mother = frontmatter?.parents?.mother || null;
  const knownParents = [father, mother].filter(Boolean);

  return {
    father,
    mother,
    knownParents,
    knownParentCount: knownParents.length,
  };
}

export function getParentRole(frontmatter, parentSlug) {
  if (!parentSlug) return null;
  if (frontmatter?.parents?.father === parentSlug) return 'father';
  if (frontmatter?.parents?.mother === parentSlug) return 'mother';
  return null;
}

function formatSharedParent(sharedParentIds) {
  if (sharedParentIds.length === 0) return 'no recorded parents';
  if (sharedParentIds.length === 1)
    return `shared parent ${sharedParentIds[0]}`;
  return `shared parents ${sharedParentIds.join(', ')}`;
}

function extractBirthYear(frontmatter) {
  const value = frontmatter?.birth?.date;
  if (!value) return null;
  const match = String(value).match(/\b(1[0-9]{3}|20[0-9]{2})\b/);
  return match ? parseInt(match[1], 10) : null;
}

const COUNTRY_TOKENS = new Set([
  'usa',
  'u.s.',
  'us',
  'u.s.a.',
  'united states',
  'united states of america',
  'america',
]);

function extractBirthState(frontmatter) {
  const place = frontmatter?.birth?.place;
  if (!place) return null;

  const parts = String(place)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  while (
    parts.length > 1 &&
    COUNTRY_TOKENS.has(parts[parts.length - 1].toLowerCase())
  ) {
    parts.pop();
  }

  if (parts.length > 0) {
    const last = parts[parts.length - 1];
    for (const token of COUNTRY_TOKENS) {
      const suffix = ` ${token}`;
      if (last.toLowerCase().endsWith(suffix)) {
        parts[parts.length - 1] = last.slice(0, -suffix.length).trim();
        break;
      }
    }
  }

  return parts[parts.length - 1] || null;
}

function getSpouseSlugs(frontmatter) {
  return (frontmatter?.spouses || [])
    .map((spouse) => (typeof spouse === 'string' ? spouse : spouse?.slug))
    .filter(Boolean);
}

function getChildSlugs(frontmatter) {
  return (frontmatter?.children || []).filter(Boolean);
}

function getDiscoveredRoles(frontmatter) {
  return (frontmatter?.discovered_from || [])
    .map((entry) => entry?.role)
    .filter(Boolean)
    .map((role) => String(role).trim());
}

function isStrictParentRole(role) {
  if (!role) return false;
  return /^(mother|father)(\s|$|\()/i.test(role);
}

function getSuspiciousDiscoveredRoles(frontmatter) {
  return getDiscoveredRoles(frontmatter).filter((role) => {
    if (isStrictParentRole(role)) return false;
    return /(step|grand|other|\?|wife|husband|head|in-law|boarder|lodger|sister|brother|daughter|son)/i.test(
      role,
    );
  });
}

function hasOnlyHouseholdStyleSources(frontmatter) {
  const sources = frontmatter?.sources;
  if (!Array.isArray(sources) || sources.length === 0) return false;

  let sawCensus = false;
  for (const source of sources) {
    const type = String(source?.record_type || '').toLowerCase();
    if (type === 'census') {
      sawCensus = true;
      continue;
    }
    if (type !== 'other') {
      return false;
    }
  }

  return sawCensus;
}

function summarizeIdentityComparison({
  sourceRoleParentId,
  sourceRoleParentFrontmatter,
  candidateParentId,
  candidateParentFrontmatter,
}) {
  if (!sourceRoleParentId || !candidateParentId) return null;
  if (sourceRoleParentId === candidateParentId) return null;
  if (!sourceRoleParentFrontmatter || !candidateParentFrontmatter) return null;

  const matcherResult = matchPerson(
    { slug: sourceRoleParentId, frontmatter: sourceRoleParentFrontmatter },
    { slug: candidateParentId, frontmatter: candidateParentFrontmatter },
    { parentsByChild: new Map() },
  );

  const givenA = String(sourceRoleParentFrontmatter?.name?.given || '')
    .toLowerCase()
    .trim();
  const givenB = String(candidateParentFrontmatter?.name?.given || '')
    .toLowerCase()
    .trim();
  const givenFuzzy =
    givenA && givenB
      ? fuzzyNameMatch(givenA, givenB)
      : { match: false, method: 'none', score: 0 };

  const surnameA = canonicalSurname(sourceRoleParentFrontmatter);
  const surnameB = canonicalSurname(candidateParentFrontmatter);
  const surnameFuzzy =
    surnameA && surnameB
      ? fuzzyNameMatch(surnameA, surnameB)
      : { match: false, method: 'none', score: 0 };

  const birthYearA = extractBirthYear(sourceRoleParentFrontmatter);
  const birthYearB = extractBirthYear(candidateParentFrontmatter);
  const birthYearGap =
    birthYearA != null && birthYearB != null
      ? Math.abs(birthYearA - birthYearB)
      : null;

  const birthStateA = extractBirthState(sourceRoleParentFrontmatter);
  const birthStateB = extractBirthState(candidateParentFrontmatter);

  const sharedSpouses = getSpouseSlugs(sourceRoleParentFrontmatter).filter(
    (slug) => getSpouseSlugs(candidateParentFrontmatter).includes(slug),
  );
  const sharedChildren = getChildSlugs(sourceRoleParentFrontmatter).filter(
    (slug) => getChildSlugs(candidateParentFrontmatter).includes(slug),
  );
  const pidA =
    sourceRoleParentFrontmatter?.external_ids?.familysearch_tree || null;
  const pidB =
    candidateParentFrontmatter?.external_ids?.familysearch_tree || null;
  const pidMatch = Boolean(pidA && pidB && pidA === pidB);

  const givenMatches = Boolean(
    (givenA && givenB && givenA === givenB) || givenFuzzy.match,
  );
  const surnameMatches = Boolean(
    (surnameA && surnameB && surnameA === surnameB) || surnameFuzzy.match,
  );

  const corroborators = [];
  if (birthYearGap != null && birthYearGap <= 3)
    corroborators.push(`birth_year_gap:${birthYearGap}`);
  if (birthStateA && birthStateB && birthStateA === birthStateB)
    corroborators.push(`birth_state:${birthStateA}`);
  if (sharedSpouses.length > 0)
    corroborators.push(`shared_spouse:${sharedSpouses.join(',')}`);
  if (sharedChildren.length > 0)
    corroborators.push(`shared_child:${sharedChildren.join(',')}`);
  if (pidMatch) corroborators.push(`pid_match:${pidA}`);

  const matcherConfidenceRank = {
    [CONFIDENCE.HIGH]: 3,
    [CONFIDENCE.MEDIUM]: 2,
    [CONFIDENCE.LOW]: 1,
    [CONFIDENCE.SKIP]: 0,
  };

  const probableDuplicateIdentity =
    surnameMatches &&
    givenMatches &&
    (matcherConfidenceRank[matcherResult.confidence] >=
      matcherConfidenceRank[CONFIDENCE.MEDIUM] ||
      corroborators.length >= 2);

  return {
    existingParentId: sourceRoleParentId,
    matcherScore: matcherResult.score,
    matcherConfidence: matcherResult.confidence,
    matcherSignals: matcherResult.signals,
    givenMatch: givenMatches
      ? givenA === givenB
        ? 'exact'
        : givenFuzzy.method
      : null,
    surnameMatch: surnameMatches
      ? surnameA === surnameB
        ? 'exact'
        : surnameFuzzy.method
      : null,
    corroborators,
    probableDuplicateIdentity,
  };
}

function summarizeHouseholdMiswire({
  sourceSlug,
  siblingSlug,
  sourceParents,
  siblingParents,
  candidateParentId,
  candidateParentFrontmatter,
}) {
  if (!candidateParentFrontmatter) return null;

  const suspiciousDiscoveredRoles = getSuspiciousDiscoveredRoles(
    candidateParentFrontmatter,
  );
  const spouseOverlap = getSpouseSlugs(candidateParentFrontmatter).filter(
    (slug) =>
      sourceParents.knownParents.includes(slug) ||
      siblingParents.knownParents.includes(slug),
  );
  const childOverlap = getChildSlugs(candidateParentFrontmatter).filter(
    (slug) => slug === sourceSlug || slug === siblingSlug,
  );
  const censusOnly = hasOnlyHouseholdStyleSources(candidateParentFrontmatter);
  const autoGenerated = candidateParentFrontmatter?.status === 'auto_generated';

  const probableHouseholdMiswire =
    autoGenerated &&
    censusOnly &&
    childOverlap.length > 0 &&
    (suspiciousDiscoveredRoles.length > 0 || spouseOverlap.length > 0);

  return {
    suspiciousDiscoveredRoles,
    spouseOverlap,
    childOverlap,
    censusOnly,
    autoGenerated,
    probableHouseholdMiswire,
    candidateParentId,
  };
}

/**
 * @param {{
 *   sourceSlug: string,
 *   siblingSlug: string,
 *   candidateParentId: string,
 *   sourceFrontmatter: Record<string, any>,
 *   siblingFrontmatter: Record<string, any>,
 *   candidateParentFrontmatter?: Record<string, any> | null,
 *   sourceRoleParentId?: string | null,
 *   sourceRoleParentFrontmatter?: Record<string, any> | null,
 * }} options
 */
export function classifyRelationshipHopCandidate({
  sourceSlug,
  siblingSlug,
  candidateParentId,
  sourceFrontmatter,
  siblingFrontmatter,
  candidateParentFrontmatter = null,
  sourceRoleParentId = null,
  sourceRoleParentFrontmatter = null,
}) {
  const sourceParents = getParentSnapshot(sourceFrontmatter);
  const siblingParents = getParentSnapshot(siblingFrontmatter);
  const candidateRoleInSibling = getParentRole(
    siblingFrontmatter,
    candidateParentId,
  );
  const candidateRoleInSource = getParentRole(
    sourceFrontmatter,
    candidateParentId,
  );
  const sharedParentIds = sourceParents.knownParents.filter((parentId) =>
    siblingParents.knownParents.includes(parentId),
  );

  const duplicateIdentity = summarizeIdentityComparison({
    sourceRoleParentId,
    sourceRoleParentFrontmatter,
    candidateParentId,
    candidateParentFrontmatter,
  });
  const householdMiswireSignals = summarizeHouseholdMiswire({
    sourceSlug,
    siblingSlug,
    sourceParents,
    siblingParents,
    candidateParentId,
    candidateParentFrontmatter,
  });

  if (
    !candidateRoleInSibling &&
    householdMiswireSignals?.probableHouseholdMiswire
  ) {
    const roleText =
      householdMiswireSignals.suspiciousDiscoveredRoles.join(', ') ||
      'non-parent household role';
    const spouseText =
      householdMiswireSignals.spouseOverlap.length > 0
        ? ` spouse overlap with ${householdMiswireSignals.spouseOverlap.join(', ')}`
        : '';

    return {
      classification: 'probable_household_miswire',
      confidence: 'high',
      sharedParentIds,
      candidateRole: null,
      suggestedUpdate: null,
      duplicateIdentity,
      householdMiswireSignals,
      rationale: `${candidateParentId} looks like a household-relative stub (${roleText}) with census-only evidence and${spouseText || ' a direct child overlap'} rather than a biological parent.`,
    };
  }

  if (!candidateRoleInSibling) {
    return {
      classification: 'graph_only_parent_bridge',
      confidence: 'low',
      sharedParentIds,
      candidateRole: null,
      suggestedUpdate: null,
      duplicateIdentity,
      householdMiswireSignals,
      rationale: `${siblingSlug} reaches ${candidateParentId} in Neo4j, but that parent is not present in sibling frontmatter.`,
    };
  }

  if (candidateRoleInSource === candidateRoleInSibling) {
    return {
      classification: 'graph_frontmatter_mismatch',
      confidence: 'low',
      sharedParentIds,
      candidateRole: candidateRoleInSibling,
      suggestedUpdate: null,
      duplicateIdentity,
      householdMiswireSignals,
      rationale: `${sourceSlug} already records ${candidateParentId} as ${candidateRoleInSibling}; Neo4j path should not need the sibling hop.`,
    };
  }

  const otherRole = candidateRoleInSibling === 'father' ? 'mother' : 'father';
  const sourceMissingRole = !sourceParents[candidateRoleInSibling];
  const sharesOtherParent =
    Boolean(sourceParents[otherRole]) &&
    sourceParents[otherRole] === siblingParents[otherRole];

  if (sourceMissingRole && sharesOtherParent) {
    return {
      classification: 'high_confidence_missing_parent',
      confidence: 'high',
      sharedParentIds,
      candidateRole: candidateRoleInSibling,
      suggestedUpdate: {
        role: candidateRoleInSibling,
        parentSlug: candidateParentId,
      },
      duplicateIdentity,
      householdMiswireSignals,
      rationale: `${sourceSlug} is missing ${candidateRoleInSibling}; ${siblingSlug} shares ${otherRole} ${sourceParents[otherRole]} and has ${candidateRoleInSibling} ${candidateParentId}.`,
    };
  }

  if (sourceMissingRole && sharedParentIds.length > 0) {
    return {
      classification: 'possible_missing_parent',
      confidence: 'medium',
      sharedParentIds,
      candidateRole: candidateRoleInSibling,
      suggestedUpdate: {
        role: candidateRoleInSibling,
        parentSlug: candidateParentId,
      },
      duplicateIdentity,
      householdMiswireSignals,
      rationale: `${sourceSlug} is missing ${candidateRoleInSibling}, and ${sourceSlug}/${siblingSlug} have ${formatSharedParent(sharedParentIds)}.`,
    };
  }

  if (sourceMissingRole) {
    return {
      classification: 'possible_missing_parent',
      confidence: 'medium',
      sharedParentIds,
      candidateRole: candidateRoleInSibling,
      suggestedUpdate: {
        role: candidateRoleInSibling,
        parentSlug: candidateParentId,
      },
      duplicateIdentity,
      householdMiswireSignals,
      rationale: `${sourceSlug} is missing ${candidateRoleInSibling}, but ${sourceSlug} and ${siblingSlug} do not share a recorded parent.`,
    };
  }

  if (duplicateIdentity?.probableDuplicateIdentity) {
    return {
      classification: 'probable_duplicate_parent_identity',
      confidence:
        duplicateIdentity.matcherConfidence === CONFIDENCE.HIGH ||
        duplicateIdentity.corroborators.length >= 3
          ? 'high'
          : 'medium',
      sharedParentIds,
      candidateRole: candidateRoleInSibling,
      suggestedUpdate: null,
      duplicateIdentity,
      householdMiswireSignals,
      rationale: `${sourceSlug} already has ${candidateRoleInSibling} ${sourceRoleParentId}, and ${candidateParentId} looks like the same parent identity in a duplicate/abbreviated form.`,
    };
  }

  if (sourceParents.knownParentCount === 2 && sharedParentIds.length === 1) {
    return {
      classification: 'ambiguous_half_sibling_branch',
      confidence: 'low',
      sharedParentIds,
      candidateRole: candidateRoleInSibling,
      suggestedUpdate: null,
      duplicateIdentity,
      householdMiswireSignals,
      rationale: `${sourceSlug} already has two parents recorded; ${siblingSlug} likely represents a half-sibling branch through ${sharedParentIds[0]}.`,
    };
  }

  if (sharedParentIds.length === 0) {
    return {
      classification: 'ambiguous_sibling_link',
      confidence: 'low',
      sharedParentIds,
      candidateRole: candidateRoleInSibling,
      suggestedUpdate: null,
      duplicateIdentity,
      householdMiswireSignals,
      rationale: `${sourceSlug} and ${siblingSlug} do not share a recorded parent, so the sibling hop is structurally ambiguous.`,
    };
  }

  return {
    classification: 'ambiguous_parent_bridge',
    confidence: 'low',
    sharedParentIds,
    candidateRole: candidateRoleInSibling,
    suggestedUpdate: null,
    duplicateIdentity,
    householdMiswireSignals,
    rationale: `${sourceSlug} reaches ${candidateParentId} through ${siblingSlug}, but the frontmatter evidence is not strong enough to infer a safe repair.`,
  };
}
