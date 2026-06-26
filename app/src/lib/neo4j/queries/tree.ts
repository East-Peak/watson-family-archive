import { executeQuery } from '../client';
import { cacheGraphRead } from '@/lib/cache/graphCache';
import type {
  Neo4jTree,
  Neo4jPerson,
  TreeGraphData,
  TreeGraphNode,
  TreeGraphEdge,
} from '../types';

/**
 * Fields that may be updated via the API.
 * Excludes system-managed fields: id, createdAt, updatedAt.
 */
export const EDITABLE_TREE_FIELDS: ReadonlySet<string> = new Set<string>([
  'name',
  'description',
  'isPublic',
  'rootPersonId',
]);

/**
 * Get a tree by ID
 */
export async function getTreeById(treeId: string): Promise<Neo4jTree | null> {
  const results = await executeQuery<{ tree: Neo4jTree }>(
    `
    MATCH (t:Tree {id: $treeId})
    RETURN t as tree
    `,
    { treeId },
  );

  return results.length > 0 ? results[0].tree : null;
}

/**
 * Get all trees for a user
 */
export async function getTreesForUser(userId: string): Promise<Neo4jTree[]> {
  const results = await executeQuery<{ tree: Neo4jTree; role: string }>(
    `
    MATCH (u:User {id: $userId})-[r:OWNS|COLLABORATES_ON]->(t:Tree)
    RETURN t as tree,
           CASE WHEN type(r) = 'OWNS' THEN 'owner' ELSE r.role END as role
    ORDER BY t.name
    `,
    { userId },
  );

  return results.map((r) => r.tree);
}

/**
 * Get tree graph data for visualization
 */
