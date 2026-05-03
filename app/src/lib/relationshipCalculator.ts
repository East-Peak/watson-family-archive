/**
 * Relationship Calculator
 *
 * Calculates how two people in a family tree are related.
 * Handles blood relatives and in-laws.
 */

export interface FamilyMember {
  id: string;
  name: string;
  birthYear?: number | null;
}

export interface FamilyData {
  id: string;
  name: string;
  father?: FamilyMember | null;
  mother?: FamilyMember | null;
  spouses?: FamilyMember[];
  children?: FamilyMember[];
  siblings?: FamilyMember[];
}

export interface RelationshipResult {
  relationship: string;           // e.g., "2nd great-grandfather"
  isDirectAncestor: boolean;      // true if target is in direct line above
  isDirectDescendant: boolean;    // true if target is in direct line below
  isBloodRelative: boolean;       // true if related by blood (not just marriage)
  throughSpouse?: string;         // spouse name if related through marriage
  path: PathStep[];               // the chain of people connecting them
  generationsApart: number;       // total generations between the two
}

export interface PathStep {
  id: string;
  name: string;
  relation: string;  // e.g., "father", "mother", "spouse", "child"
}

type RelationType = 'father' | 'mother' | 'child' | 'spouse' | 'sibling';

interface GraphEdge {
  targetId: string;
  relation: RelationType;
}

/**
 * Build a bidirectional graph from family data
 */
function buildFamilyGraph(families: Record<string, FamilyData>): Map<string, GraphEdge[]> {
  const graph = new Map<string, GraphEdge[]>();

  const addEdge = (fromId: string, toId: string, relation: RelationType) => {
    if (!graph.has(fromId)) {
      graph.set(fromId, []);
    }
    // Avoid duplicates
    const edges = graph.get(fromId)!;
    if (!edges.some(e => e.targetId === toId && e.relation === relation)) {
      edges.push({ targetId: toId, relation });
    }
  };

  for (const person of Object.values(families)) {
    // Parent relationships
    if (person.father?.id) {
      addEdge(person.id, person.father.id, 'father');
      addEdge(person.father.id, person.id, 'child');
    }
    if (person.mother?.id) {
      addEdge(person.id, person.mother.id, 'mother');
      addEdge(person.mother.id, person.id, 'child');
    }

    // Spouse relationships
    if (person.spouses) {
      for (const spouse of person.spouses) {
        if (spouse.id) {
          addEdge(person.id, spouse.id, 'spouse');
          addEdge(spouse.id, person.id, 'spouse');
        }
      }
    }

    // Child relationships (redundant with above but ensures completeness)
    if (person.children) {
      for (const child of person.children) {
        if (child.id) {
          addEdge(person.id, child.id, 'child');
          addEdge(child.id, person.id, 'father'); // Could be mother, but we'll fix in path analysis
        }
      }
    }

    // Sibling relationships
    if (person.siblings) {
      for (const sibling of person.siblings) {
        if (sibling.id) {
          addEdge(person.id, sibling.id, 'sibling');
          addEdge(sibling.id, person.id, 'sibling');
        }
      }
    }
  }

  return graph;
}

interface BFSNode {
  id: string;
  path: Array<{ id: string; relation: RelationType }>;
}

/**
 * Find the shortest path between two people using BFS
 */
function findPath(
  graph: Map<string, GraphEdge[]>,
  fromId: string,
  toId: string,
  families: Record<string, FamilyData>
): Array<{ id: string; name: string; relation: RelationType }> | null {
  if (fromId === toId) return [];

  const visited = new Set<string>();
  const queue: BFSNode[] = [{ id: fromId, path: [] }];
  visited.add(fromId);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const edges = graph.get(current.id) || [];

    for (const edge of edges) {
      if (visited.has(edge.targetId)) continue;

      const newPath = [...current.path, { id: edge.targetId, relation: edge.relation }];

      if (edge.targetId === toId) {
        // Found the target - enrich path with names
        return newPath.map(step => ({
          ...step,
          name: families[step.id]?.name || 'Unknown',
        }));
      }

      visited.add(edge.targetId);
      queue.push({ id: edge.targetId, path: newPath });
    }
  }

  return null; // No path found
}

