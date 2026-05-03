import { executeQuery, executeWrite } from '../client';
import type { Neo4jPerson, PersonWithFamily, TreeGraphNode, TreeGraphEdge } from '../types';

/**
 * Get a person by ID with their immediate family
 */
export async function getPersonById(personId: string, treeId: string): Promise<PersonWithFamily | null> {
  const results = await executeQuery<{ person: PersonWithFamily }>(
    `
    MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person {id: $personId})

    OPTIONAL MATCH (p)-[:CHILD_OF]->(father:Person {sex: 'M'})
    OPTIONAL MATCH (p)-[:CHILD_OF]->(mother:Person {sex: 'F'})
    OPTIONAL MATCH (p)-[spouseRel:SPOUSE_OF]-(spouse:Person)
    OPTIONAL MATCH (p)-[:PARENT_OF]->(child:Person)
    OPTIONAL MATCH (p)-[:CHILD_OF]->(parent:Person)-[:PARENT_OF]->(sibling:Person)
    WHERE sibling.id <> p.id

    RETURN p as person,
      CASE WHEN father IS NOT NULL THEN {id: father.id, name: father.fullName, birthYear: father.birthYear} ELSE null END as father,
      CASE WHEN mother IS NOT NULL THEN {id: mother.id, name: mother.fullName, birthYear: mother.birthYear} ELSE null END as mother,
      collect(DISTINCT CASE WHEN spouse IS NOT NULL THEN {id: spouse.id, name: spouse.fullName, birthYear: spouse.birthYear, marriageYear: spouseRel.marriageYear} ELSE null END) as spouses,
      collect(DISTINCT CASE WHEN child IS NOT NULL THEN {id: child.id, name: child.fullName, birthYear: child.birthYear} ELSE null END) as children,
      collect(DISTINCT CASE WHEN sibling IS NOT NULL THEN {id: sibling.id, name: sibling.fullName, birthYear: sibling.birthYear} ELSE null END) as siblings
    `,
    { personId, treeId }
  );

  if (results.length === 0) return null;

  const row = results[0] as unknown as {
    person: Neo4jPerson;
    father: { id: string; name: string; birthYear?: number } | null;
    mother: { id: string; name: string; birthYear?: number } | null;
    spouses: Array<{ id: string; name: string; birthYear?: number; marriageYear?: number } | null>;
    children: Array<{ id: string; name: string; birthYear?: number } | null>;
    siblings: Array<{ id: string; name: string; birthYear?: number } | null>;
  };

  const byBirthYear = (
    a: { birthYear?: number },
    b: { birthYear?: number }
  ) => (a.birthYear ?? 9999) - (b.birthYear ?? 9999);

  return {
    ...row.person,
    father: row.father || undefined,
    mother: row.mother || undefined,
    spouses: row.spouses.filter((s): s is NonNullable<typeof s> => s !== null).sort(byBirthYear),
    children: row.children.filter((c): c is NonNullable<typeof c> => c !== null).sort(byBirthYear),
    siblings: row.siblings.filter((s): s is NonNullable<typeof s> => s !== null).sort(byBirthYear),
  };
}

/**
 * Get ancestors up to N generations
 */
