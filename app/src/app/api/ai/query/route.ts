import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { executeQuery } from '@/lib/neo4j';
import { siteConfig } from '@/lib/siteConfig';

const DEFAULT_TREE_ID = siteConfig.defaultTreeId;

const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You are a genealogy database query assistant. You help users explore their family tree data stored in Neo4j.

## Database Schema

### Nodes:
- Person: {id, fullName, givenName, surname, sex ('M'/'F'/'U'), birthYear, deathYear, isLiving, biography, markdownContent, verificationStatus, wikitreeId, findagraveId}
- Place: {id, name, type ('COUNTRY'/'STATE'/'COUNTY'/'TOWN'/'PARISH'), state, country}
- Occupation: {id, title, category}
- Religion: {id, name, denomination}
- War: {id, name}
- LegalStatus: {id, status} - values: 'TRANSPORTED_CONVICT', 'TRANSPORTED', 'INDENTURED_SERVANT', 'FREE'
- Ethnicity: {id, name, haplogroup}
- Record: {id, ark, type (census/death/birth/marriage/military/burial/other), provider, evidenceClass (primary/secondary/tertiary), collection, year, country, tier (A/B/C/D/E), place, participants (JSON string array)}
- Tree: {id}

### Relationships:
- (Tree)-[:CONTAINS]->(Person)
- (Person)-[:EVIDENCED_BY {role, age, occupation, birthplace}]->(Record)
- (Person)-[:PARENT_OF]->(Person)
- (Person)-[:CHILD_OF]->(Person)
- (Person)-[:SPOUSE_OF]->(Person)
- (Person)-[:BORN_IN]->(Place)
- (Person)-[:DIED_IN]->(Place)
- (Person)-[:BURIED_IN]->(Place)
- (Person)-[:LIVED_IN {fromYear, toYear}]->(Place)
- (Person)-[:HAD_OCCUPATION {fromYear, toYear, notes}]->(Occupation)
- (Person)-[:HAD_STATUS {notes, transportedBy}]->(LegalStatus)
- (Person)-[:PRACTICED {convertedYear, notes}]->(Religion)
- (Person)-[:SERVED_IN {unit, rank, fromYear, toYear, darNumber}]->(War)
- (Person)-[:OF_ETHNICITY {dnaConfirmed, notes}]->(Ethnicity)
- (Person)-[:IMMIGRATED_TO {year, fromPlace, ship, port}]->(Place)

### Important:
- Always filter by Tree to get data from the correct family tree
- Use $treeId parameter for the tree filter
- Person IDs are prefixed with 'p_' (e.g., 'p_edward_dorsey_immigrant')
- Occupation categories: 'JUDICIAL', 'MILITARY', 'AGRICULTURAL', 'TRADE', 'POLITICAL', 'RELIGIOUS', 'OTHER'
- Religion names: 'Quaker', 'Baptist', 'Congregationalist', 'Protestant', 'Puritan', 'Congregational'
- War names: 'Revolutionary War', 'World War I', 'World War II', 'French and Indian War', 'American Revolutionary War'

## Instructions

When the user asks a question about their family tree:
1. Generate a valid Cypher query to answer it
2. Return ONLY the Cypher query, no explanation
3. Always include the tree filter: MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
4. Return useful fields that help answer the question
5. Use meaningful aliases for readability
6. Limit results to 50 unless user specifies otherwise

Examples:
Q: "Show me all the Quakers"
A: MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)-[:PRACTICED]->(r:Religion {name: 'Quaker'}) RETURN p.fullName as name, p.birthYear as born, p.deathYear as died ORDER BY p.birthYear

Q: "Who served in the Revolutionary War?"
A: MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)-[s:SERVED_IN]->(w:War) WHERE w.name CONTAINS 'Revolutionary' RETURN p.fullName as name, w.name as war, s.unit as unit, s.rank as rank, p.birthYear as born ORDER BY p.birthYear

