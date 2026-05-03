/**
 * Tool execution loop for the Opus tools pipeline.
 *
 * Sends an initial request to the Anthropic API and iterates: when Opus calls
 * tools, execute them locally (Neo4j queries via toolHandlers), send results
 * back, until Opus stops calling tools and returns a text response.
 *
 * Budget controls prevent runaway loops:
 *   - maxToolCalls (default 10) caps total tool calls across all iterations
 *   - timeoutMs (default 45 000 ms) caps wall-clock time for the whole loop
 */

import type { VisualizationCommand, VisualizationFeedback, PageContext } from '@/types/visualization';
import { parseVisualizationCommand } from './tools';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ToolLoopOptions {
  anthropic: any; // Anthropic client instance
  model: string;
  systemPrompt: string;
  tools: any[];
  messages: Array<{ role: string; content: any }>;
  toolHandlers: Record<
    string,
    (input: any, ctx: any) => Promise<{ data: unknown; personIds?: string[] }>
  >;
  requestContext: { treeId: string; viewerId?: string; pageContext?: PageContext };
  maxToolCalls?: number;
  timeoutMs?: number;
}

export interface ToolResultPerson {
  id: string;
  fullName?: string;
  surname?: string;
  birthYear?: number | null;
  deathYear?: number | null;
  birthPlace?: string | null;
  deathPlace?: string | null;
  occupations?: string[];
}

interface ToolLoopResult {
  text: string;
  toolCallCount: number;
  toolResultPersonIds: Set<string>;
  toolResultPeople: Map<string, ToolResultPerson>;
  visualizationCommand?: VisualizationCommand;
  visualizationFeedback?: VisualizationFeedback;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MAX_TOOL_CALLS = 10;
const DEFAULT_TIMEOUT_MS = 45_000;

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export async function runToolLoop(options: ToolLoopOptions): Promise<ToolLoopResult> {
  const {
    anthropic,
    model,
    systemPrompt,
    tools,
    toolHandlers,
    requestContext,
    maxToolCalls = DEFAULT_MAX_TOOL_CALLS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;

  // Defensive copy — never mutate the caller's messages array
  const messages = [...options.messages];

  let toolCallCount = 0;
  const toolResultPersonIds = new Set<string>();
  const toolResultPeople = new Map<string, ToolResultPerson>();
  let visualizationCommand: VisualizationCommand | undefined;
  let visualizationFeedback: VisualizationFeedback | undefined;
  let visualizationToolAttempted = false;
  const startTime = Date.now();

  // Captured on every iteration so the break path can extract the final text
  let lastResponse: any = null;
  let budgetExhausted = false;

  while (true) {
    const response = await anthropic.messages.create({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      tools,
      messages,
    });

    lastResponse = response;

    // Identify tool_use blocks
    const toolUseBlocks = (response.content as any[]).filter(
      (b: any) => b.type === 'tool_use'
    );

    // No tool calls or Opus signalled end_turn → extract text and return
    if (toolUseBlocks.length === 0 || response.stop_reason === 'end_turn') {
      break;
    }

    // -----------------------------------------------------------------------
    // Budget checks — on first violation, give the model one grace turn to
    // compose a text answer. On second violation, hard-break.
    // -----------------------------------------------------------------------

    toolCallCount += toolUseBlocks.length;

    const overBudget = toolCallCount > maxToolCalls;
    const overTime = Date.now() - startTime > timeoutMs;

    if (overBudget || overTime) {
      if (budgetExhausted) {
        // Second violation — model ignored our stop request. Hard break.
        console.warn('[Tool Loop] Hard break — model ignored budget/timeout stop after grace turn');
        break;
      }

      budgetExhausted = true;
      messages.push({ role: 'assistant', content: response.content });
      messages.push({
        role: 'user',
        content: overBudget
          ? '[System: Tool call budget reached. You MUST compose your answer now from the data you have. Do NOT call any more tools.]'
          : '[System: Time limit reached. You MUST compose your answer now from the data you have. Do NOT call any more tools.]',
      });
      continue;
    }

    // -----------------------------------------------------------------------
    // Execute each tool call
    // -----------------------------------------------------------------------

    const toolResults: any[] = [];

    for (const block of toolUseBlocks) {
      // Handle visualization commands inline — they're UI-forwarded commands,
      // not server-side queries. Only the first valid command per turn is
      // applied; subsequent valid calls are ignored (not rejected).
      if (block.name === 'control_visualization') {
        visualizationToolAttempted = true;
        let ackMessage: string;

        if (!requestContext.pageContext) {
          ackMessage = 'Visualization command rejected. No page context available.';
          if (!visualizationFeedback) {
            visualizationFeedback = {
              status: 'rejected',
              reason: 'That command is not supported on this page, or it was missing required parameters.',
            };
          }
        } else {
          const cmd = parseVisualizationCommand(block.input, requestContext.pageContext);
          if (cmd && !visualizationCommand) {
            // First valid command — apply it
            visualizationCommand = cmd;
            visualizationFeedback = { status: 'applied' };
            ackMessage = `Visualization command "${cmd.action}" applied to the ${cmd.target}. The user will see the result.`;
          } else if (cmd && visualizationCommand) {
            // Valid command but one was already applied — ignore it
            ackMessage = 'Ignored: only one visualization command is applied per turn. The first command was already applied.';
          } else {
            // Invalid command (wrong page, missing params, etc.)
            ackMessage = 'Visualization command rejected. That command is not supported on this page, or it was missing required parameters.';
            if (!visualizationFeedback) {
              visualizationFeedback = {
                status: 'rejected',
                reason: 'That command is not supported on this page, or it was missing required parameters.',
              };
            }
          }
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: ackMessage,
        });
        continue;
      }

      const handler = toolHandlers[block.name];

      if (!handler) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: `Unknown tool: ${block.name}`,
          is_error: true,
        });
        continue;
      }

      try {
        const result = await handler(block.input, requestContext);

        if (result.personIds) {
          result.personIds.forEach((id: string) => toolResultPersonIds.add(id));
        }

        // Collect rich person data for the validator
        if (result.data) {
          const people = Array.isArray(result.data) ? result.data : [result.data];
          for (const p of people) {
            if (p && p.id && !toolResultPeople.has(p.id)) {
              toolResultPeople.set(p.id, {
                id: p.id,
                fullName: p.fullName || p.name || undefined,
                surname: p.surname || undefined,
                birthYear: p.birthYear ?? null,
                deathYear: p.deathYear ?? null,
                birthPlace: p.birthPlace ?? null,
                deathPlace: p.deathPlace ?? null,
                occupations: p.occupations || [],
              });
            }
          }
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result.data),
        });
      } catch (err) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: `Tool error: ${err instanceof Error ? err.message : 'unknown error'}`,
          is_error: true,
        });
      }
    }

    // Append the assistant turn (with tool_use blocks) and the user turn
    // (with tool results) so the next iteration has full context
    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: toolResults });
  }

  // -------------------------------------------------------------------------
  // Extract text from the final response
  // -------------------------------------------------------------------------

  const textBlocks = ((lastResponse?.content ?? []) as any[]).filter(
    (b: any) => b.type === 'text'
  );
  const text = textBlocks
    .map((b: any) => b.text as string)
    .join('\n')
    .trim();

  if (visualizationToolAttempted && !visualizationFeedback) {
    visualizationFeedback = {
      status: 'rejected',
      reason: 'That command is not supported on this page, or it was missing required parameters.',
    };
  }

  return {
    text,
    toolCallCount,
    toolResultPersonIds,
    toolResultPeople,
    visualizationCommand,
    visualizationFeedback,
  };
}