/**
 * Get ordinal suffix (1st, 2nd, 3rd, etc.)
 */
function getOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * Get "great" prefix for generations
 */
function getGreatPrefix(generations: number): string {
  if (generations <= 0) return '';
  if (generations === 1) return 'great-';
  if (generations === 2) return '2nd great-';
  if (generations === 3) return '3rd great-';
  return `${getOrdinal(generations)} great-`;
}

/**
 * Get gendered term for a relationship
 */
function getGenderedTerm(
  baseTerm: string,
  targetSex: 'M' | 'F' | string | null
): string {
  const isMale = targetSex === 'M';
  const isFemale = targetSex === 'F';

  // Map base terms to gendered versions
  const genderMap: Record<string, { male: string; female: string; neutral: string }> = {
    'grandparent': { male: 'grandfather', female: 'grandmother', neutral: 'grandparent' },
    'grandchild': { male: 'grandson', female: 'granddaughter', neutral: 'grandchild' },
    'parent': { male: 'father', female: 'mother', neutral: 'parent' },
    'child': { male: 'son', female: 'daughter', neutral: 'child' },
    'sibling': { male: 'brother', female: 'sister', neutral: 'sibling' },
    'aunt/uncle': { male: 'uncle', female: 'aunt', neutral: 'aunt/uncle' },
    'niece/nephew': { male: 'nephew', female: 'niece', neutral: 'niece/nephew' },
    'cousin': { male: 'cousin', female: 'cousin', neutral: 'cousin' },
    'spouse': { male: 'husband', female: 'wife', neutral: 'spouse' },
  };

  // Check if the base term contains a gendered word we can replace
  for (const [base, terms] of Object.entries(genderMap)) {
    if (baseTerm.includes(base)) {
      const replacement = isMale ? terms.male : isFemale ? terms.female : terms.neutral;
      return baseTerm.replace(base, replacement);
    }
  }

  return baseTerm;
}

/**
 * Analyze a path to determine the relationship
 */
