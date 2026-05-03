import { executeQuery } from '../client';

export interface RecordGapAnalysis {
  personId: string;
  personName: string;
  birthYear: number | null;
  deathYear: number | null;
  recordTypes: string[];
  missingTypes: string[];
  censusYears: number[];
  missingCensusYears: number[];
  suggestions: string[];
}

export async function analyzeRecordGaps(
  personId: string,
  treeId: string
): Promise<RecordGapAnalysis> {
  const cypher = `
    MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person {id: $personId})
    OPTIONAL MATCH (p)-[e:EVIDENCED_BY]->(r:Record)
    RETURN
      p.id AS personId,
      p.fullName AS personName,
      p.birthYear AS birthYear,
      p.deathYear AS deathYear,
      collect(DISTINCT r.type) AS recordTypes,
      collect(DISTINCT r.year) AS recordYears,
      collect(DISTINCT {type: r.type, year: r.year, collection: r.collection}) AS records
  `;

  const rows = await executeQuery<{
    personId: string;
    personName: string;
    birthYear: number | null;
    deathYear: number | null;
    recordTypes: string[];
    recordYears: (number | null)[];
    records: Array<{ type: string; year: number | null; collection: string }>;
  }>(cypher, { personId, treeId });

  if (rows.length === 0) {
    return {
      personId,
      personName: personId,
      birthYear: null,
      deathYear: null,
      recordTypes: [],
      missingTypes: ['birth', 'death', 'census', 'marriage'],
      censusYears: [],
      missingCensusYears: [],
      suggestions: ['No person found with this ID.'],
    };
  }

  const row = rows[0];
  const birth = row.birthYear;
  const death = row.deathYear;

  const hasType = (t: string) => row.recordTypes.includes(t);
  const missingTypes: string[] = [];
  if (!hasType('birth')) missingTypes.push('birth');
  if (!hasType('death') && death) missingTypes.push('death');
  if (!hasType('marriage')) missingTypes.push('marriage');
  if (!hasType('census')) missingTypes.push('census');
  if (!hasType('military')) missingTypes.push('military');

  const US_CENSUS_YEARS = [1790, 1800, 1810, 1820, 1830, 1840, 1850, 1860, 1870, 1880, 1890, 1900, 1910, 1920, 1930, 1940, 1950];
  const censusYears = row.recordYears.filter((y): y is number => y !== null && US_CENSUS_YEARS.includes(y));
  const missingCensusYears: number[] = [];

  if (birth && death) {
    for (const cy of US_CENSUS_YEARS) {
      if (cy >= birth && cy <= death && !censusYears.includes(cy)) {
        if (cy === 1890) continue;
        missingCensusYears.push(cy);
      }
    }
  } else if (birth) {
    for (const cy of US_CENSUS_YEARS) {
      if (cy >= birth && cy <= birth + 90 && !censusYears.includes(cy)) {
        if (cy === 1890) continue;
        missingCensusYears.push(cy);
      }
    }
  }

  const suggestions: string[] = [];

  if (missingTypes.includes('birth') && birth) {
    suggestions.push(`Search for birth record (~${birth}). Try state vital records or church records for the birth location.`);
  }
  if (missingTypes.includes('death') && death) {
    suggestions.push(`Search for death record (~${death}). Try state death index, SSDI, or Find a Grave.`);
  }
  if (missingTypes.includes('marriage')) {
    suggestions.push(`No marriage record found. Search state marriage records or church registers.`);
  }
  for (const cy of missingCensusYears.slice(0, 5)) {
    const age = birth ? cy - birth : '?';
    suggestions.push(`Missing ${cy} Census (would be ~${age} years old). Search FamilySearch ${cy} Census collection.`);
  }
  if (missingCensusYears.length > 5) {
    suggestions.push(`... and ${missingCensusYears.length - 5} more missing census years.`);
  }
  if (row.records.length === 0) {
    suggestions.push(`No records linked to this person yet. Start with census records for the most coverage.`);
  }

  return {
    personId: row.personId,
    personName: row.personName,
    birthYear: birth,
    deathYear: death,
    recordTypes: row.recordTypes,
    missingTypes,
    censusYears,
    missingCensusYears,
    suggestions,
  };
}

export async function getTreeResearchStats(treeId: string): Promise<{
  totalPeople: number;
  withRecords: number;
  withoutRecords: number;
  avgRecordsPerPerson: number;
  byRecordCount: Array<{ count: number; people: number }>;
}> {
  const cypher = `
    MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
    OPTIONAL MATCH (p)-[:EVIDENCED_BY]->(r:Record)
    WITH p, count(r) AS recCount
    RETURN
      count(p) AS totalPeople,
      count(CASE WHEN recCount > 0 THEN 1 END) AS withRecords,
      count(CASE WHEN recCount = 0 THEN 1 END) AS withoutRecords,
      avg(recCount) AS avgRecords,
      recCount AS recordCount,
      count(p) AS peopleWithThisCount
    ORDER BY recCount
  `;

  const rows = await executeQuery<{
    totalPeople: number;
    withRecords: number;
    withoutRecords: number;
    avgRecords: number;
    recordCount: number;
    peopleWithThisCount: number;
  }>(cypher, { treeId });

  const first = rows[0] || { totalPeople: 0, withRecords: 0, withoutRecords: 0, avgRecords: 0 };

  return {
    totalPeople: first.totalPeople,
    withRecords: first.withRecords,
    withoutRecords: first.withoutRecords,
    avgRecordsPerPerson: Math.round((first.avgRecords || 0) * 10) / 10,
    byRecordCount: rows.map((r) => ({
      count: r.recordCount,
      people: r.peopleWithThisCount,
    })),
  };
}
