import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/neo4j/client';
import { siteConfig } from '@/lib/siteConfig';
import { getRecordStats } from '@/lib/neo4j/queries/records';
import { getTreeStats } from '@/lib/neo4j/queries/tree';

const DEFAULT_TREE_ID = siteConfig.defaultTreeId;

interface ViewerStats {
  totalIndividuals: number;
  earliestBirth: number;
  latestBirth: number;
}

interface TreeStats {
  totalIndividuals: number;
  earliestBirth: number | null;
  latestBirth: number | null;
  totalPlaces: number;
  totalCountries: number;
  totalRecords: number;
}

interface SpotlightPerson {
  id: string;
  name: string;
  years: string;
  birthPlace?: string;
  deathPlace?: string;
  tagline: string;
  sex: string;
  birthYear?: number;
  deathYear?: number;
  occupation?: string;
}

interface Story {
  icon: string;
  category: string;
  title: string;
  description: string;
  personId?: string;
  collectionType?: string;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const treeId = searchParams.get('treeId') || DEFAULT_TREE_ID;
    const viewerId = searchParams.get('viewerId') || null;

    // When a viewer is set, scope stats to their direct ancestors.
    // 89 direct ancestors for 9 generations is normal — most of the 2094
    // people in the tree are collateral relatives (siblings, cousins, in-laws).
    const [statsResults, recordStats, treeStatsRaw] = await Promise.all([
      executeQuery<{
        totalIndividuals: number;
        living: number;
        earliestBirth: number;
        latestBirth: number;
      }>(
        viewerId
          ? `
          MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(viewer:Person {id: $viewerId})
          MATCH path = (viewer)-[:CHILD_OF*0..]->(ancestor:Person)
          WITH collect(DISTINCT ancestor) as ancestors
          UNWIND ancestors as p
          WITH
            count(p) as totalIndividuals,
            count(CASE WHEN p.isLiving = true THEN 1 END) as living,
            min(p.birthYear) as earliestBirth,
            max(p.birthYear) as latestBirth
          RETURN totalIndividuals, living, earliestBirth, latestBirth
          `
          : `
          MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
          WITH
            count(p) as totalIndividuals,
            count(CASE WHEN p.isLiving = true THEN 1 END) as living,
            min(p.birthYear) as earliestBirth,
            max(p.birthYear) as latestBirth
          RETURN totalIndividuals, living, earliestBirth, latestBirth
          `,
        viewerId ? { treeId, viewerId } : { treeId },
      ),
      getRecordStats(treeId),
      getTreeStats(treeId),
    ]);

    const viewerStats: ViewerStats | null = viewerId
      ? {
          totalIndividuals: statsResults[0]?.totalIndividuals || 0,
          earliestBirth: statsResults[0]?.earliestBirth || 0,
          latestBirth: statsResults[0]?.latestBirth || 0,
        }
      : null;

    const treeStats: TreeStats = {
      totalIndividuals: treeStatsRaw.personCount,
      earliestBirth: treeStatsRaw.oldestBirthYear,
      latestBirth: treeStatsRaw.newestBirthYear,
      totalPlaces: treeStatsRaw.placeCount,
      totalCountries: treeStatsRaw.countryCount,
      totalRecords: recordStats.totalRecords,
    };

    // Pre-compute viewer's ancestor IDs for all viewer-scoped queries below
    let ancestorIds: string[] | null = null;
    if (viewerId) {
      const ancestorRows = await executeQuery<{ id: string }>(
        `
        MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(viewer:Person {id: $viewerId})
        MATCH path = (viewer)-[:CHILD_OF*0..]->(ancestor:Person)
        RETURN DISTINCT ancestor.id as id
        `,
        { treeId, viewerId },
      );
      ancestorIds = ancestorRows.map((r) => r.id);
    }
    const ancestorFilter = viewerId ? 'AND p.id IN $ancestorIds' : '';
    const storyParams: Record<string, unknown> = viewerId
      ? { treeId, ancestorIds: ancestorIds || [] }
      : { treeId };

