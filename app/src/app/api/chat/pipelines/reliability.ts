/**
 * Reliability (new) pipeline — retrieval-augmented path.
 *
 * Feature-gated by CHAT_USE_NEW_PIPELINE=true.
 *
 * Returns a NextResponse on success.
 * Returns null on crash OR when the query plan's answerMode doesn't match a
 * handled case (visualization-tool, deterministic-fact without a relResult,
 * etc.) so the dispatcher falls through to legacy.
 */

import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { executeQuery } from '@/lib/neo4j/client';
import { buildSystemPrompt, buildGroundingInstructions } from '../systemPrompt';
import { CHAT_TOOLS, parseVisualizationCommand } from '../tools';
import { classifyChatIntent } from '../intelligence';
import { buildNewPipelineEnvelope } from '../chat-response';
import { classifyQueryPlan } from '../query-planner';
import { getGraphDictionaries } from '../graph-dictionaries';
import { executeRetrieval } from '../retrieval';
import { buildContextBundle, renderContextBlock } from '../context-builder';
import { validateAndRepairResponse } from '../response-validator';
import { handleRelationshipQuery } from '../relationship-handler';
import {
  CHAT_MODEL,
  buildRecentHistory,
  runAnthropicWithToolContinuation,
} from '../anthropic-runner';
import { analyzeRecordGaps } from '@/lib/neo4j/queries/research';
import { log } from '@/lib/logger';
import type { SidebarMessage } from '../types';
import type { VisualizationCommand } from '@/types/visualization';
import type { VisualizationFeedback } from '@/types/visualization';
import type { ChatPipelineContext } from './context';

/**
 * Run the reliability (new) pipeline.
 *
 * @returns NextResponse on success; null to fall through to legacy.
 */