export async function getAncestors(
  personId: string,
  treeId: string,
  maxGenerations: number = 10
): Promise<{ nodes: TreeGraphNode[]; edges: TreeGraphEdge[] }> {
  const results = await executeQuery<{
    id: string;
    name: string;
    sex: string;
    birthYear: number | null;
    deathYear: number | null;
    isLiving: boolean;
    generation: number;
    parentId: string | null;
    parentType: string | null;
  }>(
    `
    MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(root:Person {id: $personId})
    MATCH path = (root)-[:CHILD_OF*0..${maxGenerations}]->(ancestor)

    WITH ancestor, min(length(path)) as generation

    OPTIONAL MATCH (ancestor)-[:CHILD_OF]->(parent)

    RETURN DISTINCT
      ancestor.id as id,
      ancestor.fullName as name,
      ancestor.sex as sex,
      ancestor.birthYear as birthYear,
      ancestor.deathYear as deathYear,
      ancestor.isLiving as isLiving,
      generation,
      parent.id as parentId,
      CASE WHEN parent.sex = 'M' THEN 'father' ELSE 'mother' END as parentType
    ORDER BY generation, ancestor.birthYear
    `,
    { personId, treeId }
  );

  const nodesMap = new Map<string, TreeGraphNode>();
  const edges: TreeGraphEdge[] = [];

  for (const row of results) {
    if (!nodesMap.has(row.id)) {
      nodesMap.set(row.id, {
        id: row.id,
        name: row.name,
        sex: row.sex as 'M' | 'F' | 'U',
        birthYear: row.birthYear ?? undefined,
        deathYear: row.deathYear ?? undefined,
        isLiving: row.isLiving,
        generation: row.generation,
      });
    }

    if (row.parentId) {
      edges.push({
        source: row.parentId,
        target: row.id,
        type: 'parent-child',
      });
    }
  }

  // Add spouse relationships
  const personIds = Array.from(nodesMap.keys());
  if (personIds.length > 0) {
    const spouseResults = await executeQuery<{ person1: string; person2: string }>(
      `
      MATCH (p1:Person)-[:SPOUSE_OF]-(p2:Person)
      WHERE p1.id IN $personIds AND p2.id IN $personIds AND p1.id < p2.id
      RETURN p1.id as person1, p2.id as person2
      `,
      { personIds }
    );

    for (const row of spouseResults) {
      edges.push({
        source: row.person1,
        target: row.person2,
        type: 'spouse',
      });
    }
  }

  return {
    nodes: Array.from(nodesMap.values()),
    edges,
  };
}

/**
 * Get descendants up to N generations
 */
export async function getDescendants(
  personId: string,
  treeId: string,
  maxGenerations: number = 10
): Promise<{ nodes: TreeGraphNode[]; edges: TreeGraphEdge[] }> {
  const results = await executeQuery<{
    id: string;
    name: string;
    sex: string;
    birthYear: number | null;
    deathYear: number | null;
    isLiving: boolean;
    generation: number;
    childId: string | null;
  }>(
    `
    MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(root:Person {id: $personId})
    MATCH path = (root)-[:PARENT_OF*0..${maxGenerations}]->(descendant)

    WITH descendant, min(length(path)) as generation

    OPTIONAL MATCH (descendant)-[:PARENT_OF]->(child)

    RETURN DISTINCT
      descendant.id as id,
      descendant.fullName as name,
      descendant.sex as sex,
      descendant.birthYear as birthYear,
      descendant.deathYear as deathYear,
      descendant.isLiving as isLiving,
      generation,
      child.id as childId
    ORDER BY generation, descendant.birthYear
    `,
    { personId, treeId }
  );

  const nodesMap = new Map<string, TreeGraphNode>();
  const edges: TreeGraphEdge[] = [];

  for (const row of results) {
    if (!nodesMap.has(row.id)) {
      nodesMap.set(row.id, {
        id: row.id,
        name: row.name,
        sex: row.sex as 'M' | 'F' | 'U',
        birthYear: row.birthYear ?? undefined,
        deathYear: row.deathYear ?? undefined,
        isLiving: row.isLiving,
        generation: row.generation,
      });
    }

    if (row.childId) {
      edges.push({
        source: row.id,
        target: row.childId,
        type: 'parent-child',
      });
    }
  }

  // Add spouse relationships
  const personIds = Array.from(nodesMap.keys());
  if (personIds.length > 0) {
    const spouseResults = await executeQuery<{ person1: string; person2: string }>(
      `
      MATCH (p1:Person)-[:SPOUSE_OF]-(p2:Person)
      WHERE p1.id IN $personIds AND p2.id IN $personIds AND p1.id < p2.id
      RETURN p1.id as person1, p2.id as person2
      `,
      { personIds }
    );

    for (const row of spouseResults) {
      edges.push({
        source: row.person1,
        target: row.person2,
        type: 'spouse',
      });
    }
  }

  return {
    nodes: Array.from(nodesMap.values()),
    edges,
  };
}

