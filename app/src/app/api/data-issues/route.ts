import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/neo4j/client';
import { siteConfig } from '@/lib/siteConfig';

const DEFAULT_TREE_ID = siteConfig.defaultTreeId;

interface DataIssue {
  id: string;
  type: 'error' | 'warning' | 'info';
  category: string;
  personId: string;
  personName: string;
  description: string;
  details?: string;
  suggestion?: string;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const treeId = searchParams.get('treeId') || DEFAULT_TREE_ID;

    const issues: DataIssue[] = [];

    // Query 1: Timeline/relationship issues (errors + warnings) using UNION
    const timelineIssues = await executeQuery<{
      id: string;
      name: string;
      issueType: string;
      birthYear: number | null;
      deathYear: number | null;
      parentId: string | null;
      parentName: string | null;
      parentType: string | null;
      age: number | null;
    }>(
      `
      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
      WHERE p.birthYear IS NOT NULL AND p.deathYear IS NOT NULL AND p.deathYear < p.birthYear
      RETURN p.id as id, p.fullName as name, 'death-before-birth' as issueType,
             p.birthYear as birthYear, p.deathYear as deathYear, null as parentId, null as parentName, null as parentType, null as age

      UNION ALL

      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(parent:Person)-[:PARENT_OF]->(child:Person)
      WHERE parent.deathYear IS NOT NULL AND child.birthYear IS NOT NULL AND child.birthYear > parent.deathYear
      RETURN child.id as id, child.fullName as name, 'child-after-parent-death' as issueType,
             child.birthYear as birthYear, parent.deathYear as deathYear, parent.id as parentId, parent.fullName as parentName,
             CASE WHEN parent.sex = 'M' THEN 'father' ELSE 'mother' END as parentType, null as age

      UNION ALL

      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(parent:Person)-[:PARENT_OF]->(p:Person)
      WHERE p.birthYear IS NOT NULL AND parent.birthYear IS NOT NULL AND p.birthYear <= parent.birthYear
      RETURN p.id as id, p.fullName as name, 'birth-before-parent' as issueType,
             p.birthYear as birthYear, parent.birthYear as deathYear, parent.id as parentId, parent.fullName as parentName,
             CASE WHEN parent.sex = 'M' THEN 'father' ELSE 'mother' END as parentType, null as age

      UNION ALL

      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(parent:Person)-[:PARENT_OF]->(p:Person)
      WHERE p.birthYear IS NOT NULL AND parent.birthYear IS NOT NULL
        AND (p.birthYear - parent.birthYear) > 0 AND (p.birthYear - parent.birthYear) < 12
      RETURN p.id as id, p.fullName as name, 'parent-too-young' as issueType,
             p.birthYear as birthYear, parent.birthYear as deathYear, parent.id as parentId, parent.fullName as parentName,
             CASE WHEN parent.sex = 'M' THEN 'Father' ELSE 'Mother' END as parentType, p.birthYear - parent.birthYear as age

      UNION ALL

      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(mother:Person)-[:PARENT_OF]->(p:Person)
      WHERE mother.sex = 'F' AND p.birthYear IS NOT NULL AND mother.birthYear IS NOT NULL
        AND (p.birthYear - mother.birthYear) > 50
      RETURN p.id as id, p.fullName as name, 'mother-too-old' as issueType,
             p.birthYear as birthYear, mother.birthYear as deathYear, mother.id as parentId, mother.fullName as parentName,
             'Mother' as parentType, p.birthYear - mother.birthYear as age

      UNION ALL

      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
      WHERE p.birthYear IS NOT NULL AND p.deathYear IS NOT NULL AND (p.deathYear - p.birthYear) > 110
      RETURN p.id as id, p.fullName as name, 'very-old' as issueType,
             p.birthYear as birthYear, p.deathYear as deathYear, null as parentId, null as parentName, null as parentType,
             p.deathYear - p.birthYear as age
      `,
      { treeId }
    );

