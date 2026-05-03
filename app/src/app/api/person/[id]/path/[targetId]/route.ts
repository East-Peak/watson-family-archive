import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import matter from 'gray-matter';
import { findRelationshipPath } from '@/lib/neo4j';
import { siteConfig } from '@/lib/siteConfig';
import {
  classifyRelationshipHopCandidate,
  getParentRole,
} from '../../../../../../../scripts/lib/relationship_hop_audit.mjs';

const DEFAULT_TREE_ID = siteConfig.defaultTreeId;
const VERIFIED_NODES_DIR = join(process.cwd(), '..', 'data', 'verified_nodes');

interface PathNode {
  id: string;
  name: string;
  sex: string;
  birthYear?: number;
}

interface RelationshipCaveat {
  kind: 'ambiguous_hop_bridge';
  classification: string;
  confidence: string;
  rationale: string;
  sourceId: string;
  siblingId: string;
  candidateParentId: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; targetId: string }> }
) {
  try {
    const { id, targetId } = await params;
    const { searchParams } = new URL(request.url);
    const treeId = searchParams.get('treeId') || DEFAULT_TREE_ID;

    const path = await findRelationshipPath(id, targetId, treeId);

    if (!path) {
      return NextResponse.json(
        { connected: false, message: 'No relationship found between these people' },
        { status: 200 }
      );
    }

    const relationshipCaveat = await analyzeRelationshipPathCaveat(
      path.relationshipTypes,
      path.pathNodes
    );

    // Fall back to a conservative label when the chosen graph path uses an
    // ambiguous sibling-to-parent bridge. Those bridges are often valid graph
    // connectivity but weak human relationship labels.
    const relationshipLabel = relationshipCaveat
      ? 'Relative'
      : calculateRelationshipLabel(path.relationshipTypes, path.pathNodes);

    return NextResponse.json({
      connected: true,
      path: path.pathNodes,
      relationshipTypes: path.relationshipTypes,
      distance: path.distance,
      relationshipLabel,
      relationshipCaveat,
    });
  } catch (error) {
    console.error('Error finding relationship path:', error);
    return NextResponse.json(
      { error: 'Failed to find relationship path' },
      { status: 500 }
    );
  }
}

/**
 * Gender a relationship term based on the target person's sex.
 * e.g., "Grandparent" + M → "Grandfather", "Child" + F → "Daughter"
 */
function genderTerm(term: string, sex: string | null | undefined): string {
  if (!sex) return term;

  const genderMap: Record<string, { M: string; F: string }> = {
    'Grandparent':        { M: 'Grandfather',      F: 'Grandmother' },
    'Grandchild':         { M: 'Grandson',          F: 'Granddaughter' },
    'grandparent':        { M: 'grandfather',       F: 'grandmother' },
    'grandchild':         { M: 'grandson',          F: 'granddaughter' },
    'Parent':             { M: 'Father',            F: 'Mother' },
    'Child':              { M: 'Son',               F: 'Daughter' },
    'Sibling':            { M: 'Brother',           F: 'Sister' },
    'Aunt/Uncle':         { M: 'Uncle',             F: 'Aunt' },
    'Niece/Nephew':       { M: 'Nephew',            F: 'Niece' },
    'Great-aunt/uncle':   { M: 'Great-uncle',       F: 'Great-aunt' },
    'Grand-niece/nephew': { M: 'Grand-nephew',      F: 'Grand-niece' },
    'Spouse':             { M: 'Husband',            F: 'Wife' },
  };

  // Exact match first
  if (genderMap[term]) {
    return sex === 'M' ? genderMap[term].M : sex === 'F' ? genderMap[term].F : term;
  }

  // Partial match for compound terms like "Great-great-grandparent"
  for (const [base, terms] of Object.entries(genderMap)) {
    if (term.includes(base)) {
      const replacement = sex === 'M' ? terms.M : sex === 'F' ? terms.F : base;
      return term.replace(base, replacement);
    }
  }

  return term;
}

/**
 * Calculate a human-readable relationship label from the path
 */