/**
 * Search people by name
 */
export async function searchPeople(
  query: string,
  treeId: string,
  limit: number = 20
): Promise<Neo4jPerson[]> {
  const queryLower = query.trim().toLowerCase();
  const terms = queryLower.split(/\s+/).filter(Boolean);
  const given = terms[0] || '';
  const surname = terms.length > 1 ? terms[terms.length - 1] : '';
  const singleToken = terms.length === 1;
  const givenVariants = expandGivenNameVariants(given);
  const givenInitial = given ? given[0] : '';
  const surnameInitial = surname ? surname[0] : '';
  const candidateLimit = Math.max(limit * 6, 120);

  const results = await executeQuery<{ person: Neo4jPerson }>(
    `
    MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
    WHERE (
      toLower(p.fullName) CONTAINS $queryLower
      OR toLower(p.surname) CONTAINS $queryLower
      OR toLower(p.givenName) CONTAINS $queryLower
      OR (p.nickname IS NOT NULL AND toLower(p.nickname) CONTAINS $queryLower)
      OR (size($givenVariants) > 0 AND any(term IN $givenVariants WHERE toLower(p.givenName) CONTAINS term))
      OR (size($givenVariants) > 0 AND p.nickname IS NOT NULL AND any(term IN $givenVariants WHERE toLower(p.nickname) CONTAINS term))
      OR ($surname <> '' AND toLower(p.surname) CONTAINS $surname)
      OR ($singleToken AND toLower(p.surname) CONTAINS $given)
      OR ($givenInitial <> '' AND left(toLower(p.givenName), 1) = $givenInitial)
      OR ($surnameInitial <> '' AND left(toLower(p.surname), 1) = $surnameInitial)
      OR ($singleToken AND $givenInitial <> '' AND left(toLower(p.surname), 1) = $givenInitial)
    )
    RETURN p as person
    ORDER BY
      CASE WHEN toLower(p.fullName) = $queryLower THEN 0
           WHEN toLower(p.fullName) STARTS WITH $queryLower THEN 1
           WHEN toLower(p.fullName) CONTAINS $queryLower THEN 2
           WHEN $surname <> '' AND toLower(p.surname) = $surname THEN 3
           WHEN toLower(p.givenName) CONTAINS $given THEN 4
           ELSE 5 END
    LIMIT toInteger($candidateLimit)
    `,
    { queryLower, treeId, given, surname, givenVariants, givenInitial, surnameInitial, candidateLimit, singleToken }
  );

  const queryNorm = normalizeName(queryLower);
  const surnameNorm = normalizeName(singleToken ? given : surname);
  const givenNorm = normalizeName(given);

  const scored = results.map((r) => {
    const person = r.person;
    const fullName = normalizeName(person.fullName || '');
    const givenName = normalizeName(person.givenName || '');
    const surnameName = normalizeName(person.surname || '');
    const nickname = normalizeName(person.nickname || '');

    let score = 0;

    if (fullName === queryNorm && queryNorm) score = 100;
    else if (fullName.startsWith(queryNorm) && queryNorm) score = 90;
    else if (surnameNorm && surnameName === surnameNorm && givenVariants.includes(givenName)) score = 85;
    else if (givenVariants.includes(givenName) && givenName) score = 80;
    else if (nickname && givenVariants.includes(nickname)) score = 75;
    else if (surnameNorm && surnameName === surnameNorm) score = 70;
    else if (fullName.includes(queryNorm) && queryNorm) score = 60;
    else if (givenNorm && givenName.includes(givenNorm)) score = 50;
    else if (surnameNorm && surnameName.includes(surnameNorm)) score = 45;

    // Fuzzy fallback (small edit distance) for given/surname tokens
    if (score < 60) {
      const fuzzyGiven = fuzzyScore(givenNorm, givenName);
      const fuzzySurname = fuzzyScore(surnameNorm, surnameName);
      const fuzzyFull = fuzzyScore(queryNorm, fullName);

      if (fuzzyGiven > 0 && fuzzySurname > 0) score = Math.max(score, 55 + fuzzyGiven + fuzzySurname);
      else if (fuzzyGiven > 0) score = Math.max(score, 40 + fuzzyGiven);
      else if (fuzzySurname > 0) score = Math.max(score, 38 + fuzzySurname);
      else if (fuzzyFull > 0) score = Math.max(score, 30 + fuzzyFull);
    }

    return { person, score };
  });

  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => (b.score - a.score) || a.person.fullName.localeCompare(b.person.fullName))
    .slice(0, limit)
    .map((item) => item.person);
}