function analyzeRelationship(
  path: Array<{ id: string; name: string; relation: RelationType }>,
  fromName: string,
  families: Record<string, FamilyData>,
  targetSex: 'M' | 'F' | string | null = null
): RelationshipResult {
  if (path.length === 0) {
    return {
      relationship: 'yourself',
      isDirectAncestor: false,
      isDirectDescendant: false,
      isBloodRelative: true,
      path: [],
      generationsApart: 0,
    };
  }

  // Check for spouse connection at the start (in-law relationship)
  let throughSpouse: string | undefined;
  let analyzePath = path;

  if (path[0].relation === 'spouse') {
    throughSpouse = path[0].name;
    analyzePath = path.slice(1);

    if (analyzePath.length === 0) {
      const spouseTerm = getGenderedTerm('spouse', targetSex);
      return {
        relationship: spouseTerm,
        isDirectAncestor: false,
        isDirectDescendant: false,
        isBloodRelative: false,
        throughSpouse: undefined, // Direct spouse, not "through" anyone
        path: buildPathSteps(path, fromName),
        generationsApart: 0,
      };
    }
  }

  // Count upward (to ancestors) and downward (to descendants) movements
  let upCount = 0;   // Generations going up (to parents)
  let downCount = 0; // Generations going down (to children)
  let hasSibling = false;

  for (const step of analyzePath) {
    if (step.relation === 'father' || step.relation === 'mother') {
      upCount++;
    } else if (step.relation === 'child') {
      downCount++;
    } else if (step.relation === 'sibling') {
      hasSibling = true;
    } else if (step.relation === 'spouse') {
      // Spouse in the middle of path - this person's spouse
      // Usually indicates in-law or step relationship
    }
  }

  const isDirectAncestor = downCount === 0 && upCount > 0 && !hasSibling && !throughSpouse;
  const isDirectDescendant = upCount === 0 && downCount > 0 && !hasSibling && !throughSpouse;
  const isBloodRelative = !throughSpouse;

  let relationship: string;

  // Direct ancestor line (only going up)
  if (downCount === 0 && !hasSibling) {
    if (upCount === 1) {
      const parentStep = analyzePath.find(s => s.relation === 'father' || s.relation === 'mother');
      relationship = parentStep?.relation === 'father' ? 'father' : 'mother';
    } else if (upCount === 2) {
      relationship = getGenderedTerm('grandparent', targetSex);
    } else {
      relationship = getGenderedTerm(`${getGreatPrefix(upCount - 2)}grandparent`, targetSex);
    }
  }
  // Direct descendant line (only going down)
  else if (upCount === 0 && !hasSibling) {
    if (downCount === 1) {
      relationship = getGenderedTerm('child', targetSex);
    } else if (downCount === 2) {
      relationship = getGenderedTerm('grandchild', targetSex);
    } else {
      relationship = getGenderedTerm(`${getGreatPrefix(downCount - 2)}grandchild`, targetSex);
    }
  }
  // Sibling
  else if (upCount === 0 && downCount === 0 && hasSibling) {
    relationship = getGenderedTerm('sibling', targetSex);
  }
  // Aunt/Uncle (up 1, sibling, no down) or Niece/Nephew (sibling, down 1)
  else if (hasSibling) {
    if (upCount === 1 && downCount === 0) {
      relationship = getGenderedTerm('sibling', targetSex);
    } else if (upCount > 0 && downCount === 0) {
      // Parent's sibling = aunt/uncle
      if (upCount === 1) {
        relationship = getGenderedTerm('aunt/uncle', targetSex);
      } else {
        relationship = getGenderedTerm(`${getGreatPrefix(upCount - 1)}aunt/uncle`, targetSex);
      }
    } else if (upCount === 0 && downCount > 0) {
      // Sibling's child = niece/nephew
      if (downCount === 1) {
        relationship = getGenderedTerm('niece/nephew', targetSex);
      } else {
        relationship = getGenderedTerm(`${getGreatPrefix(downCount - 1)}niece/nephew`, targetSex);
      }
    } else {
      // Cousin calculation
      const cousinDegree = Math.min(upCount, downCount);
      const removed = Math.abs(upCount - downCount);

      if (cousinDegree === 1) {
        relationship = removed === 0 ? '1st cousin' : `1st cousin ${removed}x removed`;
      } else {
        const degreeStr = getOrdinal(cousinDegree);
        relationship = removed === 0 ? `${degreeStr} cousin` : `${degreeStr} cousin ${removed}x removed`;
      }
    }
  }
  // Cousins (up then down, no sibling in path but common ancestor)
  else if (upCount > 0 && downCount > 0) {
    const cousinDegree = Math.min(upCount, downCount);
    const removed = Math.abs(upCount - downCount);

    if (cousinDegree === 1) {
      // First cousin = share grandparents
      relationship = removed === 0 ? '1st cousin' : `1st cousin ${removed}x removed`;
    } else {
      const degreeStr = getOrdinal(cousinDegree);
      relationship = removed === 0 ? `${degreeStr} cousin` : `${degreeStr} cousin ${removed}x removed`;
    }
  }
  else {
    relationship = 'relative';
  }

  // Add in-law suffix if through spouse
  if (throughSpouse) {
    relationship = `${relationship}-in-law`;
  }

  return {
    relationship,
    isDirectAncestor,
    isDirectDescendant,
    isBloodRelative,
    throughSpouse,
    path: buildPathSteps(path, fromName),
    generationsApart: Math.max(upCount, downCount),
  };
}

/**
 * Build human-readable path steps
 */
function buildPathSteps(
  path: Array<{ id: string; name: string; relation: RelationType }>,
  fromName: string
): PathStep[] {
  const steps: PathStep[] = [{ id: 'self', name: fromName, relation: 'self' } as PathStep];

  for (const step of path) {
    let relationLabel: string;
    switch (step.relation) {
      case 'father': relationLabel = 'Father'; break;
      case 'mother': relationLabel = 'Mother'; break;
      case 'child': relationLabel = 'Child'; break;
      case 'spouse': relationLabel = 'Spouse'; break;
      case 'sibling': relationLabel = 'Sibling'; break;
      default: relationLabel = step.relation;
    }
    steps.push({ id: step.id, name: step.name, relation: relationLabel });
  }

  return steps;
}

/**
 * Main function: Calculate the relationship between two people
 */
