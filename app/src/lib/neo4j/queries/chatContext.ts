import { executeQuery } from '../client';

// Knowledge base entry type (populated from Neo4j)
export interface KnowledgeBaseEntry {
  id: string;
  name: string;
  surname: string;
  birthYear: number | null;
  deathYear: number | null;
  birthPlace: string | null;
  deathPlace: string | null;
  biography: string | null;
  marriagePlace: string | null;
  marriageYear: number | null;
  occupations: string[];
  lifeEvents: Array<{ event: string; year: number | null }>;
}

interface Neo4jPerson {
  id: string;
  fullName: string;
  surname: string;
  birthYear: number | null;
  deathYear: number | null;
  birthPlace: string | null;
  biography: string | null;
}

/**
 * Get knowledge for specific person IDs from Neo4j
 */
export async function getKnowledgeForPeople(
  personIds: string[],
  treeId: string,
): Promise<Map<string, KnowledgeBaseEntry>> {
  if (personIds.length === 0) return new Map();

  const result = await executeQuery<{
    id: string;
    fullName: string;
    surname: string;
    birthYear: number | null;
    deathYear: number | null;
    birthPlace: string | null;
    deathPlace: string | null;
    biography: string | null;
    marriagePlace: string | null;
    marriageYear: number | null;
    occupations: string[];
    lifeEvents: Array<{ event: string; year: number | null }>;
  }>(
    `
    MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
    WHERE p.id IN $personIds
    OPTIONAL MATCH (p)-[:BORN_IN]->(bp:Place)
    OPTIONAL MATCH (p)-[:DIED_IN]->(dp:Place)
    OPTIONAL MATCH (p)-[mr:MARRIED_AT]->(mp:Place)
    OPTIONAL MATCH (p)-[:HAD_OCCUPATION]->(o:Occupation)
    OPTIONAL MATCH (p)-[:EXPERIENCED]->(le:LifeEvent)
    WITH p, bp, dp, mp, mr,
      collect(DISTINCT o.title) as occupations,
      collect(DISTINCT {event: le.event, year: le.yearInt}) as lifeEvents
    RETURN
      p.id as id, p.fullName as fullName, p.surname as surname,
      p.birthYear as birthYear, p.deathYear as deathYear,
      COALESCE(bp.name, p.birthPlace) as birthPlace,
      COALESCE(dp.name, p.deathPlace) as deathPlace,
      CASE WHEN p.biography IS NOT NULL THEN p.biography
           WHEN p.markdownContent IS NOT NULL THEN left(p.markdownContent, 2000)
           ELSE null END as biography,
      mp.name as marriagePlace,
      mr.marriageYear as marriageYear,
      occupations,
      lifeEvents
    `,
    { treeId, personIds },
  );

  const resultMap = new Map<string, KnowledgeBaseEntry>();
  for (const r of result) {
    resultMap.set(r.id, {
      id: r.id,
      name: r.fullName,
      surname: r.surname || '',
      birthYear: r.birthYear,
      deathYear: r.deathYear,
      birthPlace: r.birthPlace,
      deathPlace: r.deathPlace,
      biography: r.biography,
      marriagePlace: r.marriagePlace,
      marriageYear: r.marriageYear,
      occupations: (r.occupations || []).filter(Boolean),
      lifeEvents: (r.lifeEvents || []).filter((le) => le && le.event),
    });
  }
  return resultMap;
}

/**
 * Keyword search in Neo4j for people with matching name, biography, occupation, or content
 */