    // Process timeline issues
    timelineIssues.forEach((r) => {
      switch (r.issueType) {
        case 'death-before-birth':
          issues.push({
            id: `${r.id}-death-before-birth`,
            type: 'error',
            category: 'Timeline Impossible',
            personId: r.id,
            personName: r.name,
            description: `Death (${r.deathYear}) is before birth (${r.birthYear})`,
            suggestion: 'One of these dates is incorrect. Check source documents.',
          });
          break;
        case 'child-after-parent-death':
          issues.push({
            id: `${r.parentId}-child-after-death-${r.id}`,
            type: 'error',
            category: 'Timeline Impossible',
            personId: r.parentId!,
            personName: r.parentName!,
            description: `Child "${r.name}" born ${r.birthYear} after ${r.parentName}'s death in ${r.deathYear}`,
            details: `${r.birthYear! - r.deathYear!} years after parent's death`,
            suggestion: 'This child may actually be a grandchild, or there is an error in birth/death dates.',
          });
          break;
        case 'birth-before-parent':
          issues.push({
            id: `${r.id}-born-before-${r.parentType}-${r.parentId ?? 'unknown'}`,
            type: 'error',
            category: 'Timeline Impossible',
            personId: r.id,
            personName: r.name,
            description: `Born in ${r.birthYear}, same year or before ${r.parentType} ${r.parentName} (${r.deathYear})`,
            suggestion: 'Check birth years for both individuals.',
          });
          break;
        case 'parent-too-young':
          issues.push({
            id: `${r.id}-${r.parentType!.toLowerCase()}-too-young`,
            type: 'warning',
            category: 'Unlikely Age',
            personId: r.id,
            personName: r.name,
            description: `${r.parentType} ${r.parentName} would have been ${r.age} at birth`,
            suggestion: 'Verify relationship or check birth years.',
          });
          break;
        case 'mother-too-old':
          issues.push({
            id: `${r.id}-mother-too-old`,
            type: 'warning',
            category: 'Unlikely Age',
            personId: r.id,
            personName: r.name,
            description: `Mother ${r.parentName} would have been ${r.age} at birth`,
            suggestion: 'Mother over 50 at birth is unusual. Verify relationship.',
          });
          break;
        case 'very-old':
          issues.push({
            id: `${r.id}-very-old`,
            type: 'warning',
            category: 'Unlikely Age',
            personId: r.id,
            personName: r.name,
            description: `Lived to ${r.age} years old (${r.birthYear}-${r.deathYear})`,
            suggestion: 'Ages over 110 are extremely rare. Verify dates.',
          });
          break;
      }
    });

    // Query 2: Missing data issues (info)
    const missingDataIssues = await executeQuery<{
      id: string;
      name: string;
      issueType: string;
      birthYear: number | null;
    }>(
      `
      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
      WHERE (p.birthYear IS NULL AND p.isLiving = false)
         OR (p.birthYear IS NOT NULL AND p.birthYear < 1920 AND p.deathYear IS NULL AND p.isLiving = false)
      RETURN p.id as id, p.fullName as name,
             CASE WHEN p.birthYear IS NULL THEN 'missing-birth' ELSE 'missing-death' END as issueType,
             p.birthYear as birthYear
      LIMIT 100
      `,
      { treeId }
    );

    missingDataIssues.forEach((p) => {
      if (p.issueType === 'missing-birth') {
        issues.push({
          id: `${p.id}-no-birth`,
          type: 'info',
          category: 'Missing Data',
          personId: p.id,
          personName: p.name,
          description: 'No birth year recorded',
          suggestion: 'Research census records, vital records, or family documents.',
        });
      } else {
        issues.push({
          id: `${p.id}-no-death`,
          type: 'info',
          category: 'Missing Data',
          personId: p.id,
          personName: p.name,
          description: `No death date for person born in ${p.birthYear}`,
          suggestion: 'Research death records, obituaries, or cemetery records.',
        });
      }
    });

    // Sort by severity
    issues.sort((a, b) => {
      const order = { error: 0, warning: 1, info: 2 };
      return order[a.type] - order[b.type];
    });

    return NextResponse.json({
      count: issues.length,
      issues,
    });
  } catch (error) {
    console.error('Error analyzing data issues:', error);
    return NextResponse.json({ error: 'Failed to analyze data' }, { status: 500 });
  }
}