/**
 * Search people by place name (birth, death, marriage, or residence)
 */
export async function searchByPlace(
  query: string,
  treeId: string,
  limit: number = 20
): Promise<Neo4jPerson[]> {
  const results = await executeQuery<{ person: Neo4jPerson }>(
    `
    MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
    MATCH (p)-[:BORN_IN|DIED_IN|MARRIED_AT|LIVED_IN]->(pl:Place)
    WHERE toLower(pl.name) CONTAINS $queryLower
    RETURN DISTINCT p as person
    LIMIT toInteger($limit)
    `,
    { treeId, queryLower: query.toLowerCase().trim(), limit }
  );

  return results.map(r => r.person);
}

/**
 * Search people by occupation title
 */
export async function searchByOccupation(
  query: string,
  treeId: string,
  limit: number = 20
): Promise<Neo4jPerson[]> {
  const results = await executeQuery<{ person: Neo4jPerson }>(
    `
    MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)-[:HAD_OCCUPATION]->(o:Occupation)
    WHERE toLower(o.title) CONTAINS $queryLower
    RETURN DISTINCT p as person
    LIMIT toInteger($limit)
    `,
    { treeId, queryLower: query.toLowerCase().trim(), limit }
  );

  return results.map(r => r.person);
}

/**
 * Search people by markdownContent (full-text search on biography, sources, research notes)
 */
export async function searchByContent(
  query: string,
  treeId: string,
  limit: number = 10
): Promise<Neo4jPerson[]> {
  const results = await executeQuery<{ person: Neo4jPerson }>(
    `
    MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
    WHERE p.markdownContent IS NOT NULL AND toLower(p.markdownContent) CONTAINS $queryLower
    RETURN p as person
    LIMIT toInteger($limit)
    `,
    { treeId, queryLower: query.toLowerCase().trim(), limit }
  );

  return results.map(r => r.person);
}

export async function getPeopleBySurname(
  surname: string,
  treeId: string,
  limit: number = 20,
  excludeId?: string
): Promise<Neo4jPerson[]> {
  const results = await executeQuery<{ person: Neo4jPerson }>(
    `
    MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
    WHERE toLower(p.surname) = toLower($surname)
    ${excludeId ? 'AND p.id <> $excludeId' : ''}
    RETURN p as person
    ORDER BY CASE WHEN p.birthYear IS NULL THEN 1 ELSE 0 END, p.birthYear
    LIMIT toInteger($limit)
    `,
    { surname, treeId, limit, excludeId }
  );

  return results.map((result) => result.person);
}