async function fetchTreeGraphData(
  treeId: string,
  rootPersonId?: string,
  viewMode: 'ancestors' | 'descendants' | 'full' = 'full',
  maxGenerations: number = 10,
  branchFilter?: string,
): Promise<TreeGraphData> {
  let query: string;
  const params: Record<string, unknown> = { treeId, maxGenerations };
  const commonFragment = `
      UNWIND people as p
      WITH DISTINCT t, p, people
      WHERE p IS NOT NULL

      CALL {
        WITH t, p
        OPTIONAL MATCH (p)-[:PARENT_OF]->(directChild)
        WHERE (t)-[:CONTAINS]->(directChild)
        OPTIONAL MATCH (p)<-[:CHILD_OF]-(childOfChild)
        WHERE (t)-[:CONTAINS]->(childOfChild)
        WITH collect(DISTINCT directChild) + collect(DISTINCT childOfChild) as allChildren
        UNWIND allChildren as ac
        RETURN count(DISTINCT ac) as totalChildrenCount
      }
      CALL {
        WITH t, p
        OPTIONAL MATCH (p)-[:CHILD_OF]->(directParent)
        WHERE (t)-[:CONTAINS]->(directParent)
        OPTIONAL MATCH (p)<-[:PARENT_OF]-(parentOfChild)
        WHERE (t)-[:CONTAINS]->(parentOfChild)
        WITH collect(DISTINCT directParent) + collect(DISTINCT parentOfChild) as allParents
        UNWIND allParents as ap
        RETURN count(DISTINCT ap) as totalParentsCount
      }

      OPTIONAL MATCH (p)-[:SPOUSE_OF]-(spouse)
      WHERE spouse IN people AND (t)-[:CONTAINS]->(spouse)

      OPTIONAL MATCH (p)-[:PARENT_OF]->(child)
      WHERE child IN people AND (t)-[:CONTAINS]->(child)

      OPTIONAL MATCH (p)-[:CHILD_OF]->(parent)
      WHERE parent IN people AND (t)-[:CONTAINS]->(parent)

      OPTIONAL MATCH (p)-[:CHILD_OF]->(par)<-[:CHILD_OF]-(sib)
      WHERE sib <> p AND sib IN people AND (t)-[:CONTAINS]->(sib)

      WITH t, p, totalChildrenCount, totalParentsCount,
           collect(DISTINCT spouse) as spouses,
           collect(DISTINCT parent) as parents,
           collect(DISTINCT child) as children,
           count(DISTINCT sib) as siblingCount

      OPTIONAL MATCH (p)-[:BORN_IN]->(bp:Place)
      OPTIONAL MATCH (p)-[:DIED_IN]->(dp:Place)

      RETURN
        p.id as id,
        p.fullName as name,
        p.sex as sex,
        p.birthYear as birthYear,
        p.deathYear as deathYear,
        p.isLiving as isLiving,
        p.photoUrl as photoUrl,
        p.birthPlace as birthPlace,
        p.originCountry as originCountry,
        COALESCE(bp.country, '') as birthCountry,
        COALESCE(dp.country, '') as deathCountry,
        [s IN spouses | s.id] as spouseIds,
        [par IN parents | par.id] as parentIds,
        [c IN children | c.id] as childIds,
        siblingCount,
        size(children) as childrenCount,
        totalChildrenCount as childrenCountTotal,
        (totalParentsCount > 0) as hasParents,
        (totalChildrenCount > 0) as hasChildren
    `;

  if (rootPersonId && viewMode === 'ancestors') {
    query = `
      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(root:Person {id: $rootPersonId})

      // Get ancestors
      OPTIONAL MATCH (root)-[:CHILD_OF*1..${maxGenerations}]->(ancestor)
      WHERE (t)-[:CONTAINS]->(ancestor)
      ${branchFilter ? 'AND toLower(ancestor.surname) CONTAINS toLower($branchFilter)' : ''}
      WITH t, root, coalesce(collect(DISTINCT ancestor), []) as ancestors

      // Get root's children (keep all variables stable)
      OPTIONAL MATCH (root)-[:PARENT_OF]->(child)
      WHERE (t)-[:CONTAINS]->(child)
      WITH t, root, ancestors, coalesce(collect(DISTINCT child), []) as children

      // Get root's spouse
      OPTIONAL MATCH (root)-[:SPOUSE_OF]-(rootSpouse)
      WHERE (t)-[:CONTAINS]->(rootSpouse)
      WITH t, root, ancestors, children, coalesce(collect(DISTINCT rootSpouse), []) as rootSpouses

      // NOW combine into basePeople (all are stable lists)
      WITH t, root, [root] + ancestors + children + rootSpouses as basePeople

      // Get root's siblings and their spouses only
      OPTIONAL MATCH (root)-[:CHILD_OF]->(rootParent)<-[:CHILD_OF]-(rootSibling)
      WHERE rootSibling <> root AND (t)-[:CONTAINS]->(rootSibling)
      OPTIONAL MATCH (rootSibling)-[:SPOUSE_OF]-(rootSiblingSpouse)
      WHERE (t)-[:CONTAINS]->(rootSiblingSpouse)
      WITH t, basePeople, collect(DISTINCT rootSibling) as rootSiblings, collect(DISTINCT rootSiblingSpouse) as rootSiblingSpouses
      WITH t, basePeople + rootSiblings + rootSiblingSpouses as people
      ${commonFragment}
    `;
    params.rootPersonId = rootPersonId;
    if (branchFilter) params.branchFilter = branchFilter;
  } else if (rootPersonId && viewMode === 'descendants') {
    query = `
      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(root:Person {id: $rootPersonId})
      MATCH path = (root)-[:PARENT_OF*0..${maxGenerations}]->(descendant)
      WHERE (t)-[:CONTAINS]->(descendant)
      ${branchFilter ? 'AND toLower(descendant.surname) CONTAINS toLower($branchFilter)' : ''}

      WITH t, collect(DISTINCT descendant) as basePeople
      WITH t, basePeople
      UNWIND basePeople as p
      OPTIONAL MATCH (p)-[:SPOUSE_OF]-(sp)
      WHERE (t)-[:CONTAINS]->(sp)
      WITH t, collect(DISTINCT p) as basePeople, collect(DISTINCT sp) as spouses
      WITH t, basePeople + spouses as people
      ${commonFragment}
    `;
    params.rootPersonId = rootPersonId;
    if (branchFilter) params.branchFilter = branchFilter;
  } else {
    // Full tree (all people in tree)
    query = `
      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
      ${branchFilter ? 'WHERE toLower(p.surname) CONTAINS toLower($branchFilter)' : ''}
      WITH t, collect(DISTINCT p) as people
      ${commonFragment}
    `;
    if (branchFilter) params.branchFilter = branchFilter;
  }

  const results = await executeQuery<{
    id: string;
    name: string;
    sex: string;
    birthYear: number | null;
    deathYear: number | null;
    isLiving: boolean;
    photoUrl?: string | null;
    birthPlace?: string | null;
    originCountry?: string | null;
    birthCountry?: string | null;
    deathCountry?: string | null;
    spouseIds?: string[];
    childIds?: string[];
    parentIds?: string[];
    siblingCount?: number;
    childrenCount?: number;
    childrenCountTotal?: number;
    hasParents?: boolean;
    hasChildren?: boolean;
  }>(query, params);

  const nodes: TreeGraphNode[] = [];
  const edges: TreeGraphEdge[] = [];
  const seenEdges = new Set<string>();

  const personMap = new Map<
    string,
    {
      spouseIds: string[];
      parentIds: string[];
      childIds: string[];
    }
  >();

  for (const row of results) {
    const spouseIds = row.spouseIds ?? [];
    const parentIds = row.parentIds ?? [];
    const childIds = row.childIds ?? [];

    nodes.push({
      id: row.id,
      type: 'person',
      name: row.name,
      sex: row.sex as 'M' | 'F' | 'U',
      birthYear: row.birthYear ?? undefined,
      deathYear: row.deathYear ?? undefined,
      isLiving: row.isLiving,
      photoUrl: row.photoUrl ?? undefined,
      birthPlace: row.birthPlace ?? undefined,
      originCountry: row.originCountry ?? undefined,
      birthCountry: row.birthCountry ?? undefined,
      deathCountry: row.deathCountry ?? undefined,
      siblingCount:
        row.siblingCount && row.siblingCount > 0 ? row.siblingCount : undefined,
      childrenCount:
        row.childrenCount && row.childrenCount > 0
          ? row.childrenCount
          : childIds.length > 0
            ? childIds.length
            : undefined,
      childrenCountTotal:
        row.childrenCountTotal && row.childrenCountTotal > 0
          ? row.childrenCountTotal
          : undefined,
      hasParents: row.hasParents,
      hasChildren: row.hasChildren,
      parentIds: parentIds.length > 0 ? parentIds : undefined,
      childIds: childIds.length > 0 ? childIds : undefined,
      partnerIds: spouseIds.length > 0 ? spouseIds : undefined,
    });

    personMap.set(row.id, {
      spouseIds,
      parentIds,
      childIds,
    });
  }

  // Assign generation levels relative to root (if provided)
  if (rootPersonId) {
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const rootNode = nodeById.get(rootPersonId);
    if (rootNode) {
      rootNode.generation = 0;
      const queue: string[] = [rootPersonId];
      const visited = new Set<string>([rootPersonId]);
      while (queue.length > 0) {
        const currentId = queue.shift()!;
        const currentNode = nodeById.get(currentId);
        const rel = personMap.get(currentId);
        if (!currentNode || !rel) continue;
        const currentGen = currentNode.generation ?? 0;

        for (const parentId of rel.parentIds) {
          const parentNode = nodeById.get(parentId);
          if (parentNode && !visited.has(parentId)) {
            parentNode.generation = currentGen - 1;
            visited.add(parentId);
            queue.push(parentId);
          }
        }

        for (const childId of rel.childIds) {
          const childNode = nodeById.get(childId);
          if (childNode && !visited.has(childId)) {
            childNode.generation = currentGen + 1;
            visited.add(childId);
            queue.push(childId);
          }
        }
      }
    }
  }

  // Build family nodes based on parent sets (two parents only) and spouse pairs
  const familyMap = new Map<
    string,
    {
      id: string;
      partnerIds: string[];
      childIds: Set<string>;
      generations: Set<number>;
    }
  >();
  const pendingSingleParentEdges: Array<{ parentId: string; childId: string }> =
    [];
  const partneredPeople = new Set<string>();
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  // Families inferred from child parent sets (only when two parents are known)
  for (const [childId, rel] of personMap.entries()) {
    const parentsInGraph = rel.parentIds.filter((p) => personMap.has(p));
    if (parentsInGraph.length === 2) {
      const familyKey = parentsInGraph.sort().join('-');
      if (!familyMap.has(familyKey)) {
        familyMap.set(familyKey, {
          id: `family-${familyKey}`,
          partnerIds: parentsInGraph,
          childIds: new Set<string>(),
          generations: new Set<number>(),
        });
      }
      familyMap.get(familyKey)!.childIds.add(childId);
    } else if (parentsInGraph.length === 1) {
      pendingSingleParentEdges.push({
        parentId: parentsInGraph[0],
        childId,
      });
    }
  }

  // Families inferred from spouse pairs (even if no children)
  for (const [personId, rel] of personMap.entries()) {
    for (const spouseId of rel.spouseIds) {
      if (!personMap.has(spouseId)) continue;
      const familyKey = [personId, spouseId].sort().join('-');
      if (!familyMap.has(familyKey)) {
        familyMap.set(familyKey, {
          id: `family-${familyKey}`,
          partnerIds: [personId, spouseId].sort(),
          childIds: new Set<string>(),
          generations: new Set<number>(),
        });
      }
    }
  }

  // Track partnered people to avoid duplicate person nodes in layout
  for (const family of familyMap.values()) {
    if (family.partnerIds.length === 2) {
      partneredPeople.add(family.partnerIds[0]);
      partneredPeople.add(family.partnerIds[1]);
    }
  }

  const personToFamilyId = new Map<string, string>();
  for (const family of familyMap.values()) {
    if (family.partnerIds.length === 2) {
      personToFamilyId.set(family.partnerIds[0], family.id);
      personToFamilyId.set(family.partnerIds[1], family.id);
    }
  }

  // Mark partnered people as hidden in layout (family nodes render them)
  for (const node of nodes) {
    if (node.type === 'person' && partneredPeople.has(node.id)) {
      node.layoutHidden = true;
    }
  }

  // Add family nodes and edges
  for (const family of familyMap.values()) {
    for (const partnerId of family.partnerIds) {
      const partnerNode = nodeById.get(partnerId);
      if (partnerNode && typeof partnerNode.generation === 'number') {
        family.generations.add(partnerNode.generation);
      }
    }

    for (const childId of family.childIds) {
      const childNode = nodeById.get(childId);
      if (childNode && typeof childNode.generation === 'number') {
        family.generations.add(childNode.generation - 1);
      }
    }

    const familyGeneration =
      family.generations.size > 0
        ? Math.max(...Array.from(family.generations.values()))
        : undefined;

    nodes.push({
      id: family.id,
      type: 'family',
      name: 'Family',
      sex: 'U',
      isLiving: false,
      partnerIds: family.partnerIds,
      childIds: Array.from(family.childIds),
      generation: familyGeneration,
    });

    // Partner edges
    for (const partnerId of family.partnerIds) {
      const edgeKey = `partner-${partnerId}-${family.id}`;
      if (!seenEdges.has(edgeKey)) {
        seenEdges.add(edgeKey);
        edges.push({
          source: partnerId,
          target: family.id,
          type: 'partner',
        });
      }
    }

    // Parent-child edges from family to child (or child family if partnered)
    for (const childId of family.childIds) {
      const childTarget = personToFamilyId.get(childId) || childId;
      const edgeKey = `family-${family.id}-${childTarget}`;
      if (!seenEdges.has(edgeKey)) {
        seenEdges.add(edgeKey);
        edges.push({
          source: family.id,
          target: childTarget,
          type: 'parent-child',
        });
      }
    }
  }

  // Add single-parent edges after family map exists (respect family nodes)
  for (const { parentId, childId } of pendingSingleParentEdges) {
    const sourceId = personToFamilyId.get(parentId) || parentId;
    const targetId = personToFamilyId.get(childId) || childId;
    const edgeKey = `single-parent-${sourceId}-${targetId}`;
    if (!seenEdges.has(edgeKey)) {
      seenEdges.add(edgeKey);
      edges.push({
        source: sourceId,
        target: targetId,
        type: 'parent-child',
      });
    }
  }

  return { nodes, edges };
}