    // Get spotlight ancestors + all story counts — every read below is
    // independent of the others, so run them in parallel.
    const [
      spotlightResults,
      colonialResult,
      immigrantResult,
      longLivedResult,
      quakerResult,
      militaryResult,
      englishResult,
      welshResult,
      earliestResult,
    ] = await Promise.all([
      executeQuery<{
        id: string;
        fullName: string;
        sex: string;
        birthYear?: number;
        deathYear?: number;
        birthPlace?: string;
        deathPlace?: string;
        occupation?: string;
      }>(
        `
      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
      WHERE p.isLiving = false
        AND p.birthYear IS NOT NULL
        AND (p.deathYear IS NOT NULL OR p.birthYear < 1900)
        ${ancestorFilter}
      OPTIONAL MATCH (p)-[:HAD_OCCUPATION]->(o:Occupation)
      OPTIONAL MATCH (p)-[:BORN_IN]->(bp:Place)
      OPTIONAL MATCH (p)-[:DIED_IN]->(dp:Place)
      WITH p, o, bp, dp
      ORDER BY rand()
      LIMIT 20
      RETURN
        p.id as id, p.fullName as fullName, p.sex as sex,
        p.birthYear as birthYear, p.deathYear as deathYear,
        COALESCE(bp.name, p.birthPlace) as birthPlace,
        COALESCE(dp.name, p.deathPlace) as deathPlace,
        o.name as occupation
      `,
        viewerId ? { ...storyParams } : { treeId },
      ),
      // Colonial ancestors
      executeQuery<{
        count: number;
        exampleId: string;
      }>(
        `
      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
      WHERE p.birthYear IS NOT NULL AND p.birthYear < 1700 ${ancestorFilter}
      WITH count(p) as count, collect(p.id)[0] as exampleId
      RETURN count, exampleId
      `,
        storyParams,
      ),
      // Immigrants from Europe
      executeQuery<{
        count: number;
        exampleId: string;
      }>(
        `
      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
      WHERE p.birthPlace IS NOT NULL AND p.deathPlace IS NOT NULL ${ancestorFilter}
        AND (p.birthPlace CONTAINS 'England' OR p.birthPlace CONTAINS 'Wales'
             OR p.birthPlace CONTAINS 'Scotland' OR p.birthPlace CONTAINS 'Ireland'
             OR p.birthPlace CONTAINS 'Germany')
        AND (p.deathPlace CONTAINS 'United States' OR p.deathPlace CONTAINS 'America'
             OR p.deathPlace CONTAINS 'USA' OR NOT (p.deathPlace CONTAINS 'England'
             OR p.deathPlace CONTAINS 'Wales' OR p.deathPlace CONTAINS 'Scotland'
             OR p.deathPlace CONTAINS 'Ireland' OR p.deathPlace CONTAINS 'Germany'))
      WITH count(p) as count, collect(p.id)[0] as exampleId
      RETURN count, exampleId
      `,
        storyParams,
      ),
      // Long-lived
      executeQuery<{
        count: number;
        exampleId: string;
      }>(
        `
      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
      WHERE p.birthYear IS NOT NULL AND p.deathYear IS NOT NULL ${ancestorFilter}
        AND (p.deathYear - p.birthYear) >= 90
      WITH count(p) as count, collect(p.id)[0] as exampleId
      RETURN count, exampleId
      `,
        storyParams,
      ),
      // Quakers
      executeQuery<{
        count: number;
        exampleId: string;
      }>(
        `
      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)-[:PRACTICED]->(r:Religion)
      WHERE (toLower(r.name) CONTAINS 'quaker' OR toLower(r.name) CONTAINS 'society of friends') ${ancestorFilter}
      WITH count(DISTINCT p) as count, collect(p.id)[0] as exampleId
      RETURN count, exampleId
      `,
        storyParams,
      ),
      // Military service
      executeQuery<{
        count: number;
        exampleId: string;
      }>(
        `
      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)-[:SERVED_IN]->(w:War)
      WHERE 1=1 ${ancestorFilter}
      WITH count(DISTINCT p) as count, collect(p.id)[0] as exampleId
      RETURN count, exampleId
      `,
        storyParams,
      ),
      // English heritage
      executeQuery<{
        count: number;
        exampleId: string;
      }>(
        `
      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
      WHERE p.birthPlace CONTAINS 'England' ${ancestorFilter}
      WITH count(p) as count, collect(p.id)[0] as exampleId
      RETURN count, exampleId
      `,
        storyParams,
      ),
      // Welsh heritage
      executeQuery<{
        count: number;
        exampleId: string;
      }>(
        `
      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
      WHERE p.birthPlace CONTAINS 'Wales' ${ancestorFilter}
      WITH count(p) as count, collect(p.id)[0] as exampleId
      RETURN count, exampleId
      `,
        storyParams,
      ),
      // Earliest ancestor — scoped to viewer when set
      executeQuery<{
        id: string;
        fullName: string;
        birthYear: number;
      }>(
        `
      MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
      WHERE p.birthYear IS NOT NULL ${ancestorFilter}
      RETURN p.id as id, p.fullName as fullName, p.birthYear as birthYear
      ORDER BY p.birthYear ASC
      LIMIT 1
      `,
        storyParams,
      ),
    ]);

