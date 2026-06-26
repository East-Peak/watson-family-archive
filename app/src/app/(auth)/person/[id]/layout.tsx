import type { Metadata } from 'next';
import { executeQuery } from '@/lib/neo4j/client';
import { siteConfig } from '@/lib/siteConfig';

const TREE_ID = siteConfig.defaultTreeId;

interface PersonMeta {
  fullName: string;
  birthYear: number | null;
  deathYear: number | null;
  birthPlace: string | null;
  surname: string | null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;

  try {
    const results = await executeQuery<PersonMeta>(
      `
      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person {id: $id})
      RETURN p.fullName as fullName, p.birthYear as birthYear,
             p.deathYear as deathYear, p.birthPlace as birthPlace,
             p.surname as surname
      `,
      { treeId: TREE_ID, id },
    );

    const person = results[0];
    if (!person) {
      return { title: 'Person Not Found' };
    }

    const lifespan = [person.birthYear, person.deathYear]
      .filter(Boolean)
      .join('–');
    const title = lifespan
      ? `${person.fullName} (${lifespan})`
      : person.fullName;

    const descParts: string[] = [];
    if (person.birthYear && person.birthPlace) {
      descParts.push(`Born ${person.birthYear} in ${person.birthPlace}`);
    } else if (person.birthYear) {
      descParts.push(`Born ${person.birthYear}`);
    } else if (person.birthPlace) {
      descParts.push(`Born in ${person.birthPlace}`);
    }
    descParts.push(`${siteConfig.title}`);
    const description = descParts.join(' · ');

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: 'profile',
        siteName: siteConfig.title,
      },
      twitter: {
        card: 'summary',
        title,
        description,
      },
    };
  } catch {
    return { title: siteConfig.title };
  }
}

export default function PersonLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
