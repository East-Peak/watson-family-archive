/**
 * Compose a structured story from person data at render time.
 *
 * This is deterministic template composition — not AI. It automatically
 * improves as data is added to Neo4j. Used for bio_tier="structured_only"
 * people who have enough data for a summary but no hand-written narrative.
 */

interface PersonData {
  fullName: string;
  sex?: string;
  birthDate?: string | null;
  birthYear?: number | null;
  birthPlace?: string | null;
  deathDate?: string | null;
  deathYear?: number | null;
  deathPlace?: string | null;
  isLiving?: boolean;
}

interface FamilyData {
  father?: { name: string } | null;
  mother?: { name: string } | null;
  spouses?: Array<{ name: string; marriageYear?: number | null }>;
  children?: Array<{ id: string }>;
}

interface BiographyData {
  occupations?: string[];
  timelineHighlights?: Array<{
    event: string;
    year: number;
    location?: string;
  }>;
}

/**
 * Compose a structured story from person data.
 * Returns an array of paragraph strings ready for rendering.
 */
export function composeStructuredStory(
  person: PersonData,
  family: FamilyData | null,
  biography: BiographyData | null,
): string[] {
  const paragraphs: string[] = [];
  const pronoun =
    person.sex === 'M' ? 'He' : person.sex === 'F' ? 'She' : 'They';
  const possessive =
    pronoun === 'They' ? 'Their' : pronoun === 'He' ? 'His' : 'Her';
  // ── Origin paragraph ──
  const originParts: string[] = [];

  if (person.birthPlace) {
    const dateStr = person.birthDate
      ? ` on ${person.birthDate}`
      : person.birthYear
        ? ` in ${person.birthYear}`
        : '';
    originParts.push(`Born${dateStr} in ${person.birthPlace}.`);
  } else if (person.birthDate || person.birthYear) {
    const dateStr = person.birthDate || String(person.birthYear);
    originParts.push(`Born ${dateStr}.`);
  }

  // Parents
  if (family?.father && family?.mother) {
    const fatherFirst = family.father.name.split(' ')[0];
    const motherFirst = family.mother.name.split(' ')[0];
    const childType =
      person.sex === 'M' ? 'Son' : person.sex === 'F' ? 'Daughter' : 'Child';
    originParts.push(`${childType} of ${fatherFirst} and ${motherFirst}.`);
  } else if (family?.father) {
    originParts.push(
      `${possessive} father was ${family.father.name.split(' ')[0]}.`,
    );
  } else if (family?.mother) {
    originParts.push(
      `${possessive} mother was ${family.mother.name.split(' ')[0]}.`,
    );
  }

  if (originParts.length > 0) {
    paragraphs.push(originParts.join(' '));
  }

  // ── Career paragraph ──
  if (biography?.occupations && biography.occupations.length > 0) {
    const validOccs = biography.occupations.filter(
      (o) =>
        o &&
        o.length > 2 &&
        o.length < 60 &&
        !o.includes('###') &&
        !o.includes('**') &&
        !o.includes('GEDCOM'),
    );
    if (validOccs.length === 1) {
      paragraphs.push(`${pronoun} worked as a ${validOccs[0].toLowerCase()}.`);
    } else if (validOccs.length > 1) {
      const last = validOccs[validOccs.length - 1].toLowerCase();
      const rest = validOccs
        .slice(0, -1)
        .map((o) => o.toLowerCase())
        .join(', ');
      paragraphs.push(`${pronoun} worked as ${rest} and ${last}.`);
    }
  }

  // ── Census appearances ──
  const censusEvents =
    biography?.timelineHighlights?.filter((h) =>
      h.event.toLowerCase().includes('census'),
    ) || [];
  if (censusEvents.length > 0) {
    const years = censusEvents
      .map((e) => e.year)
      .filter(Boolean)
      .sort();
    const locations = [
      ...new Set(censusEvents.map((e) => e.location).filter(Boolean)),
    ];

    if (years.length > 0) {
      const yearStr =
        years.length <= 3
          ? years.join(', ').replace(/,\s([^,]+)$/, ' and $1')
          : `${years[0]} through ${years[years.length - 1]}`;
      const locStr = locations.length > 0 ? ` in ${locations[0]}` : '';
      paragraphs.push(
        `Appears in ${years.length > 1 ? '' : 'the '}${yearStr} census record${years.length > 1 ? 's' : ''}${locStr}.`,
      );
    }
  }

  // ── Family paragraph ──
  const familyParts: string[] = [];
  if (family?.spouses && family.spouses.length > 0) {
    const spouse = family.spouses[0];
    const yearStr = spouse.marriageYear ? ` around ${spouse.marriageYear}` : '';
    familyParts.push(`Married ${spouse.name}${yearStr}.`);
  }
  if (family?.children && family.children.length > 0) {
    const count = family.children.length;
    familyParts.push(
      `Together they had ${count} known ${count === 1 ? 'child' : 'children'}.`,
    );
  }
  if (familyParts.length > 0) {
    paragraphs.push(familyParts.join(' '));
  }

  // ── Death paragraph ──
  if (
    !person.isLiving &&
    (person.deathDate || person.deathYear || person.deathPlace)
  ) {
    const age =
      person.birthYear && person.deathYear
        ? person.deathYear - person.birthYear
        : null;
    const parts: string[] = [];

    if (person.deathPlace) {
      const dateStr = person.deathDate
        ? ` on ${person.deathDate}`
        : person.deathYear
          ? ` in ${person.deathYear}`
          : '';
      parts.push(`Died${dateStr} in ${person.deathPlace}`);
    } else {
      const dateStr = person.deathDate || String(person.deathYear);
      parts.push(`Died ${dateStr}`);
    }

    if (age && age > 0 && age < 130) {
      parts.push(`at the age of ${age}`);
    }

    paragraphs.push(parts.join(', ') + '.');
  }

  return paragraphs;
}