const NICKNAME_MAP: Record<string, string[]> = {
  'bill': ['william', 'will', 'billy'],
  'will': ['william', 'bill', 'billy'],
  'billy': ['william', 'bill', 'will'],
  'bob': ['robert', 'rob', 'bobby'],
  'rob': ['robert', 'bob', 'bobby'],
  'bobby': ['robert', 'bob', 'rob'],
  'liz': ['elizabeth', 'beth', 'lizzie', 'betty'],
  'beth': ['elizabeth', 'liz', 'betty'],
  'betty': ['elizabeth', 'beth', 'liz'],
  'lizzie': ['elizabeth', 'liz', 'beth'],
  'kate': ['katherine', 'catherine', 'kathy', 'katy'],
  'kathy': ['katherine', 'catherine', 'kate', 'katy'],
  'katy': ['katherine', 'catherine', 'kate', 'kathy'],
  'jim': ['james', 'jimmy'],
  'jimmy': ['james', 'jim'],
  'jack': ['john', 'jon'],
  'johnny': ['john', 'jon'],
  'maggie': ['margaret', 'meg', 'peg', 'peggy'],
  'meg': ['margaret', 'maggie', 'peggy'],
  'peggy': ['margaret', 'meg', 'maggie'],
  'nancy': ['ann', 'anne', 'anna'],
  'ann': ['anne', 'anna', 'nancy'],
  'ned': ['edward', 'ed'],
  'ed': ['edward', 'eddie', 'ned'],
  'eddie': ['edward', 'ed', 'ned'],
  'frank': ['francis'],
  'harry': ['henry'],
  'hank': ['henry'],
  'sue': ['susan', 'suzanne', 'susannah'],
  'susan': ['sue', 'suzanne', 'susannah'],
  'tom': ['thomas', 'tommy'],
  'tommy': ['thomas', 'tom'],
};

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, '');
}

