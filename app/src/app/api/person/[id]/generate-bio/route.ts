import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getPersonById, getEnrichedPerson } from '@/lib/neo4j';
import { siteConfig } from '@/lib/siteConfig';

const DEFAULT_TREE_ID = siteConfig.defaultTreeId;

function buildPersonDataSection(
  person: NonNullable<Awaited<ReturnType<typeof getPersonById>>>,
  enriched: NonNullable<Awaited<ReturnType<typeof getEnrichedPerson>>>,
): string {
  const sections: string[] = [];

  // Vitals
  sections.push('## Vitals');
  sections.push(`Full Name: ${person.fullName}`);
  if (person.givenName) sections.push(`Given Name: ${person.givenName}`);
  if (person.surname) sections.push(`Surname: ${person.surname}`);
  if (person.nickname) sections.push(`Nickname: ${person.nickname}`);
  sections.push(`Sex: ${person.sex === 'M' ? 'Male' : person.sex === 'F' ? 'Female' : 'Unknown'}`);
  if (person.birthYear) sections.push(`Birth Year: ${person.birthYear}`);
  if (person.birthDate) sections.push(`Birth Date: ${person.birthDate}`);
  if (person.birthPlace || enriched.birthPlaceName) sections.push(`Birth Place: ${enriched.birthPlaceName || person.birthPlace}`);
  if (person.deathYear) sections.push(`Death Year: ${person.deathYear}`);
  if (person.deathDate) sections.push(`Death Date: ${person.deathDate}`);
  if (person.deathPlace || enriched.deathPlaceName) sections.push(`Death Place: ${enriched.deathPlaceName || person.deathPlace}`);
  if (person.isLiving) sections.push(`Status: Living`);

  // Family
  sections.push('\n## Family');
  if (person.father) sections.push(`Father: ${person.father.name}${person.father.birthYear ? ` (b. ${person.father.birthYear})` : ''}`);
  if (person.mother) sections.push(`Mother: ${person.mother.name}${person.mother.birthYear ? ` (b. ${person.mother.birthYear})` : ''}`);
  if (person.spouses?.length) {
    for (const sp of person.spouses) {
      sections.push(`Spouse: ${sp.name}${sp.marriageYear ? `, married ${sp.marriageYear}` : ''}${sp.marriagePlace ? ` in ${sp.marriagePlace}` : ''}`);
    }
  }
  if (person.children?.length) {
    sections.push(`Children (${person.children.length}):`);
    for (const c of person.children) {
      sections.push(`  - ${c.name}${c.birthYear ? ` (b. ${c.birthYear})` : ''}`);
    }
  }
  if (person.siblings?.length) {
    sections.push(`Siblings (${person.siblings.length}):`);
    for (const s of person.siblings) {
      sections.push(`  - ${s.name}${s.birthYear ? ` (b. ${s.birthYear})` : ''}`);
    }
  }

  // Occupations
  if (enriched.occupations?.length) {
    sections.push('\n## Occupations');
    for (const o of enriched.occupations) {
      let line = o.title;
      if (o.fromYear && o.toYear) line += ` (${o.fromYear}–${o.toYear})`;
      else if (o.fromYear) line += ` (from ${o.fromYear})`;
      sections.push(`- ${line}`);
    }
  }

  // Military
  if (enriched.wars?.length) {
    sections.push('\n## Military Service');
    for (const w of enriched.wars) {
      let line = w.name;
      if (w.rank) line += `, rank: ${w.rank}`;
      if (w.unit) line += `, unit: ${w.unit}`;
      sections.push(`- ${line}`);
    }
  }

  // Religion
  if (enriched.religions?.length) {
    sections.push('\n## Religion');
    for (const r of enriched.religions) {
      sections.push(`- ${r.name}${r.convertedYear ? ` (converted ${r.convertedYear})` : ''}`);
    }
  }

  // Ethnicity
  if (enriched.ethnicities?.length) {
    sections.push('\n## Ethnicity');
    for (const e of enriched.ethnicities) {
      sections.push(`- ${e.name}${e.dnaConfirmed ? ' (DNA confirmed)' : ''}`);
    }
  }

  // Legal status
  if (enriched.legalStatus) {
    sections.push('\n## Legal Status');
    sections.push(`- ${enriched.legalStatus.status}${enriched.legalStatus.notes ? `: ${enriched.legalStatus.notes}` : ''}`);
  }

  // Markdown research notes (truncated)
  if (enriched.markdownContent) {
    sections.push('\n## Research Notes (from verified sources)');
    const truncated = enriched.markdownContent.slice(0, 3000);
    sections.push(truncated);
    if (enriched.markdownContent.length > 3000) sections.push('...(truncated)');
  }

  return sections.join('\n');
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const treeId = DEFAULT_TREE_ID;

    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicApiKey) {
      return NextResponse.json(
        { error: 'AI service not configured' },
        { status: 503 }
      );
    }

    // Fetch person data and enriched data in parallel
    const [person, enriched] = await Promise.all([
      getPersonById(id, treeId),
      getEnrichedPerson(id, treeId),
    ]);

    if (!person) {
      return NextResponse.json(
        { error: 'Person not found' },
        { status: 404 }
      );
    }

    if (!enriched) {
      return NextResponse.json(
        { error: 'Enriched data not found' },
        { status: 404 }
      );
    }

    const personDataStr = buildPersonDataSection(person, enriched);

    const systemPrompt = `You are a genealogical biographer for the ${siteConfig.title} project. Your task is to write a narrative biography based strictly on the provided data.

## Style Rules
- Write in third person, past tense
- Aim for 400–800 words (shorter for people with minimal data, longer for well-documented individuals)
- Plain, specific prose that stays factually grounded
- Flowing prose paragraphs — NO bullet points, headers, or markdown formatting
- Use "around [year]" or "records suggest" for uncertain facts
- If data is sparse, write what you can and keep it shorter — do NOT pad with speculation
- Skip missing data gracefully rather than calling attention to it (don't say "no information exists about...")
- Start with birth and early life if supported by the data; end with death or later life only if data supports it
- Only include historical context when it is directly supported by the person's place, dates, or documented circumstances
- Include family connections naturally within the narrative
- Do NOT use atmospheric filler, sentimental framing, or generic scene-setting
- Avoid phrases like "into a world shaped by", "the rhythms of rural life", "hills and valleys", or sweeping migration-language unless the source data explicitly supports it

## Critical Rules
- ONLY state facts present in the provided data — NEVER invent details
- Do NOT include citations, sources, or footnotes
- Do NOT use markdown headers, bold, or bullet points in the output
- Output ONLY the biography text, nothing else`;

    const anthropic = new Anthropic({ apiKey: anthropicApiKey });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6-20250514',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Write a narrative biography for ${person.fullName} based on the following verified data:\n\n${personDataStr}`,
        },
      ],
    });

    let draft = '';
    for (const block of response.content) {
      if (block.type === 'text') {
        draft += block.text;
      }
    }

    return NextResponse.json({
      personId: id,
      personName: person.fullName,
      draft,
      dataUsed: {
        hasFamily: !!(person.father || person.mother || person.spouses?.length || person.children?.length),
        hasOccupations: !!enriched.occupations?.length,
        hasMilitary: !!enriched.wars?.length,
        hasResearchNotes: !!enriched.markdownContent,
        hasBirthPlace: !!(person.birthPlace || enriched.birthPlaceName),
      },
    });
  } catch (error) {
    console.error('Error generating biography:', error);
    return NextResponse.json(
      { error: 'Failed to generate biography' },
      { status: 500 }
    );
  }
}
