/**
 * Tools pipeline — Anthropic tool-loop path.
 *
 * Feature-gated by CHAT_USE_TOOLS_PIPELINE=true.
 *
 * Returns a NextResponse on success.
 * Returns null on crash so the dispatcher falls through to the reliability or
 * legacy pipeline.
 */

import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { ALL_TOOLS } from '../tools';
import type { ToolContext, ToolResult } from '../tool-handlers';
import {
  handleSearchPeople,
  handleFetchPerson,
  handleFetchRecords,
  handleGetViewerLineage,
  handleGetTreeStats,
} from '../tool-handlers';
import { buildToolsSystemPrompt } from '../tools-prompt';
import { runToolLoop } from '../tool-loop';
import { validateAndRepairResponse } from '../response-validator';
import { buildToolsEnvelope } from '../chat-response';
import { classifyChatIntent } from '../intelligence';
import { CHAT_MODEL, buildRecentHistory } from '../anthropic-runner';
import { analyzeRecordGaps } from '@/lib/neo4j/queries/research';
import { log } from '@/lib/logger';
import type {
  RetrievedContextBundle,
  RelationshipPath,
  QueryPlan,
} from '../types';
import type { ChatPipelineContext } from './context';

// Local type alias for the tool handler map entries
type ToolHandler = (input: unknown, ctx: ToolContext) => Promise<ToolResult>;

/**
 * Run the tools pipeline.
 *
 * @returns NextResponse on success; null to fall through to the next pipeline.
 */
export async function runToolsPipeline(
  ctx: ChatPipelineContext,
): Promise<NextResponse | null> {
  const {
    message,
    anthropicApiKey,
    history,
    pageContext,
    validatedViewer,
    treeId,
  } = ctx;

  log.info('chat.pipeline_enter', {
    pipeline: 'tools',
    messagePreview: message?.slice(0, 50),
  });

  try {
    // Construct the Anthropic client inside the try (matching the original
    // inline placement): a constructor failure falls through to the next
    // pipeline rather than 500-ing, and it isn't built when this flag is off.
    const anthropic = new Anthropic({ apiKey: anthropicApiKey });

    // Build system prompt
    const toolsPrompt = buildToolsSystemPrompt(
      validatedViewer ?? null,
      pageContext,
    );

    // Build tool handler map
    const toolHandlerMap: Record<string, ToolHandler> = {
      search_people: handleSearchPeople as ToolHandler,
      fetch_person: handleFetchPerson as ToolHandler,
      fetch_records: handleFetchRecords as ToolHandler,
      get_viewer_lineage: handleGetViewerLineage as ToolHandler,
      get_tree_stats: handleGetTreeStats as ToolHandler,
    };

    // Wrap the existing analyzeRecordGaps function for the tool loop
    toolHandlerMap['analyze_research_gaps'] = async (
      input: unknown,
      toolCtx: ToolContext,
    ) => {
      const personId =
        (input as { person_id?: string }).person_id || pageContext?.personId;
      if (!personId) {
        return {
          data: {
            error: 'No person_id provided or available from page context.',
          },
        };
      }
      const analysis = await analyzeRecordGaps(personId, toolCtx.treeId);
      return {
        data: analysis,
        personIds: [personId],
      };
    };

    // viewerId is a read-personalization parameter — it scopes lineage queries
    // to a specific person's ancestry view. It does NOT restrict data access:
    // all tree data is already readable by any authenticated user. Real authz
    // is the middleware allowlist (read) and admin-only write gates (writes).
    const requestContext = {
      treeId,
      viewerId: validatedViewer?.id,
      pageContext,
    };

    // Build conversation history
    const recentHistory = buildRecentHistory(history);

    // Run the tool loop
    const loopResult = await runToolLoop({
      anthropic,
      model: CHAT_MODEL,
      systemPrompt: toolsPrompt,
      tools: ALL_TOOLS,
      messages: [...recentHistory, { role: 'user' as const, content: message }],
      toolHandlers: toolHandlerMap,
      requestContext,
    });

    // Run response validator on the output
    // Build validator bundle from rich person data collected during tool execution
    const validatorPeople = Array.from(loopResult.toolResultPersonIds).map(
      (id) => {
        const rich = loopResult.toolResultPeople.get(id);
        return {
          id,
          fullName: rich?.fullName || id.replace(/_/g, ' '),
          surname: rich?.surname || '',
          birthYear: rich?.birthYear ?? null,
          deathYear: rich?.deathYear ?? null,
          birthPlace: rich?.birthPlace ?? null,
          deathPlace: rich?.deathPlace ?? null,
          biography: null as string | null,
          marriagePlace: null as string | null,
          marriageYear: null as number | null,
          occupations: rich?.occupations || ([] as string[]),
          lifeEvents: [] as Array<{ event: string; year: number | null }>,
        };
      },
    );

    const bundle: RetrievedContextBundle = {
      people: validatorPeople,
      relationshipPaths: [] as RelationshipPath[],
      queryPlan: {} as unknown as QueryPlan,
    };

    const validation = validateAndRepairResponse(loopResult.text, bundle);

    return buildToolsEnvelope(
      {
        validatedText: validation.text,
        viewerIsSet: Boolean(validatedViewer?.id),
        toolResultPersonIdsSize: loopResult.toolResultPersonIds.size,
        message,
        visualizationCommand: loopResult.visualizationCommand,
        visualizationFeedback: loopResult.visualizationFeedback,
      },
      classifyChatIntent,
    );
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const errStack = error instanceof Error ? error.stack : 'no stack';
    console.error('[AI Tools Pipeline] Error:', errMsg);
    console.error('[AI Tools Pipeline] Stack:', errStack);
    log.warn('chat.pipeline_fallthrough', {
      pipeline: 'tools',
      reason: 'crash',
      errorMessage: errMsg,
    });
    // Fall through to existing pipelines on error
    return null;
  }
}