function fuzzyScore(query: string, target: string): number {
  if (!query || !target) return 0;
  const maxDistance = query.length <= 4 ? 1 : 2;
  const distance = levenshtein(query, target);
  if (distance > maxDistance) return 0;
  return (maxDistance - distance + 1) * 4;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp = Array.from({ length: rows }, () => new Array<number>(cols));

  for (let i = 0; i < rows; i += 1) dp[i][0] = i;
  for (let j = 0; j < cols; j += 1) dp[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[rows - 1][cols - 1];
}

function expandGivenNameVariants(given: string): string[] {
  const normalized = given.trim().toLowerCase();
  if (!normalized) return [];
  const variants = new Set<string>([normalized]);
  const mapped = NICKNAME_MAP[normalized];
  if (mapped) {
    for (const name of mapped) variants.add(name);
  }
  for (const [nick, fulls] of Object.entries(NICKNAME_MAP)) {
    if (fulls.includes(normalized)) variants.add(nick);
  }
  return Array.from(variants);
}

/**
 * Find relationship path between two people
 */
export async function findRelationshipPath(
  person1Id: string,
  person2Id: string,
  treeId: string
): Promise<{
  pathNodes: Array<{ id: string; name: string; sex: string; birthYear?: number }>;
  relationshipTypes: string[];
  distance: number;
} | null> {
  const results = await executeQuery<{
    pathNodes: Array<{ id: string; name: string; sex: string; birthYear?: number }>;
    relationshipTypes: string[];
    distance: number;
  }>(
    `
    MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p1:Person {id: $person1Id})
    MATCH (t)-[:CONTAINS]->(p2:Person {id: $person2Id})

    MATCH path = shortestPath((p1)-[:CHILD_OF|PARENT_OF|SPOUSE_OF|SIBLING_OF*]-(p2))

    // Compute effective relationship types accounting for traversal direction.
    // When an edge is traversed backwards, we flip the type:
    //   CHILD_OF backwards = PARENT_OF, PARENT_OF backwards = CHILD_OF
    WITH path, nodes(path) as ns, relationships(path) as rels
    RETURN
      [node IN ns | {
        id: node.id,
        name: node.fullName,
        sex: node.sex,
        birthYear: node.birthYear
      }] as pathNodes,
      [i IN range(0, size(rels)-1) |
        CASE
          // Forward traversal: startNode matches the "from" node in the path
          WHEN startNode(rels[i]) = ns[i] THEN type(rels[i])
          // Backward traversal: flip CHILD_OF <-> PARENT_OF
          WHEN type(rels[i]) = 'CHILD_OF' THEN 'PARENT_OF'
          WHEN type(rels[i]) = 'PARENT_OF' THEN 'CHILD_OF'
          // SPOUSE_OF and SIBLING_OF are symmetric, no flip needed
          ELSE type(rels[i])
        END
      ] as relationshipTypes,
      length(path) as distance
    `,
    { person1Id, person2Id, treeId }
  );

  if (results.length === 0) return null;
  return results[0];
}

/**
 * Create a new person
 */
export async function createPerson(
  person: Omit<Neo4jPerson, 'createdAt' | 'updatedAt'>,
  treeId: string
): Promise<Neo4jPerson> {
  const results = await executeWrite<{ person: Neo4jPerson }>(
    `
    MATCH (t:Tree {id: $treeId})
    CREATE (p:Person {
      id: $id,
      fullName: $fullName,
      givenName: $givenName,
      surname: $surname,
      suffix: $suffix,
      nickname: $nickname,
      sex: $sex,
      birthDate: $birthDate,
      birthYear: $birthYear,
      birthPlace: $birthPlace,
      deathDate: $deathDate,
      deathYear: $deathYear,
      deathPlace: $deathPlace,
      isLiving: $isLiving,
      verificationStatus: $verificationStatus,
      gedcomId: $gedcomId,
      wikitreeId: $wikitreeId,
      findagraveId: $findagraveId,
      createdAt: datetime(),
      updatedAt: datetime()
    })
    CREATE (t)-[:CONTAINS]->(p)
    RETURN p as person
    `,
    { ...person, treeId }
  );

  return results[0].person;
}

/**
 * Update a person
 */
export async function updatePerson(
  personId: string,
  updates: Partial<Neo4jPerson>,
  treeId: string
): Promise<Neo4jPerson | null> {
  const setClause = Object.keys(updates)
    .filter((key) => key !== 'id' && key !== 'createdAt')
    .map((key) => `p.${key} = $${key}`)
    .join(', ');

  if (!setClause) return null;

  const results = await executeWrite<{ person: Neo4jPerson }>(
    `
    MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person {id: $personId})
    SET ${setClause}, p.updatedAt = datetime()
    RETURN p as person
    `,
    { ...updates, personId, treeId }
  );

  return results.length > 0 ? results[0].person : null;
}

/**
 * Add parent-child relationship
 */
export async function addParentChildRelationship(
  parentId: string,
  childId: string,
  treeId: string,
  type: 'biological' | 'adoptive' | 'step' = 'biological'
): Promise<boolean> {
  const results = await executeWrite(
    `
    MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(parent:Person {id: $parentId})
    MATCH (t)-[:CONTAINS]->(child:Person {id: $childId})
    MERGE (parent)-[r:PARENT_OF {type: $type}]->(child)
    MERGE (child)-[:CHILD_OF {type: $type}]->(parent)
    RETURN count(*) as created
    `,
    { parentId, childId, treeId, type }
  );

  return results.length > 0;
}

/**
 * Add spouse relationship
 */
export async function addSpouseRelationship(
  person1Id: string,
  person2Id: string,
  treeId: string,
  marriageYear?: number,
  marriageDate?: string
): Promise<boolean> {
  const results = await executeWrite(
    `
    MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p1:Person {id: $person1Id})
    MATCH (t)-[:CONTAINS]->(p2:Person {id: $person2Id})
    MERGE (p1)-[r:SPOUSE_OF]->(p2)
    SET r.marriageYear = $marriageYear, r.marriageDate = $marriageDate
    RETURN count(*) as created
    `,
    { person1Id, person2Id, treeId, marriageYear, marriageDate }
  );

  return results.length > 0;
}