function calculateRelationshipLabel(
  relationshipTypes: string[],
  pathNodes: PathNode[]
): string {
  // The target person is the last node in the path
  const targetSex = pathNodes[pathNodes.length - 1]?.sex || null;

  // Split at SPOUSE_OF to handle in-law relationships:
  //   [blood path from "me" to spouse] + SPOUSE_OF + [blood path from spouse to target]
  const spouseIdx = relationshipTypes.indexOf('SPOUSE_OF');
  const isInLaw = spouseIdx !== -1;

  // Get the "blood" portion (the part after SPOUSE_OF, or the whole thing)
  const bloodTypes = isInLaw
    ? relationshipTypes.slice(spouseIdx + 1)
    : relationshipTypes;

  const bloodLabel = genderTerm(computeBloodLabel(bloodTypes), targetSex);

  if (!isInLaw) {
    return bloodLabel;
  }

  if (bloodTypes.length === 0) return genderTerm('Spouse', targetSex);

  // Standard in-law terms that people actually use
  const standardInLawBases = ['Father', 'Mother', 'Brother', 'Sister', 'Son', 'Daughter',
    'Parent', 'Sibling', 'Child'];

  if (standardInLawBases.includes(bloodLabel)) {
    return bloodLabel + '-in-law';
  }

  // For extended relationships (grandparent, aunt, cousin, etc.),
  // use "Husband's/Wife's [Relationship]" — standard genealogy convention.
  // The spouse is the node right after the SPOUSE_OF edge.
  const spouseNode = pathNodes[spouseIdx + 1];
  const spouseLabel = spouseNode?.sex === 'M' ? "Husband's"
    : spouseNode?.sex === 'F' ? "Wife's"
    : "Spouse's";

  return `${spouseLabel} ${bloodLabel}`;
}

async function analyzeRelationshipPathCaveat(
  relationshipTypes: string[],
  pathNodes: PathNode[]
): Promise<RelationshipCaveat | null> {
  if (relationshipTypes.length < 2 || pathNodes.length < 3) {
    return null;
  }

  const frontmatterCache = new Map<string, Record<string, unknown> | null>();

  for (let i = 0; i < relationshipTypes.length - 1; i++) {
    if (relationshipTypes[i] !== 'SIBLING_OF' || relationshipTypes[i + 1] !== 'CHILD_OF') {
      continue;
    }

    const sourceNode = pathNodes[i];
    const siblingNode = pathNodes[i + 1];
    const candidateParentNode = pathNodes[i + 2];

    if (!sourceNode?.id || !siblingNode?.id || !candidateParentNode?.id) {
      continue;
    }

    const [sourceFrontmatter, siblingFrontmatter, candidateParentFrontmatter] = await Promise.all([
      loadFrontmatter(sourceNode.id, frontmatterCache),
      loadFrontmatter(siblingNode.id, frontmatterCache),
      loadFrontmatter(candidateParentNode.id, frontmatterCache),
    ]);

    if (!sourceFrontmatter || !siblingFrontmatter) {
      continue;
    }

    const candidateRole = getParentRole(siblingFrontmatter, candidateParentNode.id);
    const sourceParents = (sourceFrontmatter?.parents ?? null) as
      | { father?: string | null; mother?: string | null }
      | null;
    const sourceRoleParentId = candidateRole
      ? sourceParents?.[candidateRole] || null
      : null;
    const sourceRoleParentFrontmatter = sourceRoleParentId
      ? await loadFrontmatter(sourceRoleParentId, frontmatterCache)
      : null;

    const classification = classifyRelationshipHopCandidate({
      sourceSlug: sourceNode.id,
      siblingSlug: siblingNode.id,
      candidateParentId: candidateParentNode.id,
      sourceFrontmatter,
      siblingFrontmatter,
      candidateParentFrontmatter,
      sourceRoleParentId,
      sourceRoleParentFrontmatter,
    });

    return {
      kind: 'ambiguous_hop_bridge',
      classification: classification.classification,
      confidence: classification.confidence,
      rationale: classification.rationale,
      sourceId: sourceNode.id,
      siblingId: siblingNode.id,
      candidateParentId: candidateParentNode.id,
    };
  }

  return null;
}