Q: "Find ancestors who were transported convicts"
A: MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)-[hs:HAD_STATUS]->(l:LegalStatus {status: 'TRANSPORTED_CONVICT'}) RETURN p.fullName as name, p.birthYear as born, p.deathYear as died, hs.notes as details ORDER BY p.birthYear

Q: "Who lived in Maryland in the 1700s?"
A: MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)-[:BORN_IN|DIED_IN|LIVED_IN]->(pl:Place) WHERE pl.state = 'Maryland' AND p.birthYear >= 1700 AND p.birthYear < 1800 RETURN DISTINCT p.fullName as name, pl.name as place, p.birthYear as born, p.deathYear as died ORDER BY p.birthYear

Q: "Show me judges in the family"
A: MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)-[:HAD_OCCUPATION]->(o:Occupation) WHERE o.title CONTAINS 'Judge' OR o.category = 'JUDICIAL' RETURN p.fullName as name, o.title as occupation, p.birthYear as born, p.deathYear as died ORDER BY p.birthYear

Q: "How many census records do we have?"
A: MATCH (r:Record {type: 'census'}) RETURN count(r) AS censusCount

Q: "Who has the most records?"
A: MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)-[:EVIDENCED_BY]->(r:Record) WITH p, count(r) AS recCount RETURN p.fullName AS name, recCount ORDER BY recCount DESC LIMIT 10

Q: "Find all death records from New Hampshire"
A: MATCH (r:Record {type: 'death'}) WHERE r.place CONTAINS 'New Hampshire' RETURN r.id, r.collection, r.year, r.place ORDER BY r.year

Q: "What records exist for John Wagner?"
A: MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)-[e:EVIDENCED_BY]->(r:Record) WHERE toLower(p.fullName) CONTAINS 'john wagner' RETURN p.fullName, r.type, r.year, r.collection, e.role ORDER BY r.year`;

async function generateCypher(question: string): Promise<string> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: question }
    ],
  });

  const content = response.content[0];
  if (content.type === 'text') {
    // Extract just the Cypher query (remove any markdown formatting)
    let cypher = content.text.trim();
    cypher = cypher.replace(/```cypher\n?/g, '').replace(/```\n?/g, '');
    return cypher.trim();
  }

  throw new Error('Unexpected response format');
}

async function formatResults(question: string, results: Record<string, unknown>[]): Promise<string> {
  if (results.length === 0) {
    return "No results found for your query.";
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: `The user asked: "${question}"

Here are the results from the database (JSON):
${JSON.stringify(results, null, 2)}

Please provide a natural language summary of these results. Be conversational and informative. If there are relationships mentioned (like "5th great-grandfather"), include those. Format names and dates nicely.`
      }
    ],
  });

  const content = response.content[0];
  if (content.type === 'text') {
    return content.text;
  }

  return JSON.stringify(results, null, 2);
}

export async function POST(request: NextRequest) {
  try {
    const { question } = await request.json();
    const { searchParams } = new URL(request.url);
    const treeId = searchParams.get('treeId') || DEFAULT_TREE_ID;

    if (!question || typeof question !== 'string') {
      return NextResponse.json(
        { error: 'Question is required' },
        { status: 400 }
      );
    }

    // Generate Cypher query from natural language
    const cypher = await generateCypher(question);

    // Execute the query
    let results: Record<string, unknown>[];
    try {
      results = await executeQuery(cypher, { treeId });
    } catch (queryError: unknown) {
      const message = queryError instanceof Error ? queryError.message : 'Unknown query error';
      return NextResponse.json({
        question,
        cypher,
        error: `Query execution failed: ${message}`,
        results: [],
        answer: null,
      });
    }

    // Format results into natural language
    const answer = await formatResults(question, results);

    return NextResponse.json({
      question,
      cypher,
      results,
      answer,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error processing AI query:', error);
    return NextResponse.json(
      { error: `Failed to process query: ${message}` },
      { status: 500 }
    );
  }
}
