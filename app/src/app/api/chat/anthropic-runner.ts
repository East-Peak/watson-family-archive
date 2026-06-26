/**
 * Shared helpers for the chat API route pipelines.
 *
 * Extracted from route.ts (Phase 4, chunk 2) — behavior-neutral.
 *
 * Exports:
 *   CHAT_MODEL              — single source of truth for the model id
 *   buildRecentHistory      — normalise raw history → MessageParam[]
 *   runAnthropicWithToolContinuation — first-response + tool-use continuation
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  Message,
  MessageParam,
} from '@anthropic-ai/sdk/resources/messages';
import { analyzeRecordGaps } from '@/lib/neo4j/queries/research';
import type { PageContext } from '@/types/visualization';
import type { VisualizationCommand } from './tools';

// ── Model constant ────────────────────────────────────────────────────────────

/**
 * The Anthropic model used by all three chat pipelines.
 * Change here propagates everywhere; do NOT upgrade without a Phase-5+ plan.
 */
export const CHAT_MODEL = 'claude-opus-4-5-20251101';

// ── History normalisation ─────────────────────────────────────────────────────

type RawHistoryEntry = {
  type?: string;
  role?: string;
  content: string;
};

/**
 * Build a normalised, 6-message sliding window from raw chat history.
 *
 * The raw history may carry either a `type` or a `role` field to signal the
 * speaker; both forms are accepted and normalised to `'assistant' | 'user'`.
 */
export function buildRecentHistory(
  history: RawHistoryEntry[] | null | undefined,
): Array<{ role: 'assistant' | 'user'; content: string }> {
  return (history ?? []).slice(-6).map((m) => ({
    role:
      m.type === 'assistant' || m.role === 'assistant'
        ? ('assistant' as const)
        : ('user' as const),
    content: m.content,
  }));
}

// ── Tool-continuation helper ──────────────────────────────────────────────────

export type ToolContinuationParams = {
  /** Anthropic client (caller owns it). */
  anthropic: Anthropic;
  /** Model id — pass CHAT_MODEL. */
  model: string;
  /** System prompt for the continuation call. */
  systemPrompt: string;
  /** Messages that were sent in the first call. */
  initialMessages: MessageParam[];
  /** The response returned by the first anthropic.messages.create call. */
  firstResponse: Message;
  /**
   * The visualizationCommand parsed during the first-response iteration.
   * Used to construct the control_visualization tool result content.
   */
  visualizationCommand: VisualizationCommand | null | undefined;
  /** Page context — used by analyze_research_gaps to resolve person_id. */
  pageContext: PageContext | null | undefined;
  /** Tree ID — passed to analyzeRecordGaps. */
  treeId: string;
  /**
   * Optional prefix for console.error messages, e.g. '[AI New Pipeline]'.
   * Defaults to '[Chat]'.
   */
  logPrefix?: string;
};

/**
 * Handle the tool-use continuation pattern shared by the new and legacy pipelines.
 *
 * When `firstResponse.stop_reason === 'tool_use'` AND the first-pass iteration
 * produced no `responseText`, this function:
 *   1. Computes the tool result content for the tool that fired.
 *   2. Sends a second anthropic.messages.create with the tool result appended.
 *   3. Returns the text extracted from the continued response.
 *
 * If no continuation is needed (stop_reason !== 'tool_use', or responseText is
 * already non-empty), returns an empty string.
 *
 * @param params.firstResponse  The Message from the initial create call.
 * @param currentResponseText   Text accumulated during the caller's first-pass
 *                              content iteration.  Used only for the guard check.
 */
export async function runAnthropicWithToolContinuation(
  params: ToolContinuationParams,
  currentResponseText: string,
): Promise<string> {
  const {
    anthropic,
    model,
    systemPrompt,
    initialMessages,
    firstResponse,
    visualizationCommand,
    pageContext,
    treeId,
    logPrefix = '[Chat]',
  } = params;

  if (firstResponse.stop_reason !== 'tool_use' || currentResponseText) {
    return '';
  }

  const toolUseBlock = firstResponse.content.find(
    (b: { type: string }) => b.type === 'tool_use',
  );
  if (!toolUseBlock || toolUseBlock.type !== 'tool_use') {
    return '';
  }

  let toolResultContent = '';

  if (toolUseBlock.name === 'analyze_research_gaps') {
    const input = toolUseBlock.input as { person_id?: string };
    const targetPersonId = input.person_id || pageContext?.personId;
    if (targetPersonId) {
      try {
        const analysis = await analyzeRecordGaps(targetPersonId, treeId);
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
        toolResultContent = `Record coverage for ${analysis.personName} (${birthYear}–${deathYear}):\nRecords found: ${recordTypes}\nMissing record types: ${missingTypes}\nCensus years covered: ${censusYears}\nMissing census years: ${missingCensusYears}\n\nSuggestions:\n${suggestions}`;
      } catch (err) {
        console.error(`${logPrefix} Research gap analysis failed:`, err);
        toolResultContent =
          'Research gap analysis failed. The person may not exist in the database.';
      }
    } else {
      toolResultContent =
        'No person ID provided or available from page context.';
    }
  } else if (toolUseBlock.name === 'control_visualization') {
    toolResultContent = visualizationCommand
      ? `Visualization command "${visualizationCommand.action}" has been sent to the ${visualizationCommand.target}. The user will see the results.`
      : 'Visualization command rejected. That command is not supported on this page, or it was missing required parameters.';
  } else {
    toolResultContent = 'Unknown tool.';
  }

  const continuedResponse = await anthropic.messages.create({
    model,
    max_tokens: 2048,
    system: systemPrompt,
    messages: [
      ...initialMessages,
      { role: 'assistant' as const, content: firstResponse.content },
      {
        role: 'user' as const,
        content: [
          {
            type: 'tool_result' as const,
            tool_use_id: toolUseBlock.id,
            content: toolResultContent,
          },
        ],
      },
    ],
  });

  let continuationText = '';
  for (const block of continuedResponse.content) {
    if (block.type === 'text') {
      continuationText += block.text;
    }
  }
  return continuationText;
}