async function loadFrontmatter(
  slug: string,
  cache: Map<string, Record<string, unknown> | null>
): Promise<Record<string, unknown> | null> {
  if (cache.has(slug)) {
    return cache.get(slug) ?? null;
  }

  try {
    const content = await readFile(join(VERIFIED_NODES_DIR, `${slug}.md`), 'utf-8');
    const parsed = matter(content);
    const frontmatter = (parsed.data ?? {}) as Record<string, unknown>;
    cache.set(slug, frontmatter);
    return frontmatter;
  } catch (error) {
    if (typeof error === 'object' && error && 'code' in error && error.code === 'ENOENT') {
      cache.set(slug, null);
      return null;
    }

    console.warn(`Failed to read relationship frontmatter for ${slug}:`, error);
    cache.set(slug, null);
    return null;
  }
}

function computeBloodLabel(types: string[]): string {
  if (types.length === 0) return 'Spouse';

  // Count generational movement
  // CHILD_OF = going UP one generation (toward ancestors)
  // PARENT_OF = going DOWN one generation (toward descendants)
  // SIBLING_OF = same generation (lateral)
  let ups = 0;   // toward ancestors
  let downs = 0; // toward descendants
  let laterals = 0;

  for (const t of types) {
    if (t === 'CHILD_OF') ups++;
    else if (t === 'PARENT_OF') downs++;
    else if (t === 'SIBLING_OF') laterals++;
  }

  // Direct relationships
  if (types.length === 1) {
    if (ups === 1) return 'Parent';
    if (downs === 1) return 'Child';
    if (laterals === 1) return 'Sibling';
  }

  // Pure ancestor line (all ups)
  if (downs === 0 && laterals === 0) {
    if (ups === 1) return 'Parent';
    if (ups === 2) return 'Grandparent';
    if (ups === 3) return 'Great-grandparent';
    if (ups === 4) return 'Great-great-grandparent';
    // 5+ greats: use ordinal form "3rd Great-grandparent" (standard genealogy convention)
    return `${getOrdinal(ups - 2)} Great-grandparent`;
  }

  // Pure descendant line (all downs)
  if (ups === 0 && laterals === 0) {
    if (downs === 1) return 'Child';
    if (downs === 2) return 'Grandchild';
    if (downs === 3) return 'Great-grandchild';
    if (downs === 4) return 'Great-great-grandchild';
    return `${getOrdinal(downs - 2)} Great-grandchild`;
  }

  // Sibling (up then down, or lateral)
  if (laterals === 1 && ups === 0 && downs === 0) return 'Sibling';
  if (ups === 1 && downs === 1 && laterals === 0) return 'Sibling';

  // Aunt/Uncle: up to parent's level then lateral, or up+up+down
  if (laterals === 1 && ups === 1 && downs === 0) return 'Aunt/Uncle';
  if (ups === 2 && downs === 1 && laterals === 0) return 'Aunt/Uncle';

  // Niece/Nephew: lateral then down, or up+down+down
  if (laterals === 1 && downs === 1 && ups === 0) return 'Niece/Nephew';
  if (ups === 1 && downs === 2 && laterals === 0) return 'Niece/Nephew';

  // Great-aunt/uncle
  if (laterals === 1 && ups === 2 && downs === 0) return 'Great-aunt/uncle';
  if (ups === 3 && downs === 1 && laterals === 0) return 'Great-aunt/uncle';

  // Grand-niece/nephew
  if (laterals === 1 && downs === 2 && ups === 0) return 'Grand-niece/nephew';
  if (ups === 1 && downs === 3 && laterals === 0) return 'Grand-niece/nephew';

  // Cousins: up N, lateral(optional), down M
  // With SIBLING_OF shortcut: cousin = up + lateral + down
  const effectiveUps = ups + (laterals > 0 ? 1 : 0);
  const effectiveDowns = downs + (laterals > 0 ? 1 : 0);

  if (effectiveUps >= 2 && effectiveDowns >= 2) {
    const cousinDegree = Math.min(effectiveUps, effectiveDowns) - 1;
    const removed = Math.abs(effectiveUps - effectiveDowns);
    const ordinal = getOrdinal(cousinDegree);
    return removed === 0
      ? `${ordinal} Cousin`
      : `${ordinal} Cousin ${removed}x Removed`;
  }

  return `Relative (${types.length} steps)`;
}

function getOrdinal(n: number): string {
  const ordinals = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth'];
  return ordinals[n - 1] || `${n}th`;
}