/**
 * Cached whole-tree graph — identical for every user and rebuildable. Keyed by
 * all query params (treeId, root person, view mode, generations, branch).
 */
export const getTreeGraphData = cacheGraphRead(fetchTreeGraphData, [
  'tree-graph',
]);

/**
 * Get all people in a tree
 */
export async function getAllPeopleInTree(
  treeId: string,
): Promise<Neo4jPerson[]> {
  const results = await executeQuery<{ person: Neo4jPerson }>(
    `
    MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
    RETURN p as person
    ORDER BY p.surname, p.givenName
    `,
    { treeId },
  );

  return results.map((r) => r.person);
}

/**
 * Get tree statistics
 */
export async function getTreeStats(treeId: string): Promise<{
  personCount: number;
  livingCount: number;
  oldestBirthYear: number | null;
  newestBirthYear: number | null;
  surnameCount: number;
  placeCount: number;
  countryCount: number;
  recordCount: number;
}> {
  const results = await executeQuery<{
    personCount: number;
    livingCount: number;
    oldestBirthYear: number | null;
    newestBirthYear: number | null;
    surnameCount: number;
    placeCount: number;
    countryCount: number;
    recordCount: number;
  }>(
    `
    MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
    WITH t,
      count(p) as personCount,
      count(CASE WHEN p.isLiving THEN 1 END) as livingCount,
      min(p.birthYear) as oldestBirthYear,
      max(p.birthYear) as newestBirthYear,
      count(DISTINCT p.surname) as surnameCount
    OPTIONAL MATCH (t)-[:CONTAINS]->(p2:Person)-[:BORN_IN|DIED_IN|LIVED_IN]->(pl:Place)
    WITH personCount, livingCount, oldestBirthYear, newestBirthYear, surnameCount, t,
      count(DISTINCT pl) as placeCount,
      count(DISTINCT pl.country) as countryCount
    OPTIONAL MATCH (t)-[:CONTAINS]->(p3:Person)-[:EVIDENCED_BY]->(r:Record)
    RETURN personCount, livingCount, oldestBirthYear, newestBirthYear, surnameCount,
           placeCount, countryCount, count(DISTINCT r) as recordCount
    `,
    { treeId },
  );

  return (
    results[0] || {
      personCount: 0,
      livingCount: 0,
      oldestBirthYear: null,
      newestBirthYear: null,
      surnameCount: 0,
      placeCount: 0,
      countryCount: 0,
      recordCount: 0,
    }
  );
}

/**
 * Create a new tree
 */

/**
 * Update a tree
 */

/**
 * Delete a tree and all its contents
 */

/**
 * Check if user has access to tree
 */
export async function checkTreeAccess(
  userId: string,
  treeId: string,
): Promise<{ hasAccess: boolean; role: string | null }> {
  const results = await executeQuery<{ role: string }>(
    `
    MATCH (u:User {id: $userId})-[r:OWNS|COLLABORATES_ON]->(t:Tree {id: $treeId})
    RETURN CASE WHEN type(r) = 'OWNS' THEN 'owner' ELSE r.role END as role
    `,
    { userId, treeId },
  );

  if (results.length === 0) {
    // Check if tree is public
    const publicCheck = await executeQuery<{ isPublic: boolean }>(
      `
      MATCH (t:Tree {id: $treeId})
      RETURN t.isPublic as isPublic
      `,
      { treeId },
    );

    if (publicCheck.length > 0 && publicCheck[0].isPublic) {
      return { hasAccess: true, role: 'viewer' };
    }

    return { hasAccess: false, role: null };
  }

  return { hasAccess: true, role: results[0].role };
}
