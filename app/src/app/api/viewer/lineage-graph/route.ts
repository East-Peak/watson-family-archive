import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/neo4j/client';
import { siteConfig } from '@/lib/siteConfig';
import { MAX_ANCESTRY_DEPTH } from '@/lib/neo4j/constants';

const DEFAULT_TREE_ID = siteConfig.defaultTreeId;

interface AncestorRow {
  ancestorId: string;
  depth: number;
  surname: string | null;
  childIds: string[];
}

/**
 * GET /api/viewer/lineage-graph?personId=<root-or-viewer-person-id>
 *
 * Returns the viewer-relative lineage graph using recursive CHILD_OF traversal.
 * Each ancestor includes:
 * - depth: number of CHILD_OF hops from the viewer
 * - parentOf: children of this ancestor who are also in the lineage
 * - lineageLabel: the ancestor's surname
 *
 * Used by generation coloring (Feature 5) and origins view (Feature 6).
 *
 * Security note: `personId` / `viewerId` is a READ-PERSONALIZATION parameter only.
 * It selects WHOSE lineage graph to compute/highlight — it does NOT restrict access.
 * A caller supplying any personId simply receives that person's lineage view (all
 * data is already readable by any authenticated user). Real authz is enforced by:
 *   - The middleware allowlist (controls who can access the app at all), and
 *   - Admin-only write gates (controls who can mutate data).
 * There is no privilege escalation risk from a client supplying a different personId.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const personId = searchParams.get('personId');
    const treeId = searchParams.get('treeId') || DEFAULT_TREE_ID;

    if (!personId) {
      return NextResponse.json(
        { error: 'personId is required' },
        { status: 400 },
      );
    }

    // Recursive CHILD_OF traversal from viewer upward toward ancestors.
    // For each ancestor, we collect the minimum depth (shortest path) and
    // all children of that ancestor who are also in the lineage.
    //
    // In this graph PARENT_OF is parent->child, so walking up follows CHILD_OF
    // (or equivalently, incoming PARENT_OF).
    const results = await executeQuery<AncestorRow>(
      `
      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(viewer:Person {id: $viewerId})
      MATCH path = (viewer)-[:CHILD_OF*0..${MAX_ANCESTRY_DEPTH}]->(ancestor:Person)
      WITH ancestor, min(length(path)) AS depth
      // Find children of this ancestor that are also in the lineage
      OPTIONAL MATCH (ancestor)<-[:CHILD_OF]-(child:Person)
      WHERE EXISTS {
        MATCH (viewer)-[:CHILD_OF*0..${MAX_ANCESTRY_DEPTH}]->(child)
        WHERE viewer.id = $viewerId
      }
      RETURN
        ancestor.id AS ancestorId,
        depth,
        ancestor.surname AS surname,
        collect(DISTINCT child.id) AS childIds
      `,
      { treeId, viewerId: personId },
    );

    const ancestors: Record<
      string,
      { depth: number; parentOf: string[]; lineageLabel: string }
    > = {};

    for (const row of results) {
      ancestors[row.ancestorId] = {
        depth: row.depth,
        parentOf: row.childIds.filter((id) => id !== null),
        lineageLabel: row.surname || '',
      };
    }

    return NextResponse.json({
      viewerId: personId,
      ancestors,
    });
  } catch (error) {
    console.error('Error fetching lineage graph:', error);
    return NextResponse.json(
      { error: 'Failed to fetch lineage graph' },
      { status: 500 },
    );
  }
}