export async function runReliabilityPipeline(
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

  const dictionaries = await getGraphDictionaries();
  const queryPlan = classifyQueryPlan(
    message,
    validatedViewer ?? null,
    pageContext ?? null,
    (history ?? []) as unknown as SidebarMessage[],
    null, // anchorState — not persisted in v1
    dictionaries,
  );

  switch (queryPlan.answerMode) {
    case 'deterministic-fact': {
      // Try relationship handler first (new v1 handler)
      const anchorIsViewer = queryPlan.anchor.type === 'viewer';
      const anchorIsNamed =
        (queryPlan.anchor.type === 'named-person' ||
          queryPlan.anchor.type === 'current-page-person') &&
        queryPlan.anchor.personId;
      if (validatedViewer?.id && (anchorIsViewer || anchorIsNamed)) {
        const subjectId = anchorIsNamed ? queryPlan.anchor.personId : undefined;
        const relResult = await handleRelationshipQuery(
          queryPlan,
          validatedViewer.id,
          treeId,
          subjectId,
        );
        if (relResult) {
          return NextResponse.json({
            response: relResult.response,
            searchMethod: 'neo4j',
            sources: {
              database: 'Neo4j Graph Database',
              historicalKnowledge: false,
              intent: 'question' as const,
              viewerScoped: true,
              familyRecords: {
                totalPeopleReferenced: relResult.people.length,
                people: relResult.people.map((p) => ({
                  id: p.id,
                  name: p.name,
                })),
              },
            },
          });
        }
      }
      // Fall through to existing oldest/Welsh/military handlers (return null → legacy)
      return null;
    }

    case 'visualization-tool': {
      // Existing visualization pipeline — fall through to legacy code
      return null;
    }

    case 'stats': {
      try {
        const statsResult = await executeQuery<{ count: number }>(
          `MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person) RETURN count(p) as count`,
          { treeId },
        );
        const count = statsResult[0]?.count ?? 0;
        return NextResponse.json({
          response: `The Watson Family Tree contains **${count.toLocaleString()} people** spanning from the 1500s to the present day.`,
          searchMethod: 'neo4j',
          sources: {
            database: 'Neo4j Graph Database',
            historicalKnowledge: false,
            intent: 'question' as const,
            viewerScoped: false,
            familyRecords: { totalPeopleReferenced: 0, people: [] },
          },
        });
      } catch {
        log.warn('chat.pipeline_fallthrough', {
          pipeline: 'reliability',
          reason: 'crash',
          answerMode: 'stats',
          errorMessage: 'stats query failed',
        });
        return null; // fall through to legacy on error
      }
    }

    case 'clarification': {
      // Return a clarification response directly
      const clarificationText =
        queryPlan.needsClarification && queryPlan.clarificationReason
          ? queryPlan.clarificationReason
          : "I'm not sure what you're asking about. Could you be more specific? For example, you could ask about a specific person, your family history, or a place your ancestors lived.";

      return NextResponse.json({
        response: clarificationText,
        searchMethod: 'neo4j',
        sources: {
          database: 'Neo4j Graph Database',
          historicalKnowledge: false,
          intent: 'question' as const,
          viewerScoped: false,
          familyRecords: { totalPeopleReferenced: 0, people: [] },
        },
      });
    }

    case 'retrieval-qa':
    case 'page-anchored-qa':
    case 'tool-assisted': {
      // NEW PIPELINE: retrieval → context → LLM → validate
      try {
        // 1. Retrieve
        const retrieved = await executeRetrieval(
          queryPlan,
          treeId,
          validatedViewer?.id,
          message,
        );

        // 2. Build context
        const bundle = buildContextBundle(
          retrieved,
          queryPlan,
          validatedViewer ?? null,
        );
        const contextBlock = renderContextBlock(bundle);

        // 3. Get stats for system prompt from Neo4j
        const pipelineStatsResult = await executeQuery<{
          totalPeople: number;
          verified: number;
        }>(
          `
          MATCH (t:Tree {id: $treeId})-[:CONTAINS]->(p:Person)
          RETURN
            count(p) as totalPeople,
            count(CASE WHEN p.verificationStatus = 'VERIFIED' THEN 1 END) as verified
          `,
          { treeId },
        );
        const pipelineStats = {
          totalPeople: pipelineStatsResult[0]?.totalPeople || 0,
          withResearch: pipelineStatsResult[0]?.totalPeople || 0,
          withBiography: 0,
          verified: pipelineStatsResult[0]?.verified || 0,
        };

        // 4. Build system prompt with grounding
        const basePrompt = buildSystemPrompt(
          pageContext,
          pipelineStats,
          undefined,
          validatedViewer,
        );
        const groundingRules = buildGroundingInstructions();
        const fullPrompt = `${basePrompt}\n\n${groundingRules}\n\n${contextBlock}`;

        // 5. Build history for the API call
        const recentHistory = buildRecentHistory(history);

        // 6. Determine enabled tools
        const enabledTools = queryPlan.enabledTools?.length
          ? CHAT_TOOLS.filter((t) =>
              queryPlan.enabledTools!.includes(
                t.name as 'control_visualization' | 'analyze_research_gaps',
              ),
            )
          : undefined;

        // 7. Call Anthropic
        const reliabilityAnthropic = new Anthropic({ apiKey: anthropicApiKey });
        const anthropicMessages = [
          ...recentHistory,
          { role: 'user' as const, content: message },
        ];

        const anthropicResponse = await reliabilityAnthropic.messages.create({
          model: CHAT_MODEL,
          max_tokens: 2048,
          system: fullPrompt,
          messages: anthropicMessages,
          ...(enabledTools?.length ? { tools: enabledTools } : {}),
        });

        // 8. Extract response text
        let responseText = '';
        let visualizationCommand: VisualizationCommand | undefined;
        let visualizationFeedback: VisualizationFeedback | undefined;

        for (const block of anthropicResponse.content) {
          if (block.type === 'text') {
            responseText += block.text;
          } else if (block.type === 'tool_use') {
            if (block.name === 'control_visualization') {
              const cmd = parseVisualizationCommand(block.input, pageContext);
              if (cmd) {
                visualizationCommand = cmd;
                visualizationFeedback = { status: 'applied' };
              } else {
                visualizationFeedback = {
                  status: 'rejected',
                  reason: 'Invalid visualization command',
                };
              }
            } else if (block.name === 'analyze_research_gaps') {
              // Execute the research gap analysis
              const input = block.input as { person_id?: string };
              const targetPersonId = input.person_id || pageContext?.personId;
              if (targetPersonId) {
                try {
                  const analysis = await analyzeRecordGaps(
                    targetPersonId,
                    treeId,
                  );
                  const birthYear = analysis.birthYear ?? '?';
                  const deathYear = analysis.deathYear ?? '?';
                  const recordTypes =
                    analysis.recordTypes.length > 0
                      ? analysis.recordTypes.join(', ')
                      : 'none';
                  const missingTypes =
                    analysis.missingTypes.length > 0
                      ? analysis.missingTypes.join(', ')
                      : 'none';
                  const censusYears =
                    analysis.censusYears.length > 0
                      ? analysis.censusYears.join(', ')
                      : 'none';
                  const missingCensusYears =
                    analysis.missingCensusYears.length > 0
                      ? analysis.missingCensusYears.join(', ')
                      : 'none';
                  const suggestions = analysis.suggestions
                    .map((s: string) => `- ${s}`)
                    .join('\n');

                  responseText += `\n\nRecord coverage for ${analysis.personName} (${birthYear}–${deathYear}):\nRecords found: ${recordTypes}\nMissing record types: ${missingTypes}\nCensus years covered: ${censusYears}\nMissing census years: ${missingCensusYears}\n\nSuggestions:\n${suggestions}`;
                } catch (err) {
                  console.error(
                    '[AI New Pipeline] Research gap analysis failed:',
                    err,
                  );
                  responseText +=
                    '\n\nI encountered an error analyzing research gaps.';
                }
              }
            }
          }
        }

        // 8b. Handle tool_use stop reason: continue conversation to get text
        responseText += await runAnthropicWithToolContinuation(
          {
            anthropic: reliabilityAnthropic,
            model: CHAT_MODEL,
            systemPrompt: fullPrompt,
            initialMessages: anthropicMessages,
            firstResponse: anthropicResponse,
            visualizationCommand,
            pageContext,
            treeId,
            logPrefix: '[AI New Pipeline]',
          },
          responseText,
        );

        if (!responseText) {
          responseText = 'I apologize, I was unable to generate a response.';
        }

        // 9. Validate response
        const validation = validateAndRepairResponse(responseText, bundle);
        const finalText = validation.text;

        // 10 + 11. Build response envelope (citation extraction + metadata)
        const isViewerScoped = queryPlan.searchDomain === 'viewer-ancestors';

        return buildNewPipelineEnvelope(
          {
            finalText,
            bundle,
            validationIssues: validation.issues.map((i) => ({
              type: i.type,
              detail: i.detail,
            })),
            isViewerScoped,
            message,
            visualizationCommand,
            visualizationFeedback,
          },
          classifyChatIntent,
        );
      } catch (error) {
        console.error('[AI New Pipeline] Error:', error);
        const errMsg = error instanceof Error ? error.message : String(error);
        log.warn('chat.pipeline_fallthrough', {
          pipeline: 'reliability',
          reason: 'crash',
          answerMode: queryPlan.answerMode,
          errorMessage: errMsg,
        });
        // Fall through to existing pipeline on error
        return null;
      }
    }
  }

  // If we get here from deterministic-fact, visualization-tool, or stats (error)
  // — fall through to legacy
  return null;
}
