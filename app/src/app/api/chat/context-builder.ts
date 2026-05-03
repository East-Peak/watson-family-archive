/**
 * Context Builder — assembles a RetrievedContextBundle and renders it as the
 * structured text block injected into the LLM system prompt.
 */

import type {
  RetrievedPerson,
  RetrievedContextBundle,
  RelationshipPath,
  QueryPlan,
} from './types';

interface ViewerIdentity {
  id: string;
  name: string;
  familyBranch?: string;
}

// ---------------------------------------------------------------------------
// buildContextBundle
// ---------------------------------------------------------------------------

/**
 * Assemble retrieved people and a query plan into a RetrievedContextBundle.
 *
 * Relationship paths are computed for direct relationships (parent, spouse,
 * child) that can be determined from the retrieved data alone. Deeper
 * relationships (e.g. "paternal great-grandfather") would require the full
 * ancestor chain and are not attempted.
 */
export function buildContextBundle(
  people: RetrievedPerson[],
  queryPlan: QueryPlan,
  viewer: ViewerIdentity | null,
): RetrievedContextBundle {
  const relationshipPaths = computeRelationshipPaths(people, viewer);

  return {
    people,
    relationshipPaths,
    queryPlan,
  };
}

// ---------------------------------------------------------------------------
// Relationship path computation
// ---------------------------------------------------------------------------

/**
 * Compute relationship paths between the viewer and each retrieved person
 * using only the data present on the retrieved people (parents, spouse,
 * children arrays). Only direct relationships (1-hop) are computed.
 */
function computeRelationshipPaths(
  people: RetrievedPerson[],
  viewer: ViewerIdentity | null,
): RelationshipPath[] {
  if (!viewer) return [];

  const paths: RelationshipPath[] = [];
  const viewerPerson = people.find(p => p.id === viewer.id);

  for (const person of people) {
    if (person.id === viewer.id) continue;

    // Check if person is a parent of the viewer
    if (viewerPerson?.parents?.some(par => par.id === person.id)) {
      paths.push({
        from: { id: viewer.id, name: viewer.name },
        to: { id: person.id, name: person.fullName },
        description: `${viewer.name}'s parent`,
        hops: 1,
      });
    }

    // Check if person is a spouse of the viewer
    if (viewerPerson?.spouse?.id === person.id) {
      paths.push({
        from: { id: viewer.id, name: viewer.name },
        to: { id: person.id, name: person.fullName },
        description: `${viewer.name}'s spouse`,
        hops: 1,
      });
    }

    // Check if person is a child of the viewer
    if (viewerPerson?.children?.some(ch => ch.id === person.id)) {
      paths.push({
        from: { id: viewer.id, name: viewer.name },
        to: { id: person.id, name: person.fullName },
        description: `${viewer.name}'s child`,
        hops: 1,
      });
    }

    // Check if the viewer is in person's parents (viewer is parent of person)
    if (person.parents?.some(par => par.id === viewer.id)) {
      paths.push({
        from: { id: viewer.id, name: viewer.name },
        to: { id: person.id, name: person.fullName },
        description: `${viewer.name}'s child`,
        hops: 1,
      });
    }
  }

  return paths;
}

// ---------------------------------------------------------------------------
// renderContextBlock
// ---------------------------------------------------------------------------

/**
 * Render a RetrievedContextBundle as the structured text block that gets
 * injected into the LLM system prompt.
 */
export function renderContextBlock(bundle: RetrievedContextBundle): string {
  const { people, relationshipPaths, queryPlan } = bundle;
  const lines: string[] = [];

  // Header
  lines.push(`RETRIEVED CONTEXT (${people.length} people matching your query):`);
  lines.push('');

  // Person entries
  people.forEach((person, index) => {
    lines.push(`${index + 1}. ${person.fullName} [id: ${person.id}]`);

    // Born line
    const bornParts: string[] = [];
    if (person.birthYear != null) bornParts.push(String(person.birthYear));
    if (person.birthPlace) bornParts.push(person.birthPlace);
    if (bornParts.length > 0) {
      lines.push(`   Born: ${bornParts.join(', ')}`);
    }

    // Died line
    const diedParts: string[] = [];
    if (person.deathYear != null) diedParts.push(String(person.deathYear));
    if (person.deathPlace) diedParts.push(person.deathPlace);
    if (diedParts.length > 0) {
      lines.push(`   Died: ${diedParts.join(', ')}`);
    }

    // Parents
    if (person.parents && person.parents.length > 0) {
      const parentNames = person.parents.map((p) => p.name).join(', ');
      lines.push(`   Parents: ${parentNames}`);
    }

    // Spouse
    if (person.spouse) {
      const marriageSuffix =
        person.marriageYear != null ? ` (m. ${person.marriageYear})` : '';
      lines.push(`   Spouse: ${person.spouse.name}${marriageSuffix}`);
    }

    // Occupations
    if (person.occupations && person.occupations.length > 0) {
      lines.push(`   Occupations: ${person.occupations.join(', ')}`);
    }

    // Life events
    if (person.lifeEvents && person.lifeEvents.length > 0) {
      const eventStrings = person.lifeEvents.map((e) => {
        return e.year != null ? `${e.event} (${e.year})` : e.event;
      });
      lines.push(`   Life events: ${eventStrings.join(', ')}`);
    }

    // Records
    if (person.records && person.records.length > 0) {
      const recordStrings = person.records.map((r) => {
        const parts: string[] = [];
        parts.push(r.type);
        parts.push(`— ${r.collection}`);
        if (r.year != null) parts.push(`(${r.year},`);
        if (r.tier) parts.push(`Tier ${r.tier})`);
        // Tidy up if year was added but tier was null
        return parts
          .join(' ')
          .replace(/\($/, '') // remove dangling open-paren
          .trim();
      });
      lines.push(`   Records: ${recordStrings.join('; ')}`);
    }

    lines.push('');
  });

  // Viewer relationship path section (only when viewer-scoped AND paths exist)
  const isViewerScoped =
    queryPlan.searchDomain === 'viewer-ancestors' ||
    queryPlan.anchor.type === 'viewer';

  if (isViewerScoped && relationshipPaths.length > 0) {
    lines.push('VIEWER RELATIONSHIP PATH:');
    for (const path of relationshipPaths) {
      lines.push(`- ${path.from.name} → ${path.description}`);
      lines.push(`  (${path.description})`);
    }
    lines.push('');
  }

  // Footer instruction
  lines.push(
    'You may discuss general history for context, but EVERY claim about',
  );
  lines.push('a specific family member must come from this list.');

  return lines.join('\n');
}