export async function searchKnowledgeBase(
  query: string,
  treeId: string,
  topK: number = 5,
): Promise<KnowledgeBaseEntry[]> {
  const safeTopK = Math.max(1, Math.floor(topK));
  const queryLower = query.toLowerCase();
  const queryWords = queryLower
    .split(/\s+/)
    .filter(
      (w) =>
        w.length > 2 &&
        ![
          'the',
          'and',
          'for',
          'are',
          'was',
          'were',
          'what',
          'who',
          'how',
          'when',
          'where',
          'why',
          'about',
          'tell',
          'know',
        ].includes(w),
    );

  if (queryWords.length === 0) return [];

  // Search Neo4j for matches in name, surname, biography, places, occupations, or markdownContent
  const result = await executeQuery<{
    id: string;
    fullName: string;
    surname: string;
    birthYear: number | null;
    deathYear: number | null;
    birthPlace: string | null;
    deathPlace: string | null;
    biography: string | null;
    marriagePlace: string | null;
    marriageYear: number | null;
    occupations: string[];
    lifeEvents: Array<{ event: string; year: number | null }>;
  }>(
    `
    MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
    WHERE toLower(p.fullName) CONTAINS $term
       OR toLower(p.surname) CONTAINS $term
       OR toLower(p.biography) CONTAINS $term
       OR (p.markdownContent IS NOT NULL AND toLower(p.markdownContent) CONTAINS $term)
       OR EXISTS {
         MATCH (p)-[:BORN_IN|DIED_IN|MARRIED_AT|LIVED_IN]->(pl:Place)
         WHERE toLower(pl.name) CONTAINS $term
       }
       OR EXISTS {
         MATCH (p)-[:HAD_OCCUPATION]->(o:Occupation)
         WHERE toLower(o.title) CONTAINS $term
       }
    OPTIONAL MATCH (p)-[:BORN_IN]->(bp:Place)
    OPTIONAL MATCH (p)-[:DIED_IN]->(dp:Place)
    OPTIONAL MATCH (p)-[mr:MARRIED_AT]->(mp:Place)
    OPTIONAL MATCH (p)-[:HAD_OCCUPATION]->(occ:Occupation)
    OPTIONAL MATCH (p)-[:EXPERIENCED]->(le:LifeEvent)
    WITH p, bp, dp, mp, mr,
      collect(DISTINCT occ.title) as occupations,
      collect(DISTINCT {event: le.event, year: le.yearInt}) as lifeEvents
    RETURN
      p.id as id, p.fullName as fullName, p.surname as surname,
      p.birthYear as birthYear, p.deathYear as deathYear,
      COALESCE(bp.name, p.birthPlace) as birthPlace,
      COALESCE(dp.name, p.deathPlace) as deathPlace,
      CASE WHEN p.biography IS NOT NULL THEN p.biography
           WHEN p.markdownContent IS NOT NULL THEN left(p.markdownContent, 2000)
           ELSE null END as biography,
      mp.name as marriagePlace,
      mr.marriageYear as marriageYear,
      occupations,
      lifeEvents
    LIMIT toInteger($topK)
    `,
    { treeId, term: queryWords[0], topK: safeTopK },
  );

  return result.map((r) => ({
    id: r.id,
    name: r.fullName,
    surname: r.surname || '',
    birthYear: r.birthYear,
    deathYear: r.deathYear,
    birthPlace: r.birthPlace,
    deathPlace: r.deathPlace,
    biography: r.biography,
    marriagePlace: r.marriagePlace,
    marriageYear: r.marriageYear,
    occupations: (r.occupations || []).filter(Boolean),
    lifeEvents: (r.lifeEvents || []).filter((le) => le && le.event),
  }));
}