export function calculateRelationship(
  fromId: string,
  toId: string,
  families: Record<string, FamilyData>,
  targetSex: 'M' | 'F' | string | null = null
): RelationshipResult | null {
  const graph = buildFamilyGraph(families);
  const fromPerson = families[fromId];

  if (!fromPerson) {
    return null;
  }

  const path = findPath(graph, fromId, toId, families);

  if (path === null) {
    return null; // No connection found
  }

  return analyzeRelationship(path, fromPerson.name, families, targetSex);
}

/**
 * Format relationship for display
 * e.g., "Your 2nd great-grandfather" or "Christine's 1st cousin"
 */
export function formatRelationship(result: RelationshipResult, ownerName: string): string {
  if (result.relationship === 'yourself') {
    return 'This is you';
  }

  const firstName = ownerName.split(' ')[0];
  let prefix = `${firstName}'s `;

  if (result.throughSpouse) {
    const spouseFirst = result.throughSpouse.split(' ')[0];
    prefix = `${spouseFirst}'s `;
  }

  return prefix + result.relationship;
}

/**
 * Get all direct ancestors of a person
 */
export function getDirectAncestors(
  personId: string,
  families: Record<string, FamilyData>
): Set<string> {
  const ancestors = new Set<string>();
  const queue = [personId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const person = families[currentId];

    if (!person) continue;

    if (person.father?.id && !ancestors.has(person.father.id)) {
      ancestors.add(person.father.id);
      queue.push(person.father.id);
    }
    if (person.mother?.id && !ancestors.has(person.mother.id)) {
      ancestors.add(person.mother.id);
      queue.push(person.mother.id);
    }
  }

  return ancestors;
}

/**
 * Get ancestors with their generation depth
 */
function getAncestorsWithDepth(
  personId: string,
  families: Record<string, FamilyData>
): Map<string, number> {
  const ancestors = new Map<string, number>();
  const queue: Array<{ id: string; depth: number }> = [{ id: personId, depth: 0 }];

  while (queue.length > 0) {
    const { id: currentId, depth } = queue.shift()!;
    const person = families[currentId];

    if (!person) continue;

    if (person.father?.id && !ancestors.has(person.father.id)) {
      ancestors.set(person.father.id, depth + 1);
      queue.push({ id: person.father.id, depth: depth + 1 });
    }
    if (person.mother?.id && !ancestors.has(person.mother.id)) {
      ancestors.set(person.mother.id, depth + 1);
      queue.push({ id: person.mother.id, depth: depth + 1 });
    }
  }

  return ancestors;
}

export interface CommonAncestorResult {
  ancestor: FamilyMember;
  generationsFromA: number;
  generationsFromB: number;
}

/**
 * Find the Most Recent Common Ancestor (MRCA) between two people
 */
export function findCommonAncestor(
  personAId: string,
  personBId: string,
  families: Record<string, FamilyData>
): CommonAncestorResult | null {
  // Get all ancestors of both people with their depth
  const ancestorsA = getAncestorsWithDepth(personAId, families);
  const ancestorsB = getAncestorsWithDepth(personBId, families);

  // Find common ancestors
  const commonAncestors: Array<{
    id: string;
    depthA: number;
    depthB: number;
    totalDepth: number;
  }> = [];

  for (const [ancestorId, depthA] of ancestorsA) {
    if (ancestorsB.has(ancestorId)) {
      const depthB = ancestorsB.get(ancestorId)!;
      commonAncestors.push({
        id: ancestorId,
        depthA,
        depthB,
        totalDepth: depthA + depthB,
      });
    }
  }

  if (commonAncestors.length === 0) {
    return null;
  }

  // Find the most recent (closest) common ancestor
  commonAncestors.sort((a, b) => a.totalDepth - b.totalDepth);
  const mrca = commonAncestors[0];

  const ancestorPerson = families[mrca.id];
  if (!ancestorPerson) {
    return null;
  }

  return {
    ancestor: {
      id: mrca.id,
      name: ancestorPerson.name,
      birthYear: ancestorPerson.father?.birthYear || ancestorPerson.mother?.birthYear || null,
    },
    generationsFromA: mrca.depthA,
    generationsFromB: mrca.depthB,
  };
}
