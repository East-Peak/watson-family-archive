import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { PageContext } from '@/types/visualization';
import { classifyChatIntent } from './intelligence';
import { siteConfig } from '@/lib/siteConfig';
import { log } from '@/lib/logger';
import type { ViewerIdentity } from '@/lib/neo4j/queries/lineage';
import { runToolsPipeline } from './pipelines/tools';
import { runReliabilityPipeline } from './pipelines/reliability';
import { runLegacyPipeline } from './pipelines/legacy';
import type { ChatPipelineContext } from './pipelines/context';

export const maxDuration = 120;

const DEFAULT_TREE_ID = siteConfig.defaultTreeId;

// Runtime zod schema for the chat POST body.
// Strict on `message` and `history` (the genuinely malformed cases).
// LENIENT on `context` and `viewer` — z.unknown() so the schema can never
// reject a body that the live AISidebar.tsx frontend sends.
const ChatRequestSchema = z.object({
  message: z.string().min(1),
  history: z
    .array(z.object({ role: z.string(), content: z.string() }))
    .optional(),
  context: z.unknown().optional(), // PageContext — kept loose; handled downstream
  viewer: z.unknown().optional(), // viewer — validated by the existing typeof-ladder
});

function isEnabledFlag(value: string | undefined): boolean {
  return (value ?? '').trim() === 'true';
}

export async function GET(_request: NextRequest) {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function POST(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_ENABLE_CHAT !== 'true') {
    return NextResponse.json({ error: 'Chat is disabled.' }, { status: 503 });
  }
  try {
    const parsed = ChatRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 },
      );
    }
    const { message, history, context: _rawContext, viewer } = parsed.data;
    // context and viewer are z.unknown() in the schema (intentionally lenient so the
    // live UI body is never rejected).  Cast to the downstream types the rest of the
    // handler already expects — the existing viewer typeof-ladder and pageContext
    // usage remain unchanged.
    const pageContext = _rawContext as PageContext | undefined;

    // Check for Anthropic API key
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicApiKey) {
      return NextResponse.json(
        {
          error:
            'Chat is not configured. Please set ANTHROPIC_API_KEY environment variable.',
          response:
            'I apologize, but the chat feature is not yet configured. Please check back later or explore the family tree using the other features.',
        },
        { status: 503 },
      );
    }

    // Build context from Neo4j
    const chatIntent = classifyChatIntent(message);
    const viewerObj =
      viewer != null && typeof viewer === 'object'
        ? (viewer as Record<string, unknown>)
        : null;
    const validatedViewer: ViewerIdentity | undefined =
      viewerObj &&
      typeof viewerObj.id === 'string' &&
      typeof viewerObj.name === 'string'
        ? {
            id: viewerObj.id,
            name: viewerObj.name,
            familyBranch:
              typeof viewerObj.familyBranch === 'string'
                ? viewerObj.familyBranch
                : undefined,
          }
        : undefined;

    // Shared context threaded through all pipelines
    const ctx: ChatPipelineContext = {
      message,
      anthropicApiKey,
      history,
      pageContext,
      validatedViewer,
      chatIntent,
      treeId: DEFAULT_TREE_ID,
    };

    // ── Dispatcher: tools → reliability → legacy ──────────────────────────────
    //
    // Each pipeline returns NextResponse on success or null to fall through.
    // Legacy is terminal (always returns).
    //
    // Fall-through semantics (these match the original monolith exactly):
    //   tools crash  → null  → try reliability (if flagged) → try legacy
    //   reliability crash → null → legacy
    //
    // CAVEAT (preserved from the original, NOT a regression): the catch in
    // each pipeline only wraps the body INSIDE its try. A few early calls in
    // the reliability pipeline (graph-dictionary load, query-plan
    // classification, relationship-query handling) run outside that try and,
    // if they reject, propagate to the route-level catch below → a 500, the
    // same as before this decompose. Wrapping the whole reliability pipeline
    // so those also fall through is a deliberate, non-neutral future change.
    //
    // Observability: flag-disabled skips are logged at info level;
    // pipeline crashes are logged (with error detail) inside each pipeline
    // before returning null, so the dispatcher only needs to log skips.

    const useToolsPipeline = isEnabledFlag(process.env.CHAT_USE_TOOLS_PIPELINE);
    const useNewPipeline = isEnabledFlag(process.env.CHAT_USE_NEW_PIPELINE);

    if (useToolsPipeline) {
      const r = await runToolsPipeline(ctx);
      if (r) return r;
      // null → pipeline crashed and logged; fall through
    } else {
      log.info('chat.pipeline_skip', {
        pipeline: 'tools',
        reason: 'flag-disabled',
      });
    }

    if (useNewPipeline) {
      const r = await runReliabilityPipeline(ctx);
      if (r) return r;
      // null → pipeline crashed/skipped and logged; fall through
    } else {
      log.info('chat.pipeline_skip', {
        pipeline: 'reliability',
        reason: 'flag-disabled',
      });
    }

    return await runLegacyPipeline(ctx);
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      {
        error: 'Failed to process chat request',
        response: 'I apologize, but I encountered an error. Please try again.',
      },
      { status: 500 },
    );
  }
}