// Build context directly from Neo4j
export async function buildNeo4jContext(
  query: string,
  treeId: string,
  personId?: string,
): Promise<string> {
  let context = `## Family Tree Knowledge Base (from Neo4j)\n\n`;

  // Get overall stats
  const statsResult = await executeQuery<{
    totalPeople: number;
    livingCount: number;
    earliestBirth: number;
    latestBirth: number;
  }>(
    `
    MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
    RETURN
      count(p) as totalPeople,
      count(CASE WHEN p.isLiving = true THEN 1 END) as livingCount,
      min(p.birthYear) as earliestBirth,
      max(p.birthYear) as latestBirth
    `,
    { treeId },
  );

  if (statsResult[0]) {
    const s = statsResult[0];
    context += `### Family Overview\n`;
    context += `- Total people: ${s.totalPeople}\n`;
    context += `- Living: ${s.livingCount}\n`;
    context += `- Records span: ${s.earliestBirth || '?'} - ${s.latestBirth || '?'}\n\n`;
  }

  // If viewing a specific person, get their full context
  if (personId) {
    const personResult = await executeQuery<{
      id: string;
      fullName: string;
      surname: string;
      birthYear: number;
      deathYear: number;
      birthPlace: string;
      deathPlace: string;
      biography: string;
      fatherName: string;
      fatherId: string;
      motherName: string;
      motherId: string;
      occupations: string[];
      lifeEvents: Array<{ event: string; year: number | null }>;
    }>(
      `
      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person {id: $personId})
      OPTIONAL MATCH (p)-[:BORN_IN]->(bp:Place)
      OPTIONAL MATCH (p)-[:DIED_IN]->(dp:Place)
      OPTIONAL MATCH (father:Person)-[:PARENT_OF]->(p) WHERE father.sex = 'M'
      OPTIONAL MATCH (mother:Person)-[:PARENT_OF]->(p) WHERE mother.sex = 'F'
      OPTIONAL MATCH (p)-[:HAD_OCCUPATION]->(occ:Occupation)
      OPTIONAL MATCH (p)-[:EXPERIENCED]->(le:LifeEvent)
      WITH p, bp, dp, father, mother,
        collect(DISTINCT occ.title) as occupations,
        collect(DISTINCT {event: le.event, year: le.yearInt}) as lifeEvents
      RETURN
        p.id as id, p.fullName as fullName, p.surname as surname,
        p.birthYear as birthYear, p.deathYear as deathYear,
        bp.name as birthPlace, dp.name as deathPlace,
        CASE WHEN p.biography IS NOT NULL THEN p.biography
             WHEN p.markdownContent IS NOT NULL THEN left(p.markdownContent, 2000)
             ELSE null END as biography,
        father.fullName as fatherName, father.id as fatherId,
        mother.fullName as motherName, mother.id as motherId,
        occupations,
        lifeEvents
      `,
      { treeId, personId },
    );

    if (personResult[0]) {
      const p = personResult[0];
      context += `### Current Person: ${p.fullName}\n`;
      context += `- ID: ${p.id}\n`;
      context += `- Born: ${p.birthYear || 'Unknown'}${p.birthPlace ? ` in ${p.birthPlace}` : ''}\n`;
      context += `- Died: ${p.deathYear || 'Unknown'}${p.deathPlace ? ` in ${p.deathPlace}` : ''}\n`;
      if (p.fatherName)
        context += `- Father: [${p.fatherName}](/person/${p.fatherId})\n`;
      if (p.motherName)
        context += `- Mother: [${p.motherName}](/person/${p.motherId})\n`;
      const occupations = (p.occupations || []).filter(Boolean);
      if (occupations.length > 0)
        context += `- Occupations: ${occupations.join(', ')}\n`;
      const lifeEvents = (p.lifeEvents || []).filter(
        (le: { event: string; year: number | null }) => le && le.event,
      );
      if (lifeEvents.length > 0) {
        const eventSummaries = lifeEvents
          .sort(
            (a: { year: number | null }, b: { year: number | null }) =>
              (a.year ?? 9999) - (b.year ?? 9999),
          )
          .slice(0, 10)
          .map((le: { event: string; year: number | null }) =>
            le.year ? `${le.year} - ${le.event}` : le.event,
          );
        context += `- Key Events: ${eventSummaries.join('; ')}\n`;
      }
      if (p.biography) context += `\n**Biography:**\n${p.biography}\n`;
      context += '\n';

      // Get their spouses and children
      const familyResult = await executeQuery<{
        spouseName: string;
        spouseId: string;
        childName: string;
        childId: string;
      }>(
        `
        MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person {id: $personId})
        OPTIONAL MATCH (p)-[:SPOUSE_OF]-(s:Person)
        OPTIONAL MATCH (p)-[:PARENT_OF]->(c:Person)
        RETURN DISTINCT
          s.fullName as spouseName, s.id as spouseId,
          c.fullName as childName, c.id as childId
        `,
        { treeId, personId },
      );

      const spouses = [
        ...new Set(
          familyResult
            .filter((r) => r.spouseName)
            .map((r) => `[${r.spouseName}](/person/${r.spouseId})`),
        ),
      ];
      const children = [
        ...new Set(
          familyResult
            .filter((r) => r.childName)
            .map((r) => `[${r.childName}](/person/${r.childId})`),
        ),
      ];

      if (spouses.length > 0) context += `- Spouses: ${spouses.join(', ')}\n`;
      if (children.length > 0)
        context += `- Children: ${children.join(', ')}\n`;
      context += '\n';
    }
  }

  // Search for relevant people based on query
  const queryLower = query.toLowerCase();

  // Check for topic-specific queries
  if (
    queryLower.includes('military') ||
    queryLower.includes('war') ||
    queryLower.includes('veteran')
  ) {
    const milResult = await executeQuery<{
      id: string;
      name: string;
      war: string;
    }>(
      `
      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)-[:SERVED_IN]->(w:War)
      RETURN p.id as id, p.fullName as name, w.name as war
      LIMIT 10
      `,
      { treeId },
    );
    if (milResult.length > 0) {
      context += `### Military Veterans\n`;
      milResult.forEach((r) => {
        context += `- [${r.name}](/person/${r.id}) - served in ${r.war}\n`;
      });
      context += '\n';
    }
  }

  if (
    queryLower.includes('oldest') ||
    queryLower.includes('longest') ||
    queryLower.includes('lived')
  ) {
    const longResult = await executeQuery<{
      id: string;
      name: string;
      age: number;
    }>(
      `
      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
      WHERE p.birthYear IS NOT NULL AND p.deathYear IS NOT NULL
      WITH p, p.deathYear - p.birthYear as age
      WHERE age > 80
      RETURN p.id as id, p.fullName as name, age
      ORDER BY age DESC
      LIMIT 10
      `,
      { treeId },
    );
    if (longResult.length > 0) {
      context += `### Longest-Lived Ancestors\n`;
      longResult.forEach((r) => {
        context += `- [${r.name}](/person/${r.id}) - lived to ${r.age} years\n`;
      });
      context += '\n';
    }
  }

  if (queryLower.includes('welsh') || queryLower.includes('wales')) {
    const welshResult = await executeQuery<{
      id: string;
      name: string;
      place: string;
    }>(
      `
      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)-[:BORN_IN]->(pl:Place)
      WHERE pl.country = 'Wales' OR pl.state = 'Wales'
      RETURN p.id as id, p.fullName as name, pl.name as place
      LIMIT 10
      `,
      { treeId },
    );
    if (welshResult.length > 0) {
      context += `### Welsh Heritage\n`;
      welshResult.forEach((r) => {
        context += `- [${r.name}](/person/${r.id}) - born in ${r.place}\n`;
      });
      context += '\n';
    }
  }

  // General name search
  const searchTerms = queryLower
    .split(/\s+/)
    .filter(
      (w) =>
        w.length > 3 &&
        ![
          'what',
          'when',
          'where',
          'who',
          'how',
          'about',
          'tell',
          'know',
          'the',
          'and',
          'for',
        ].includes(w),
    );

  if (searchTerms.length > 0 && !personId) {
    const searchResult = await executeQuery<Neo4jPerson>(
      `
      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
      WHERE toLower(p.fullName) CONTAINS $term OR toLower(p.surname) CONTAINS $term
      OPTIONAL MATCH (p)-[:BORN_IN]->(bp:Place)
      RETURN p.id as id, p.fullName as fullName, p.surname as surname,
             p.birthYear as birthYear, p.deathYear as deathYear,
             bp.name as birthPlace, p.biography as biography
      LIMIT 8
      `,
      { treeId, term: searchTerms[0] },
    );

    if (searchResult.length > 0) {
      context += `### People Matching "${searchTerms[0]}"\n`;
      searchResult.forEach((p) => {
        const years =
          p.birthYear && p.deathYear
            ? `(${p.birthYear}-${p.deathYear})`
            : p.birthYear
              ? `(b. ${p.birthYear})`
              : '';
        context += `- [${p.fullName}](/person/${p.id}) ${years}`;
        if (p.birthPlace) context += ` - born in ${p.birthPlace}`;
        context += '\n';
        if (p.biography) context += `  ${p.biography.slice(0, 200)}...\n`;
      });
      context += '\n';
    }
  }

  // Get top surnames for reference
  const surnameResult = await executeQuery<{ surname: string; count: number }>(
    `
    MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
    WHERE p.surname IS NOT NULL
    RETURN p.surname as surname, count(*) as count
    ORDER BY count DESC
    LIMIT 8
    `,
    { treeId },
  );

  context += `### Major Family Branches\n`;
  surnameResult.forEach((r) => {
    context += `- ${r.surname}: ${r.count} people\n`;
  });

  return context;
}
