#!/usr/bin/env node
/**
 * Rebuild Neo4j from Verified Nodes (YAML Frontmatter Architecture)
 *
 * This is the PRIMARY rebuild script. It creates the Neo4j graph entirely
 * from verified_nodes/*.md files, which are the source of truth.
 *
 * After the YAML frontmatter migration, structured data (name, dates, parents,
 * spouses, children, status, external IDs) is read from YAML frontmatter via
 * gray-matter. Life events, biography, and occupations are still parsed from
 * the markdown body.
 *
 * Usage:
 *   node scripts/rebuild-from-markdown.mjs                  # Incremental
 *   node scripts/rebuild-from-markdown.mjs --clear          # Full rebuild
 *   node scripts/rebuild-from-markdown.mjs --dry-run        # Parse only, no DB writes
 *
 * Requires: NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD env vars
 *           (defaults to bolt://localhost:7687 / neo4j / localdev)
 */

import neo4j from 'neo4j-driver';
import matter from 'gray-matter';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { execSync } from 'child_process';
import { inferCountry } from './lib/country-inference.mjs';
import { parseLooseInteger } from './lib/numeric-normalizer.mjs';
import { getPath, getTreeId, getTreeName } from './lib/config.mjs';

// --- Configuration ---
const VERIFIED_NODES_DIR = getPath('nodesDir');
const PLACES_PATH = getPath('placesFile');
const ALIASES_PATH = getPath('placeAliasesFile');
const CONTEXTUAL_MEDIA_DIR = getPath('contextualMediaDir');
const RECORDS_DIR = getPath('recordsDir');
const ENRICHMENT_AUDIT_PATH = getPath('enrichmentAuditFile');
const TREE_ID = getTreeId();
const TREE_NAME = getTreeName();

const CLEAR_DB = process.argv.includes('--clear');
const DRY_RUN = process.argv.includes('--dry-run');
const SKIP_VALIDATION = process.argv.includes('--skip-validation');

const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'localdev';

// --- YAML Frontmatter Parser ---

function normalizeUrl(url) {
  if (!url) return '';
  return url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/+$/, '').toLowerCase();
}