    // Transform spotlight results
    const spotlight: SpotlightPerson[] = spotlightResults.map((p) => {
      let tagline = '';
      if (p.occupation) {
        tagline = p.occupation;
      } else if (p.birthPlace && p.deathPlace) {
        const birthCountry = p.birthPlace.split(',').pop()?.trim();
        const deathCountry = p.deathPlace.split(',').pop()?.trim();
        if (birthCountry && deathCountry && birthCountry !== deathCountry) {
          tagline = `${birthCountry} to ${deathCountry}`;
        }
      }
      if (!tagline && p.birthYear && p.birthYear < 1700) {
        tagline = 'Colonial ancestor';
      }

      return {
        id: p.id,
        name: p.fullName,
        years:
          p.birthYear && p.deathYear
            ? `${p.birthYear}–${p.deathYear}`
            : p.birthYear
              ? `b. ${p.birthYear}`
              : '',
        birthPlace: p.birthPlace?.split(',').slice(-2).join(', ') || undefined,
        deathPlace: p.deathPlace?.split(',').slice(-2).join(', ') || undefined,
        tagline: tagline || 'Family member',
        sex: p.sex || 'U',
        birthYear: p.birthYear,
        deathYear: p.deathYear,
        occupation: p.occupation,
      };
    });

    // Generate stories from data
    const stories: Story[] = [];

    // Colonial ancestors
    if (colonialResult[0]?.count > 0) {
      stories.push({
        icon: '🏛️',
        category: 'Colonial Era',
        title: `${colonialResult[0].count} Colonial Ancestors`,
        description: 'Family members who lived before American independence',
        collectionType: 'colonial-era',
      });
    }

    // Immigrants from Europe
    if (immigrantResult[0]?.count > 0) {
      stories.push({
        icon: '🚢',
        category: 'Immigration',
        title: `${immigrantResult[0].count} Atlantic Crossings`,
        description: 'Ancestors who left Europe for a new life in America',
        collectionType: 'england-immigration',
      });
    }

    // Long-lived
    if (longLivedResult[0]?.count > 0) {
      stories.push({
        icon: '🎂',
        category: 'Centenarians',
        title: `${longLivedResult[0].count} Lived Past 90`,
        description: 'Ancestors who witnessed nearly a century of history',
        collectionType: 'longevity',
      });
    }

    // Quakers
    if (quakerResult[0]?.count > 0) {
      stories.push({
        icon: '⚜️',
        category: 'Faith',
        title: `${quakerResult[0].count} Quaker Ancestors`,
        description:
          'Family members who followed the Religious Society of Friends',
        collectionType: 'quakers',
      });
    }

    // Military service
    if (militaryResult[0]?.count > 0) {
      stories.push({
        icon: '🎖️',
        category: 'Military',
        title: `${militaryResult[0].count} Who Served`,
        description: 'From the Revolutionary War to World War II',
        collectionType: 'military-service',
      });
    }

    // English heritage
    if (englishResult[0]?.count > 0) {
      stories.push({
        icon: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
        category: 'Heritage',
        title: `${englishResult[0].count} English Ancestors`,
        description: 'Tracing roots back to England',
        collectionType: 'england-heritage',
      });
    }

    // Welsh heritage
    if (welshResult[0]?.count > 0) {
      stories.push({
        icon: '🏴󠁧󠁢󠁷󠁬󠁳󠁿',
        category: 'Heritage',
        title: `${welshResult[0].count} Welsh Ancestors`,
        description: 'Family origins in Wales',
        collectionType: 'wales-heritage',
      });
    }

    // Earliest ancestor — scoped to viewer when set
    if (earliestResult[0]) {
      stories.push({
        icon: '📜',
        category: 'History',
        title: `Back to ${earliestResult[0].birthYear}`,
        description: `${earliestResult[0].fullName}, the earliest known ancestor in the tree`,
        personId: earliestResult[0].id,
      });
    }

    return NextResponse.json({
      viewerStats,
      treeStats,
      spotlight,
      stories,
    });
  } catch (error) {
    console.error('Error fetching home data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch home data' },
      { status: 500 },
    );
  }
}
