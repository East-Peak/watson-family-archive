/**
 * Shared ChatPipelineContext type threaded through all three pipelines.
 *
 * This carries exactly the inputs each pipeline block previously closed over in
 * route.ts — no more, no less.  Each field is documented with which pipeline(s)
 * consume it.
 */

import type { PageContext } from '@/types/visualization';
import type { ViewerIdentity } from '@/lib/neo4j/queries/lineage';
import type { ChatIntent } from '@/types/chat';

export interface ChatPipelineContext {
  /** The raw user message text. Consumed by: tools, reliability, legacy. */
  message: string;

  /** Validated Anthropic API key. Each pipeline constructs its OWN Anthropic
   *  client inside its try block (so a constructor failure falls through, and
   *  the client isn't built when the pipeline's flag is off). Consumed by:
   *  tools, reliability, legacy. */
  anthropicApiKey: string;

  /** Raw conversation history from the request body. Consumed by: tools, reliability, legacy. */
  history: Array<{ role: string; content: string }> | undefined;

  /** Page context from the request body (lenient cast). Consumed by: tools, reliability, legacy. */
  pageContext: PageContext | undefined;

  /** Validated viewer identity (undefined when no viewer or invalid shape). Consumed by: tools, reliability, legacy. */
  validatedViewer: ViewerIdentity | undefined;

  /** Pre-classified chat intent. Consumed by: legacy. */
  chatIntent: ChatIntent;

  /** The canonical tree ID. Consumed by: tools, reliability, legacy. */
  treeId: string;
}