function extractSources(markdownBody) {
  const sources = [];

  // Find the ## Sources heading, then grab everything until the next ## heading
  const startMatch = markdownBody.match(/^## Sources\s*\r?\n/m);
  if (!startMatch) return sources;

  const startIdx = startMatch.index + startMatch[0].length;
  const rest = markdownBody.substring(startIdx);
  const nextHeading = rest.match(/\r?\n## [A-Z]/);
  const sourcesText = nextHeading ? rest.substring(0, nextHeading.index) : rest;

  // Split on numbered bold entries (e.g., "1. **Collection Name**")
  const entries = sourcesText.split(/\r?\n(?=\d+\.\s+\*\*)/);

  for (const entry of entries) {
    if (!entry.trim()) continue;
    const titleMatch = entry.match(/^\d+\.\s+\*\*([^*]+)\*\*/);
    if (!titleMatch) continue;

    const collection = titleMatch[1].trim();

    const arkMatch = entry.match(/(?:FamilySearch\s+Ark|ARK):\s*(https?:\/\/www\.familysearch\.org\/ark:\/[^\s\r\n]+)/i);
    const ark = arkMatch ? arkMatch[1].trim() : null;

    let recordType = 'other';
    const lc = collection.toLowerCase();
    if (lc.includes('census')) recordType = 'census';
    else if (lc.includes('birth') || lc.includes('christening')) recordType = 'birth';
    else if (lc.includes('death') || lc.includes('stillbirth')) recordType = 'death';
    else if (lc.includes('marriage')) recordType = 'marriage';
    else if (lc.includes('military') || lc.includes('draft')) recordType = 'military';
    else if (lc.includes('immigration') || lc.includes('passenger')) recordType = 'immigration';
    else if (lc.includes('grave') || lc.includes('burial') || lc.includes('cemetery')) recordType = 'burial';

    let year = null;
    const yearMatch = collection.match(/(\d{4})/);
    if (yearMatch) year = parseInt(yearMatch[1], 10);

    const keyFacts = [];
    const lines = entry.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      if (/^\d+\.\s+\*\*/.test(trimmed)) continue;
      if (/^-\s+(?:FamilySearch\s+Ark|ARK|Added|Tier|Auto-generated|Discovered|Source)/i.test(trimmed)) continue;
      if (/^-\s+/.test(trimmed)) {
        const fact = trimmed.replace(/^-\s+/, '').trim();
        if (fact && fact.length < 120) keyFacts.push(fact);
      }
    }

    sources.push({
      collection, ark, recordType, year,
      keyFacts: keyFacts.slice(0, 4),
      imageUrl: null,
    });
  }
  return sources;
}

function parseVerifiedNode(filePath) {
  const raw = readFileSync(filePath, 'utf8');
  const slug = basename(filePath, '.md');

  if (slug === '_TEMPLATE') return null;

  // Parse YAML frontmatter
  const { data: fm, content: body } = matter(raw);

  // If no frontmatter (legacy file), skip
  if (!fm || !fm.slug) return null;

  const node = { slug: fm.slug || slug, filePath };

  // Structured data from frontmatter
  node.fullName = fm.name?.full || slug.replace(/_/g, ' ');
  node.status = fm.status || 'needs_research';
  node.isCrossRef = fm.status === 'cross_reference';
  if (node.isCrossRef) {
    node.canonicalSlug = fm.canonical_slug || null;
  }

  node.birthDate = fm.birth?.date || '';
  node.birthPlace = fm.birth?.place || '';
  node.deathDate = fm.death?.date || '';
  node.deathPlace = fm.death?.place || '';
  node.sex = fm.sex || '';
  node.maidenName = fm.name?.maiden || '';
  node.title = fm.name?.title || '';
  node.religion = fm.religion || '';
  node.burial = fm.burial || '';

  // Extract years
  node.birthYear = extractYear(node.birthDate);
  node.deathYear = extractYear(node.deathDate);

  // Origin country
  node.originCountry = fm.origin_country || inferCountry(node.birthPlace, { format: 'name' });

  // Bio tier
  node.bioTier = fm.bio_tier || '';

  // External IDs
  node.gedcomId = fm.external_ids?.gedcom || '';
  node.wikitreeId = fm.external_ids?.wikitree || '';
  node.findagraveId = fm.external_ids?.findagrave || '';
  node.familysearchTreeId = fm.external_ids?.familysearch_tree || '';

  // Relationships — already resolved to slugs in frontmatter
  node.fatherSlug = fm.parents?.father || null;
  node.motherSlug = fm.parents?.mother || null;
  node.spouseSlugs = (fm.spouses || []).map(s => typeof s === 'string' ? s : s.slug).filter(Boolean);
  // Full spouse objects (for marriage place/date extraction in Phase 5)
  node.spouseEntries = (fm.spouses || []).map(s => {
    if (typeof s === 'string') return { slug: s };
    return {
      slug: s.slug || null,
      marriage_date: s.marriage_date || null,
      marriage_place: s.marriage_place || null,
    };
  }).filter(e => e.slug);
  node.childSlugs = (fm.children || []).filter(Boolean);
  node.siblingSlugs = (fm.siblings || []).filter(Boolean);

  // Discovered-from context
  node.discoveredFrom = (fm.discovered_from || []).map(d => ({
    personSlug: d.person || null,
    role: d.role || '',
  }));

  // --- Body parsing (life events, occupations, biography remain in markdown) ---
  node.lifeEvents = parseLifeEvents(body);
  node.occupations = fm.occupations?.length > 0 ? fm.occupations : extractOccupations(body, node.lifeEvents);
  node.biography = extractBiography(body);
  // Primary: read from frontmatter (snake_case → camelCase mapping)
  node.sources = (fm.sources || []).map(s => ({
    collection: s.collection || '',
    provider: s.provider || 'other',
    url: s.url || null,
    recordType: s.record_type || 'other',
    year: s.year || null,
    keyFacts: s.key_facts || [],
    imageUrl: s.image_url || null,
    added: s.added || null,
    record_id: s.record_id || null,
  }));

  // Fallback: if no frontmatter sources, try body parser (for unmigrated files)
  if (node.sources.length === 0) {
    node.sources = extractSources(body);
  }

  // Generate synthetic source cards from external_ids
  if (node.findagraveId) {
    const fagUrl = `https://www.findagrave.com/memorial/${node.findagraveId}`;
    if (!node.sources.some(s => s.url && normalizeUrl(s.url) === normalizeUrl(fagUrl))) {
      node.sources.push({
        collection: 'Find A Grave Memorial',
        provider: 'findagrave',
        url: fagUrl,
        recordType: 'burial',
        year: null,
        keyFacts: [node.burial || ''].filter(Boolean),
        imageUrl: null,
        added: null,
      });
    }
  }

  if (node.wikitreeId) {
    const wtUrl = `https://www.wikitree.com/wiki/${node.wikitreeId}`;
    if (!node.sources.some(s => s.url && normalizeUrl(s.url) === normalizeUrl(wtUrl))) {
      node.sources.push({
        collection: 'WikiTree Profile',
        provider: 'wikitree',
        url: wtUrl,
        recordType: 'other',
        year: null,
        keyFacts: [],
        imageUrl: null,
        added: null,
      });
    }
  }

  if (node.familysearchTreeId) {
    const fsUrl = `https://www.familysearch.org/tree/person/details/${node.familysearchTreeId}`;
    if (!node.sources.some(s => s.url && normalizeUrl(s.url) === normalizeUrl(fsUrl))) {
      node.sources.push({
        collection: 'FamilySearch Family Tree',
        provider: 'familysearch',
        url: fsUrl,
        recordType: 'other',
        year: null,
        keyFacts: [],
        imageUrl: null,
        added: null,
      });
    }
  }

  // Full markdown for search/display
  node.markdownContent = raw;

  return node;
}

// --- Body Parsers (still needed for markdown body content) ---

function extractYear(dateStr) {
  if (!dateStr) return null;
  const match = String(dateStr).match(/\b(1[4-9]\d{2}|20[0-2]\d)\b/);
  return match ? parseInt(match[1]) : null;
}

function parseLifeEvents(content) {
  const events = [];
  const lines = content.split('\n');
  let inSection = false;
  for (const line of lines) {
    if (/^## Life Events/i.test(line)) { inSection = true; continue; }
    if (inSection && /^## [^#]/.test(line)) break;
    if (!inSection) continue;
    const match = line.match(/^\|\s*([^|]*)\|\s*([^|]*)\|\s*([^|]*)\|\s*([^|]*)\|\s*([^|]*)\|/);
    if (!match) continue;
    const year = match[1].trim(), age = match[2].trim(), event = match[3].trim(),
          location = match[4].trim(), source = match[5].trim();
    if (year === 'Year' || year.startsWith('---') || !event) continue;
    events.push({ year, age, event, location, source });
  }
  return events;
}

function extractOccupations(content, lifeEvents) {
  const occupations = new Set();
  for (const evt of lifeEvents) {
    const lower = evt.event.toLowerCase();
    if (lower.includes('occupation') || lower.includes('employed') ||
        lower.includes('worked as') || lower.includes('profession')) {
      const occMatch = evt.event.match(/(?:occupation|employed|worked as|profession)[:\s]+(.+)/i);
      if (occMatch) occupations.add(occMatch[1].trim());
      else occupations.add(evt.event);
    }
  }
  // From biography
  const bioLines = content.split('\n');
  let inBio = false;
  const bioSection = [];
  for (const line of bioLines) {
    if (/^## Biography|^## Summary/i.test(line)) { inBio = true; continue; }
    if (inBio && /^## [^#]/.test(line)) break;
    if (inBio) bioSection.push(line);
  }
  if (bioSection.length > 0) {
    const bio = bioSection.join('\n');
    const patterns = [
      /(?:was|became|served as|worked as|employed as)\s+(?:a |an |the )?([A-Z][a-z]+(?:\s+[A-Za-z]+){0,3}?)(?:\.|,|\s+(?:at|in|for|and|who|from|until))/g,
    ];
    for (const pat of patterns) {
      let m;
      while ((m = pat.exec(bio)) !== null) {
        const occ = m[1].trim();
        if (occ.length > 2 && occ.length < 50) occupations.add(occ);
      }
    }
    const officePat = /(?:elected|appointed|served)\s+(?:as\s+)?(?:a\s+)?(.+?)(?:\.|,|\s+(?:in|of|from|for)\s+\d)/gi;
    let m;
    while ((m = officePat.exec(bio)) !== null) {
      const role = m[1].trim();
      if (role.length > 2 && role.length < 80) occupations.add(role);
    }
  }
  return [...occupations];
}

function extractBiography(content) {
  const lines = content.split('\n');
  let inBio = false;
  const result = [];
  for (const line of lines) {
    if (/^## Biography|^## Summary/i.test(line)) { inBio = true; continue; }
    if (inBio && /^## [^#]/.test(line)) break;
    if (inBio) result.push(line);
  }
  return result.length > 0 ? result.join('\n').trim() : '';
}

function normalizeSex(sex) {
  if (!sex) return '';
  const lower = sex.toLowerCase();
  if (lower.startsWith('m')) return 'M';
  if (lower.startsWith('f')) return 'F';
  return sex;
}

function extractGivenName(fullName) {
  if (!fullName) return '';
  return fullName.trim().split(/\s+/)[0] || '';
}

function extractSurname(fullName) {
  if (!fullName) return '';
  const parts = fullName.trim().split(/\s+/);
  let last = parts.length - 1;
  while (last > 0 && /^(sr|jr|ii|iii|iv|v)\.?$/i.test(parts[last])) last--;
  return last > 0 ? parts[last] : parts[parts.length - 1];
}

// --- Neo4j Operations ---

async function runQuery(session, cypher, params = {}) {
  return session.run(cypher, params);
}

async function createIndexes(session) {
  console.log('Creating indexes...');
  const indexes = [
    'CREATE INDEX IF NOT EXISTS FOR (p:Person) ON (p.id)',
    'CREATE INDEX IF NOT EXISTS FOR (p:Person) ON (p.slug)',
    'CREATE INDEX IF NOT EXISTS FOR (p:Person) ON (p.fullName)',
    'CREATE INDEX IF NOT EXISTS FOR (t:Tree) ON (t.id)',
    'CREATE INDEX IF NOT EXISTS FOR (o:Occupation) ON (o.title)',
    'CREATE INDEX IF NOT EXISTS FOR (pl:Place) ON (pl.name)',
    'CREATE INDEX IF NOT EXISTS FOR (cm:ContextualMedia) ON (cm.itemId)',
    'CREATE INDEX IF NOT EXISTS FOR (r:Record) ON (r.id)',
    'CREATE INDEX IF NOT EXISTS FOR (r:Record) ON (r.ark)',
    'CREATE INDEX IF NOT EXISTS FOR (r:Record) ON (r.type)',
  ];
  for (const idx of indexes) {
    await runQuery(session, idx);
  }
}

async function clearDatabase(session) {
  console.log('Clearing database...');
  await runQuery(session, 'MATCH (n) DETACH DELETE n');
  console.log('Database cleared.\n');
}

async function createTreeNode(session) {
  await runQuery(session, `
    MERGE (t:Tree {id: $treeId})
    SET t.name = $treeName, t.updatedAt = datetime()
  `, { treeId: TREE_ID, treeName: TREE_NAME });
}

async function upsertPerson(session, node) {
  const birthYear = parseLooseInteger(node.birthYear);
  const deathYear = parseLooseInteger(node.deathYear);

  await runQuery(session, `
    MERGE (p:Person {slug: $slug})
    SET p.id = $slug,
        p.fullName = $fullName,
        p.givenName = $givenName,
        p.surname = $surname,
        p.sex = $sex,
        p.birthDate = $birthDate,
        p.birthYear = $birthYear,
        p.birthPlace = $birthPlace,
        p.deathDate = $deathDate,
        p.deathYear = $deathYear,
        p.deathPlace = $deathPlace,
        p.maidenName = $maidenName,
        p.title = $title,
        p.religion = $religion,
        p.burial = $burial,
        p.originCountry = $originCountry,
        p.occupations = $occupations,
        p.biography = $biography,
        p.status = $status,
        p.isCrossRef = $isCrossRef,
        p.gedcomId = $gedcomId,
        p.wikitreeId = $wikitreeId,
        p.findagraveId = $findagraveId,
        p.familysearchTreeId = $familysearchTreeId,
        p.sources = $sources,
        p.bioTier = $bioTier,
        p.markdownContent = $markdownContent,
        p.updatedAt = datetime()
    WITH p
    MATCH (t:Tree {id: $treeId})
    MERGE (t)-[:CONTAINS]->(p)
  `, {
    slug: node.slug,
    fullName: node.fullName || '',
    givenName: extractGivenName(node.fullName),
    surname: extractSurname(node.fullName),
    sex: normalizeSex(node.sex),
    birthDate: node.birthDate || '',
    birthYear: birthYear != null ? neo4j.int(birthYear) : null,
    birthPlace: node.birthPlace || '',
    deathDate: node.deathDate || '',
    deathYear: deathYear != null ? neo4j.int(deathYear) : null,
    deathPlace: node.deathPlace || '',
    maidenName: node.maidenName || '',
    title: node.title || '',
    religion: node.religion || '',
    burial: node.burial || '',
    originCountry: node.originCountry || '',
    occupations: node.occupations || [],
    biography: node.biography || '',
    bioTier: node.bioTier || '',
    status: node.status || '',
    isCrossRef: node.isCrossRef || false,
    gedcomId: node.gedcomId || '',
    wikitreeId: node.wikitreeId || '',
    findagraveId: node.findagraveId || '',
    familysearchTreeId: node.familysearchTreeId || '',
    sources: JSON.stringify(node.sources || []),
    markdownContent: node.markdownContent || '',
    treeId: TREE_ID,
  });

  // Occupation nodes
  for (const occ of (node.occupations || [])) {
    await runQuery(session, `
      MERGE (o:Occupation {title: $title})
      WITH o
      MATCH (p:Person {slug: $slug})
      MERGE (p)-[:HAD_OCCUPATION]->(o)
    `, { title: occ, slug: node.slug });
  }

  // Life event nodes
  for (const evt of (node.lifeEvents || [])) {
    const evtYear = extractYear(evt.year);
    const evtCountry = inferCountry(evt.location, { format: 'name' });

    if (evt.location && evt.location.length > 1) {
      await runQuery(session, `
        MATCH (p:Person {slug: $slug})
        MERGE (pl:Place {name: $location})
        ON CREATE SET pl.country = $country
        CREATE (e:LifeEvent {
          event: $event, year: $year, yearInt: $yearInt, age: $age, source: $source
        })
        CREATE (p)-[:EXPERIENCED]->(e)
        CREATE (e)-[:OCCURRED_AT]->(pl)
      `, {
        slug: node.slug, location: evt.location, country: evtCountry,
        event: evt.event, year: evt.year, yearInt: evtYear ? neo4j.int(evtYear) : null,
        age: evt.age, source: evt.source,
      });

      const lower = evt.event.toLowerCase();
      if (lower.includes('census') || lower.includes('lived') || lower.includes('moved') ||
          lower.includes('resided') || lower.includes('resident') || lower.includes('enumerat')) {
        await runQuery(session, `
          MATCH (p:Person {slug: $slug})
          MATCH (pl:Place {name: $location})
          MERGE (p)-[r:LIVED_IN {year: $year}]->(pl)
          SET r.yearInt = $yearInt
        `, { slug: node.slug, location: evt.location, year: evt.year, yearInt: evtYear ? neo4j.int(evtYear) : null });
      }
    } else {
      await runQuery(session, `
        MATCH (p:Person {slug: $slug})
        CREATE (e:LifeEvent {
          event: $event, year: $year, yearInt: $yearInt, age: $age, source: $source
        })
        CREATE (p)-[:EXPERIENCED]->(e)
      `, {
        slug: node.slug, event: evt.event, year: evt.year,
        yearInt: evtYear ? neo4j.int(evtYear) : null, age: evt.age, source: evt.source,
      });
    }
  }

  // BORN_IN / DIED_IN places
  if (node.birthPlace) {
    await runQuery(session, `
      MERGE (pl:Place {name: $place})
      ON CREATE SET pl.country = $country
      WITH pl
      MATCH (p:Person {slug: $slug})
      MERGE (p)-[:BORN_IN]->(pl)
    `, { place: node.birthPlace, country: node.originCountry || '', slug: node.slug });
  }
  if (node.deathPlace) {
    const deathCountry = inferCountry(node.deathPlace, { format: 'name' });
    await runQuery(session, `
      MERGE (pl:Place {name: $place})
      ON CREATE SET pl.country = $country
      WITH pl
      MATCH (p:Person {slug: $slug})
      MERGE (p)-[:DIED_IN]->(pl)
    `, { place: node.deathPlace, country: deathCountry, slug: node.slug });
  }
  if (node.burial) {
    const burialCountry = inferCountry(node.burial, { format: 'name' });
    await runQuery(session, `
      MERGE (pl:Place {name: $place})
      ON CREATE SET pl.country = $country
      WITH pl
      MATCH (p:Person {slug: $slug})
      MERGE (p)-[:BURIED_IN]->(pl)
    `, { place: node.burial, country: burialCountry, slug: node.slug });
  }
}

async function createRelationships(session, nodes, nodeMap) {
  let parentOf = 0, spouseOf = 0, discoveredRels = 0, siblingOf = 0;

  for (const node of nodes) {
    if (node.isCrossRef) continue;

    // Parents (slugs already resolved in frontmatter)
    for (const parentSlug of [node.fatherSlug, node.motherSlug]) {
      if (!parentSlug || !nodeMap.has(parentSlug)) continue;
      await runQuery(session, `
        MATCH (parent:Person {slug: $parentSlug})
        MATCH (child:Person {slug: $childSlug})
        MERGE (parent)-[:PARENT_OF]->(child)
        MERGE (child)-[:CHILD_OF]->(parent)
      `, { parentSlug, childSlug: node.slug });
      parentOf++;
    }

    // Spouses
    for (const spouseSlug of node.spouseSlugs) {
      if (!nodeMap.has(spouseSlug)) continue;
      await runQuery(session, `
        MATCH (a:Person {slug: $aSlug})
        MATCH (b:Person {slug: $bSlug})
        MERGE (a)-[:SPOUSE_OF]->(b)
      `, { aSlug: node.slug, bSlug: spouseSlug });
      spouseOf++;
    }

    // Children
    for (const childSlug of node.childSlugs) {
      if (!nodeMap.has(childSlug)) continue;
      await runQuery(session, `
        MATCH (parent:Person {slug: $parentSlug})
        MATCH (child:Person {slug: $childSlug})
        MERGE (parent)-[:PARENT_OF]->(child)
        MERGE (child)-[:CHILD_OF]->(parent)
      `, { parentSlug: node.slug, childSlug });
      parentOf++;
    }

    // Siblings
    for (const sibSlug of node.siblingSlugs) {
      if (!nodeMap.has(sibSlug)) continue;
      await runQuery(session, `
        MATCH (a:Person {slug: $aSlug})
        MATCH (b:Person {slug: $bSlug})
        MERGE (a)-[:SIBLING_OF]->(b)
        MERGE (b)-[:SIBLING_OF]->(a)
      `, { aSlug: node.slug, bSlug: sibSlug });
      siblingOf++;
    }

    // Discovered-from context — research provenance only, NOT relationship data.
    // Relationships are established by the explicit parents/children/spouses/siblings
    // fields above. The discovered_from section records which person's research led
    // to discovering this node. Do NOT create PARENT_OF/CHILD_OF edges from it.
    // (Previous versions incorrectly created relationship edges here, causing
    // grandparents to appear as parents, etc.)
    for (const disc of (node.discoveredFrom || [])) {
      const otherSlug = disc.personSlug;
      if (!otherSlug || !nodeMap.has(otherSlug)) continue;

      // Only create a lightweight DISCOVERED_FROM edge for provenance tracking
      await runQuery(session, `
        MATCH (a:Person {slug: $aSlug})
        MATCH (b:Person {slug: $bSlug})
        MERGE (a)-[:DISCOVERED_FROM {role: $role}]->(b)
      `, { aSlug: node.slug, bSlug: otherSlug, role: disc.role || '' });
      discoveredRels++;

    }
  }

  return { parentOf, spouseOf, discoveredRels, siblingOf };
}

// --- Record Nodes ---

async function loadRecordNodes(session) {
  if (!existsSync(RECORDS_DIR)) {
    console.log('  data/records/ directory not found. Skipping Record node import.');
    console.log(`    Expected: ${RECORDS_DIR}`);
    return { recordsCreated: 0, evidencedByCreated: 0 };
  }

  const files = readdirSync(RECORDS_DIR).filter(f => f.endsWith('.md'));
  if (files.length === 0) {
    console.log('  No record files found in data/records/. Skipping.');
    return { recordsCreated: 0, evidencedByCreated: 0 };
  }

  console.log(`  Found ${files.length} record files.`);

  // Parse all record files
  const recordRows = [];
  const evidencedByRows = [];
  const parseErrors = [];

  for (const file of files) {
    try {
      const raw = readFileSync(join(RECORDS_DIR, file), 'utf8');
      const { data: fm } = matter(raw);
      const recordYear = parseLooseInteger(fm.year);

      if (!fm.record_id) {
        parseErrors.push(`${file}: missing record_id`);
        continue;
      }

      recordRows.push({
        id: fm.record_id,
        ark: fm.ark || null,
        type: fm.type || null,
        provider: fm.provider || null,
        evidenceClass: fm.evidence_class || null,
        collection: fm.collection || null,
        year: recordYear != null ? neo4j.int(recordYear) : null,
        country: fm.country || null,
        tier: fm.tier || null,
        place: fm.place || null,
        ingested: fm.ingested || null,
        participants: JSON.stringify(fm.participants || []),
      });

      // Participants → EVIDENCED_BY edges
      for (const participant of (fm.participants || [])) {
        if (!participant.matched_slug) continue;
        const participantAge = parseLooseInteger(participant.age);
        evidencedByRows.push({
          slug: participant.matched_slug,
          recordId: fm.record_id,
          role: participant.role || null,
          age: participantAge != null ? neo4j.int(participantAge) : null,
          occupation: participant.occupation || null,
          birthplace: participant.birthplace || null,
        });
      }
    } catch (err) {
      parseErrors.push(`${file}: ${err.message}`);
    }
  }

  if (parseErrors.length > 0) {
    console.log(`  Parse errors: ${parseErrors.length}`);
    parseErrors.forEach(e => console.log(`    ${e}`));
  }

  if (recordRows.length === 0) {
    console.log('  No valid record rows to import.');
    return { recordsCreated: 0, evidencedByCreated: 0 };
  }

  // Batch-upsert Record nodes (UNWIND for performance)
  const BATCH_SIZE = 500;
  let recordsCreated = 0;

  for (let i = 0; i < recordRows.length; i += BATCH_SIZE) {
    const batch = recordRows.slice(i, i + BATCH_SIZE);
    await runQuery(session, `
      UNWIND $batch AS row
      MERGE (r:Record {id: row.id})
      SET r.ark          = row.ark,
          r.type         = row.type,
          r.provider     = row.provider,
          r.evidenceClass = row.evidenceClass,
          r.collection   = row.collection,
          r.year         = row.year,
          r.country      = row.country,
          r.tier         = row.tier,
          r.place        = row.place,
          r.ingested     = row.ingested,
          r.participants = row.participants
    `, { batch });
    recordsCreated += batch.length;
    process.stdout.write(`  Records upserted: ${recordsCreated}/${recordRows.length}\r`);
  }
  console.log(`  Record nodes created/updated: ${recordsCreated}          `);

  // Batch-create EVIDENCED_BY relationships
  let evidencedByCreated = 0;

  for (let i = 0; i < evidencedByRows.length; i += BATCH_SIZE) {
    const batch = evidencedByRows.slice(i, i + BATCH_SIZE);
    await runQuery(session, `
      UNWIND $batch AS row
      MATCH (p:Person {slug: row.slug})
      MATCH (r:Record {id: row.recordId})
      MERGE (p)-[e:EVIDENCED_BY {role: coalesce(row.role, 'unknown')}]->(r)
      SET e.age        = row.age,
          e.occupation = row.occupation,
          e.birthplace = row.birthplace
    `, { batch });
    evidencedByCreated += batch.length;
    process.stdout.write(`  EVIDENCED_BY edges: ${evidencedByCreated}/${evidencedByRows.length}\r`);
  }
  console.log(`  EVIDENCED_BY relationships created: ${evidencedByCreated}          `);

  return { recordsCreated, evidencedByCreated };
}

// --- Main ---

async function main() {
  console.log('==============================================');
  console.log('  Neo4j Rebuild from Verified Nodes (YAML FM)');
  console.log('==============================================\n');

  if (DRY_RUN) console.log('MODE: DRY RUN (no database writes)\n');
  else if (CLEAR_DB) console.log('MODE: FULL REBUILD (--clear)\n');
  else console.log('MODE: INCREMENTAL (use --clear for full rebuild)\n');

  // Pre-rebuild validation gate
  if (!SKIP_VALIDATION && !DRY_RUN) {
    console.log('Running pre-rebuild validation...');
    try {
      const validatorPath = join(import.meta.dirname, 'validate_genealogy.mjs');
      execSync(`node "${validatorPath}"`, { stdio: 'pipe' });
      console.log('Validation passed.\n');
    } catch (err) {
      const output = err.stdout?.toString() || '';
      const stderr = err.stderr?.toString() || '';
      // Extract critical count from output
      const criticalMatch = output.match(/CRITICAL:\s+(\d+)/);
      const criticalCount = criticalMatch ? parseInt(criticalMatch[1]) : 'unknown';
      console.error('\n!! VALIDATION FAILED !!');
      console.error(`Found ${criticalCount} critical issues.`);
      console.error('Fix critical issues before rebuilding, or use --skip-validation to bypass.');
      if (stderr) console.error(stderr);
      process.exit(1);
    }
  } else if (SKIP_VALIDATION) {
    console.log('Skipping pre-rebuild validation (--skip-validation).\n');
  }

  // Step 1: Parse all YAML frontmatter files
  console.log(`Parsing verified nodes from: ${VERIFIED_NODES_DIR}\n`);
  const files = readdirSync(VERIFIED_NODES_DIR).filter(f => f.endsWith('.md') && !f.startsWith('_'));
  console.log(`Found ${files.length} markdown files.`);

  const nodes = [];
  const crossRefs = [];
  const errors = [];

  for (const file of files) {
    try {
      const node = parseVerifiedNode(join(VERIFIED_NODES_DIR, file));
      if (!node) continue;
      if (node.isCrossRef) {
        crossRefs.push(node);
      } else {
        nodes.push(node);
      }
    } catch (err) {
      errors.push({ file, error: err.message });
    }
  }

  const allNodes = [...nodes, ...crossRefs];
  const nodeMap = new Map(allNodes.map(n => [n.slug, n]));

  // Count relationships
  let parentLinks = 0, spouseLinks = 0, childLinks = 0, discoveredLinks = 0;
  for (const node of allNodes) {
    if (node.fatherSlug && nodeMap.has(node.fatherSlug)) parentLinks++;
    if (node.motherSlug && nodeMap.has(node.motherSlug)) parentLinks++;
    for (const s of node.spouseSlugs) if (nodeMap.has(s)) spouseLinks++;
    for (const c of node.childSlugs) if (nodeMap.has(c)) childLinks++;
    for (const d of (node.discoveredFrom || [])) if (d.personSlug && nodeMap.has(d.personSlug)) discoveredLinks++;
  }

  // Stats
  const withBirth = nodes.filter(n => n.birthYear).length;
  const withOcc = nodes.filter(n => n.occupations.length > 0).length;
  const withEvents = nodes.filter(n => n.lifeEvents.length > 0).length;
  const withBio = nodes.filter(n => n.biography).length;
  const withCountry = nodes.filter(n => n.originCountry).length;
  const totalEvents = nodes.reduce((sum, n) => sum + n.lifeEvents.length, 0);

  console.log(`\nParsed: ${nodes.length} nodes, ${crossRefs.length} cross-references`);
  console.log(`\nRelationships (slug → exists in tree):`);
  console.log(`  Parent links: ${parentLinks}`);
  console.log(`  Spouse links: ${spouseLinks}`);
  console.log(`  Children links: ${childLinks}`);
  console.log(`  "Discovered in finding" links: ${discoveredLinks}`);
  console.log(`\nData richness:`);
  console.log(`  With birth year: ${withBirth}`);
  console.log(`  With origin country: ${withCountry}`);
  console.log(`  With biography: ${withBio}`);
  console.log(`  With occupations: ${withOcc}`);
  console.log(`  With life events: ${withEvents} (${totalEvents} total events)`);

  if (errors.length > 0) {
    console.log(`\nParse errors: ${errors.length}`);
    errors.forEach(e => console.log(`  ${e.file}: ${e.error}`));
  }

  if (DRY_RUN) {
    console.log('\nDry run complete. No database changes.');
    return;
  }

  // Step 2: Write to Neo4j
  console.log('\nConnecting to Neo4j...');
  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  const session = driver.session();

  try {
    await driver.verifyConnectivity();
    console.log('Connected.\n');

    if (CLEAR_DB) {
      await clearDatabase(session);
    }

    await createIndexes(session);
    await createTreeNode(session);

    // Create person nodes
    console.log(`Creating ${nodes.length} person nodes...`);
    let created = 0;
    for (const node of nodes) {
      await upsertPerson(session, node);
      created++;
      if (created % 50 === 0) process.stdout.write(`  ${created}/${nodes.length}\r`);
    }
    console.log(`  Created/updated ${created} person nodes.`);

    // Cross-ref nodes
    console.log(`Creating ${crossRefs.length} cross-reference nodes...`);
    for (const ref of crossRefs) {
      await upsertPerson(session, ref);
    }

    // Create relationships
    console.log('\nCreating relationships...');
    const relStats = await createRelationships(session, allNodes, nodeMap);
    console.log(`  PARENT_OF/CHILD_OF edges: ${relStats.parentOf}`);
    console.log(`  SPOUSE_OF edges: ${relStats.spouseOf}`);
    console.log(`  From "Discovered in finding": ${relStats.discoveredRels}`);
    console.log(`  SIBLING_OF edges (explicit): ${relStats.siblingOf}`);

    // Infer SIBLING_OF from shared parents
    const inferredSibResult = await runQuery(session, `
      MATCH (a:Person)-[:CHILD_OF]->(parent:Person)<-[:CHILD_OF]-(b:Person)
      WHERE a.id < b.id AND NOT (a)-[:SIBLING_OF]-(b)
      MERGE (a)-[:SIBLING_OF]->(b)
      MERGE (b)-[:SIBLING_OF]->(a)
      RETURN count(*) as inferred
    `, {});
    const inferredSiblings = inferredSibResult.records[0]?.get('inferred')?.toNumber?.() ?? 0;
    console.log(`  SIBLING_OF edges (inferred from shared parents): ${inferredSiblings}`);

    // ================================================================
    // Phase 4: Load places.json and update Place node coordinates
    // ================================================================
    console.log('\n--- Phase 4: Geocode Place nodes from places.json ---');
    if (existsSync(PLACES_PATH) && existsSync(ALIASES_PATH)) {
      const placesJson = JSON.parse(readFileSync(PLACES_PATH, 'utf8'));
      const aliasMap = JSON.parse(readFileSync(ALIASES_PATH, 'utf8'));

      // Strip metadata keys from places.json
      const placesData = {};
      for (const [key, value] of Object.entries(placesJson)) {
        if (!key.startsWith('_')) placesData[key] = value;
      }

      // Build a reverse lookup: place name → places.json entry (via alias map)
      // The alias map keys are raw place strings, values are canonical IDs
      const placeNameToEntry = new Map();
      for (const [rawStr, canonicalId] of Object.entries(aliasMap)) {
        if (placesData[canonicalId]) {
          placeNameToEntry.set(rawStr, placesData[canonicalId]);
        }
      }

      // Get all Place nodes from Neo4j
      const allPlacesResult = await runQuery(session, 'MATCH (pl:Place) RETURN pl.name as name');
      const placeNames = allPlacesResult.records.map(r => r.get('name'));

      let geocoded = 0;
      let ungeocoded = 0;

      for (const placeName of placeNames) {
        let entry = placeNameToEntry.get(placeName);
        // Fallback: strip parenthetical qualifiers and try again
        // Handles cases like "Los Angeles County, California (South Pasadena area)"
        if (!entry) {
          const stripped = placeName.replace(/\s*\([^)]+\)\s*$/, '').trim();
          if (stripped !== placeName) {
            entry = placeNameToEntry.get(stripped);
          }
        }
        if (entry && entry.lat != null && entry.lng != null) {
          await runQuery(session, `
            MATCH (pl:Place {name: $placeName})
            SET pl.latitude = $lat, pl.longitude = $lng,
                pl.isApproximate = $isApproximate, pl.precision = $precision
          `, {
            placeName,
            lat: entry.lat,
            lng: entry.lng,
            isApproximate: entry.isApproximate ?? false,
            precision: entry.precision || 'exact',
          });
          geocoded++;
        } else {
          ungeocoded++;
        }
      }

      console.log(`  Place nodes geocoded: ${geocoded}`);
      console.log(`  Place nodes without coordinates: ${ungeocoded}`);
    } else {
      console.log('  WARNING: places.json or place-aliases.json not found. Skipping geocoding.');
      console.log(`    Expected: ${PLACES_PATH}`);
      console.log(`    Expected: ${ALIASES_PATH}`);
    }

    // ================================================================
    // Phase 5: Create marriage Place nodes and MARRIED_AT relationships
    // ================================================================
    console.log('\n--- Phase 5: Marriage places + MARRIED_AT relationships ---');
    let marriagePlaces = 0;
    let marriageRels = 0;

    // Load places data again if available (for coordinate enrichment)
    let placesDataForMarriage = {};
    let aliasMapForMarriage = {};
    if (existsSync(PLACES_PATH) && existsSync(ALIASES_PATH)) {
      const pj = JSON.parse(readFileSync(PLACES_PATH, 'utf8'));
      for (const [key, value] of Object.entries(pj)) {
        if (!key.startsWith('_')) placesDataForMarriage[key] = value;
      }
      aliasMapForMarriage = JSON.parse(readFileSync(ALIASES_PATH, 'utf8'));
    }

    for (const node of allNodes) {
      if (node.isCrossRef) continue;

      for (const spouseEntry of (node.spouseEntries || [])) {
        if (!spouseEntry.marriage_place) continue;

        const marriagePlace = spouseEntry.marriage_place;
        const marriageDate = spouseEntry.marriage_date || '';
        const marriageYear = extractYear(marriageDate);
        const placeCountry = inferCountry(marriagePlace, { format: 'name' });

        // Look up coordinates from places.json via alias map
        const canonicalId = aliasMapForMarriage[marriagePlace];
        const placeEntry = canonicalId ? placesDataForMarriage[canonicalId] : null;
        const lat = placeEntry?.lat ?? null;
        const lng = placeEntry?.lng ?? null;
        const isApproximate = placeEntry?.isApproximate ?? false;
        const precision = placeEntry?.precision || 'exact';

        // MERGE the Place node with coordinates + approximate metadata
        if (lat != null && lng != null) {
          await runQuery(session, `
            MERGE (pl:Place {name: $marriagePlace})
            ON CREATE SET pl.country = $country, pl.latitude = $lat, pl.longitude = $lng,
                          pl.isApproximate = $isApproximate, pl.precision = $precision
            ON MATCH SET pl.latitude = coalesce(pl.latitude, $lat), pl.longitude = coalesce(pl.longitude, $lng),
                         pl.isApproximate = $isApproximate, pl.precision = $precision
          `, {
            marriagePlace,
            country: placeCountry,
            lat,
            lng,
            isApproximate,
            precision,
          });
        } else {
          await runQuery(session, `
            MERGE (pl:Place {name: $marriagePlace})
            ON CREATE SET pl.country = $country, pl.isApproximate = $isApproximate, pl.precision = $precision
          `, {
            marriagePlace,
            country: placeCountry,
            isApproximate,
            precision,
          });
        }
        marriagePlaces++;

        // Create MARRIED_AT relationship from this person to the Place
        // Use CREATE (not MERGE) + spouseSlug to preserve same-place remarriages
        const spouseSlug = spouseEntry.slug || '';
        await runQuery(session, `
          MATCH (p:Person {id: $personId})
          MATCH (pl:Place {name: $marriagePlace})
          CREATE (p)-[r:MARRIED_AT {spouseSlug: $spouseSlug}]->(pl)
          SET r.marriageDate = $marriageDate, r.marriageYear = $marriageYear, r.source = $source
        `, {
          personId: node.slug,
          marriagePlace,
          marriageDate,
          marriageYear: marriageYear ? neo4j.int(marriageYear) : null,
          source: '',
          spouseSlug,
        });
        marriageRels++;
      }
    }

    console.log(`  Marriage Place nodes created/updated: ${marriagePlaces}`);
    console.log(`  MARRIED_AT relationships: ${marriageRels}`);

    // ================================================================
    // Phase 6: Import ContextualMedia nodes with prune/upsert
    // ================================================================
    console.log('\n--- Phase 6: Contextual media import ---');
    if (existsSync(CONTEXTUAL_MEDIA_DIR)) {
      const cmFiles = readdirSync(CONTEXTUAL_MEDIA_DIR).filter(f => f.endsWith('.json'));

      if (cmFiles.length === 0) {
        console.log('  No contextual media JSON files found. Skipping.');
      } else {
        // Load places data for coordinate enrichment
        let cmPlacesData = {};
        if (existsSync(PLACES_PATH)) {
          const pj = JSON.parse(readFileSync(PLACES_PATH, 'utf8'));
          for (const [key, value] of Object.entries(pj)) {
            if (!key.startsWith('_')) cmPlacesData[key] = value;
          }
        }

        const importedPersonIds = [];
        let cmNodesCreated = 0;
        let cmPersonsProcessed = 0;

        for (const file of cmFiles) {
          const filePath = join(CONTEXTUAL_MEDIA_DIR, file);
          let cmData;
          try {
            cmData = JSON.parse(readFileSync(filePath, 'utf8'));
          } catch (err) {
            console.error(`  ERROR parsing ${file}: ${err.message}`);
            continue;
          }

          const personId = cmData.personId;
          if (!personId) continue;

          importedPersonIds.push(personId);

          // Step 1: Delete existing ContextualMedia for this person
          await runQuery(session, `
            MATCH (p:Person {id: $id})-[:HAS_CONTEXT]->(cm:ContextualMedia)
            DETACH DELETE cm
          `, { id: personId });

          // Step 2: Create new ContextualMedia nodes from JSON items
          for (const item of (cmData.items || [])) {
            // Resolve canonicalPlaceId to enrichment data from places.json
            const placeEntry = item.canonicalPlaceId ? cmPlacesData[item.canonicalPlaceId] : null;

            // Build the full set of properties
            const props = {
              itemId: item.id || '',
              type: item.type || '',
              name: item.name || '',
              relevance: item.relevance || '',
              badge: item.badge || '',
              featured: item.featured || false,
              year: item.year || '',
              findagraveUrl: item.findagraveUrl || '',
            };

            // Wikimedia properties (from item or from places.json enrichment)
            const wikimedia = item.wikimedia || placeEntry?.wikimedia || null;
            if (wikimedia) {
              props.wikimediaFileTitle = wikimedia.fileTitle || '';
              props.wikimediaImageUrl = wikimedia.imageUrl || '';
              props.wikimediaThumbnailUrl = wikimedia.thumbnailUrl || '';
              props.wikimediaAttribution = wikimedia.attribution || '';
              props.wikimediaLicense = wikimedia.license || '';
            }

            // Wikipedia properties (from item or from places.json enrichment)
            const wikipedia = item.wikipedia || placeEntry?.wikipedia || null;
            if (wikipedia) {
              props.wikipediaUrl = wikipedia.url || '';
              props.wikipediaSummary = wikipedia.summary || '';
              props.wikipediaTitle = wikipedia.title || '';
            }

            // Coordinates and Google Maps (from item, or from places.json enrichment)
            if (item.lat != null) props.lat = item.lat;
            else if (placeEntry?.lat != null) props.lat = placeEntry.lat;

            if (item.lng != null) props.lng = item.lng;
            else if (placeEntry?.lng != null) props.lng = placeEntry.lng;

            const googleMaps = item.googleMaps || placeEntry?.googleMaps || null;
            if (googleMaps) {
              props.googleMapsUrl = googleMaps.url || '';
              props.googleMapsEmbedUrl = googleMaps.embedUrl || '';
            }

            // Step 3: Create ContextualMedia node and HAS_CONTEXT relationship
            await runQuery(session, `
              MATCH (p:Person {id: $personId})
              CREATE (cm:ContextualMedia)
              SET cm += $props
              CREATE (p)-[:HAS_CONTEXT]->(cm)
            `, {
              personId,
              props,
            });

            cmNodesCreated++;
          }

          cmPersonsProcessed++;
          if (cmPersonsProcessed % 100 === 0) {
            process.stdout.write(`  Processed ${cmPersonsProcessed}/${cmFiles.length} people\r`);
          }
        }

        // Manifest-based cleanup: remove ContextualMedia for people not in the import set
        if (importedPersonIds.length > 0) {
          const cleanupResult = await runQuery(session, `
            MATCH (p:Person)-[:HAS_CONTEXT]->(cm:ContextualMedia)
            WHERE NOT p.id IN $importedPersonIds
            DETACH DELETE cm
            RETURN count(cm) as removed
          `, { importedPersonIds });
          const removed = cleanupResult.records[0]?.get('removed')?.toNumber?.() ?? 0;
          if (removed > 0) {
            console.log(`  Cleaned up ${removed} orphaned ContextualMedia nodes`);
          }
        }

        console.log(`  Contextual media: ${cmPersonsProcessed} people, ${cmNodesCreated} items created`);
      }
    } else {
      console.log('  WARNING: data/contextual_media/ directory not found. Skipping.');
      console.log(`    Expected: ${CONTEXTUAL_MEDIA_DIR}`);
    }

    // ================================================================
    // Phase 7: Import enrichment scores from audit
    // ================================================================
    console.log('\n--- Phase 7: Enrichment scores import ---');
    if (existsSync(ENRICHMENT_AUDIT_PATH)) {
      let auditData;
      try {
        auditData = JSON.parse(readFileSync(ENRICHMENT_AUDIT_PATH, 'utf8'));
      } catch (err) {
        console.log(`  WARNING: Could not parse enrichment_audit.json: ${err.message}`);
        auditData = null;
      }

      if (auditData && Array.isArray(auditData.people)) {
        const auditPeople = auditData.people;
        let scored = 0;
        const tierCounts = { deep_verified: 0, verified: 0, partial: 0, stub: 0 };

        for (const entry of auditPeople) {
          if (!entry.slug) continue;
          if (!nodeMap.has(entry.slug)) continue;

          const completenessScore = Math.round(entry.completeness?.score ?? 0);
          const researchScore = Math.round(entry.research?.score ?? 0);
          const validationStatus = entry.validation || 'pass';

          // Compute completeness_tier from completenessScore
          let completeness_tier;
          if (completenessScore >= 90) completeness_tier = 'deep_verified';
          else if (completenessScore >= 70) completeness_tier = 'verified';
          else if (completenessScore >= 40) completeness_tier = 'partial';
          else completeness_tier = 'stub';

          tierCounts[completeness_tier]++;

          await runQuery(session, `
            MATCH (p:Person {slug: $slug})
            SET p.completenessScore = $completenessScore,
                p.researchScore = $researchScore,
                p.validationStatus = $validationStatus,
                p.completeness_tier = $completeness_tier
          `, {
            slug: entry.slug,
            completenessScore: neo4j.int(completenessScore),
            researchScore: neo4j.int(researchScore),
            validationStatus,
            completeness_tier,
          });

          scored++;
        }

        console.log(`  People scored: ${scored} / ${nodes.length}`);
        console.log(`  Tier distribution:`);
        console.log(`    deep_verified (>=90): ${tierCounts.deep_verified}`);
        console.log(`    verified (>=70):      ${tierCounts.verified}`);
        console.log(`    partial (>=40):       ${tierCounts.partial}`);
        console.log(`    stub (<40):           ${tierCounts.stub}`);
      } else {
        console.log('  WARNING: enrichment_audit.json has unexpected format. Skipping scores.');
      }
    } else {
      console.log('  WARNING: data/enrichment_audit.json not found. Skipping score import.');
      console.log('    Run: node scripts/compute-enrichment-audit.mjs to generate it.');
    }

    // ================================================================
    // Phase 8: Import Record nodes and EVIDENCED_BY relationships
    // ================================================================
    console.log('\n--- Phase 8: Record nodes + EVIDENCED_BY relationships ---');
    const recordStats = await loadRecordNodes(session);

    // Final stats
    const result = await runQuery(session, `
      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
      OPTIONAL MATCH (p)-[r:PARENT_OF|CHILD_OF|SPOUSE_OF|SIBLING_OF|RELATIVE_OF]-()
      WITH count(DISTINCT p) as people, count(DISTINCT r) as rels
      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(orphan:Person)
      WHERE NOT (orphan)-[:PARENT_OF]-()
        AND NOT (orphan)-[:CHILD_OF]-()
        AND NOT (orphan)-[:SPOUSE_OF]-()
        AND NOT (orphan)-[:SIBLING_OF]-()
        AND NOT (orphan)-[:RELATIVE_OF]-()
      RETURN people, rels, count(orphan) as orphans
    `, { treeId: TREE_ID });

    const placeResult = await runQuery(session, 'MATCH (pl:Place) RETURN count(pl) as places');
    const places = placeResult.records[0]?.get('places')?.toNumber?.() ?? 0;
    const geocodedPlaceResult = await runQuery(session, 'MATCH (pl:Place) WHERE pl.latitude IS NOT NULL RETURN count(pl) as geocoded');
    const geocodedPlaces = geocodedPlaceResult.records[0]?.get('geocoded')?.toNumber?.() ?? 0;
    const lifeEvtResult = await runQuery(session, 'MATCH (e:LifeEvent) RETURN count(e) as events');
    const lifeEvents = lifeEvtResult.records[0]?.get('events')?.toNumber?.() ?? 0;
    const marriedAtResult = await runQuery(session, 'MATCH ()-[r:MARRIED_AT]->() RETURN count(r) as rels');
    const marriedAtRels = marriedAtResult.records[0]?.get('rels')?.toNumber?.() ?? 0;
    const cmResult = await runQuery(session, 'MATCH (cm:ContextualMedia) RETURN count(cm) as items');
    const cmItems = cmResult.records[0]?.get('items')?.toNumber?.() ?? 0;
    const recordResult = await runQuery(session, 'MATCH (r:Record) RETURN count(r) as records');
    const recordCount = recordResult.records[0]?.get('records')?.toNumber?.() ?? 0;
    const evidencedByResult = await runQuery(session, 'MATCH ()-[e:EVIDENCED_BY]->() RETURN count(e) as rels');
    const evidencedByCount = evidencedByResult.records[0]?.get('rels')?.toNumber?.() ?? 0;

    const record = result.records[0];
    const people = record?.get('people')?.toNumber?.() ?? 0;
    const rels = record?.get('rels')?.toNumber?.() ?? 0;
    const orphans = record?.get('orphans')?.toNumber?.() ?? 0;

    console.log('\n==============================================');
    console.log('  Rebuild Complete');
    console.log('==============================================\n');
    console.log(`  People: ${people}`);
    console.log(`  Relationships: ${rels}`);
    console.log(`  Places: ${places} (${geocodedPlaces} geocoded)`);
    console.log(`  Life Events: ${lifeEvents}`);
    console.log(`  MARRIED_AT: ${marriedAtRels}`);
    console.log(`  ContextualMedia: ${cmItems}`);
    console.log(`  Records: ${recordCount}`);
    console.log(`  EVIDENCED_BY: ${evidencedByCount}`);
    console.log(`  Orphans: ${orphans} (${people > 0 ? ((orphans / people) * 100).toFixed(1) : 0}%)`);

  } finally {
    await session.close();
    await driver.close();
    console.log('\nDone.');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
