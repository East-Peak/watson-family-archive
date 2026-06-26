/**
 * Per-pipeline citation extraction and response envelope builders.
 *
 * Phase 4, chunk 4 — extraction-only, behavior-neutral.
 *
 * The three pipelines have GENUINELY DIVERGENT citation/totalPeopleReferenced
 * behavior captured in the C1 characterization snapshots.  This module
 * faithfully extracts each pipeline's CURRENT logic without normalizing it.
 *
 * Shared utility (tools + new pipelines only):
 *   extractCitedPeople()   — regex extract + first-seen dedup
 *
 * Per-pipeline envelope builders:
 *   buildToolsEnvelope()          — tools pipeline
 *   buildNewPipelineEnvelope()    — new pipeline (retrieval-qa / page-anchored-qa)
 *   buildLegacyEnvelope()         — legacy pipeline
 *
 * DIVERGENCE PRESERVED (do NOT normalize — C5/C6 must keep these distinct):
 *   Tools / New (LLM path): totalPeopleReferenced = sourcePeople.length (after dedup).
 *                People come from the [Name](/person/id) links in the validated text;
 *                the NEW pipeline additionally falls back to the retrieval bundle's
 *                people when the response cites NONE (see buildNewPipelineEnvelope).
 *   Legacy (buildLegacyEnvelope, LLM path): totalPeopleReferenced =
 *                sourcePeopleCandidates.length (PRE-dedup; includes KB/context
 *                candidates even if never cited; response links are only added when
 *                the person's name is already in namesById — built from context, NOT
 *                from the response itself → legacy UNDER-counts vs tools/new).
 *   NOTE: the DETERMINISTIC legacy exits in pipelines/legacy.ts (the viewer-scoped
 *                oldest/Welsh answers) intentionally use viewerLineageSummary.ancestorCount,
 *                NOT either length above. Those returns are NOT built by this module and
 *                must keep their ancestorCount count.
 *
 * See route.characterization.test.ts for the 17 byte-identical snapshots that
 * lock this behavior.  Do NOT change those tests; a failing snapshot means you
 * normalized something.
 */

import { NextResponse } from 'next/server';
import type { ChatApiResponse, ChatIntent } from '@/types/chat';
import type {
  VisualizationCommand,
  VisualizationFeedback,
} from '@/types/visualization';
import type { RetrievedContextBundle } from './types';
import type { ViewerLineageSummary } from '@/lib/neo4j/queries/lineage';
import {
  dedupeSourcePeople,
  inferHistoricalContextUsage,
} from './intelligence';

// ---------------------------------------------------------------------------
// Shared: extractCitedPeople
// Used by: tools pipeline, new pipeline.
// NOT used by legacy — legacy resolves names via namesById/context, not just text links.
// ---------------------------------------------------------------------------

/**
 * Extract every [Name](/person/id) link from response text and return them in
 * first-seen order (deduped by id).
 *
 * This is the SHARED extractor used by the tools and new pipelines.  It is
 * intentionally NOT used by the legacy pipeline — legacy's extraction is
 * different: it resolves IDs through a namesById map built from pre-fetched
 * context, not from the response text itself.  Routing legacy through this
 * function would change totalPeopleReferenced counts and break the C1
 * characterization snapshots.
 */
export function extractCitedPeople(
  text: string,
): Array<{ id: string; name: string }> {
  const personLinkPattern = /\[([^\]]+)\]\(\/person\/([a-z0-9_]+)\)/g;
  const citedPeople: Array<{ id: string; name: string }> = [];
  const seenIds = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = personLinkPattern.exec(text)) !== null) {
    const [, name, id] = match;
    if (!seenIds.has(id)) {
      citedPeople.push({ id, name });
      seenIds.add(id);
    }
  }
  return citedPeople;
}

// ---------------------------------------------------------------------------
// Tools pipeline envelope
// ---------------------------------------------------------------------------

export interface ToolsEnvelopeParams {
  validatedText: string;
  viewerIsSet: boolean;
  toolResultPersonIdsSize: number;
  message: string;
  visualizationCommand: VisualizationCommand | undefined;
  visualizationFeedback: VisualizationFeedback | undefined;
}

/**
 * Build the NextResponse JSON envelope for the tools pipeline.
 *
 * totalPeopleReferenced = sourcePeople.length (cited-only, after dedup).
 * viewerScoped = Boolean(viewer.id) AND toolResultPersonIds.size > 0.
 *
 * Extraction: uses extractCitedPeople() — identical to the inline logic that
 * previously lived in route.ts at lines ~254-265.
 */
export function buildToolsEnvelope(
  params: ToolsEnvelopeParams,
  classifyChatIntent: (msg: string) => ChatIntent,
): NextResponse<ChatApiResponse> {
  const {
    validatedText,
    viewerIsSet,
    toolResultPersonIdsSize,
    message,
    visualizationCommand,
    visualizationFeedback,
  } = params;

  const citedPeople = extractCitedPeople(validatedText);
  const sourcePeople = dedupeSourcePeople(
    citedPeople.length > 0 ? citedPeople : [],
  );

  const isViewerScoped = viewerIsSet && toolResultPersonIdsSize > 0;

  return NextResponse.json<ChatApiResponse>({
    response: validatedText,
    searchMethod: 'neo4j' as const,
    sources: {
      database: 'Neo4j Graph Database',
      historicalKnowledge: /historical context:/i.test(validatedText),
      intent: classifyChatIntent(message),
      viewerScoped: isViewerScoped,
      familyRecords: {
        totalPeopleReferenced: sourcePeople.length,
        people: sourcePeople,
      },
    },
    ...(visualizationCommand ? { visualizationCommand } : {}),
    ...(visualizationFeedback ? { visualizationFeedback } : {}),
  });
}

// ---------------------------------------------------------------------------
// New pipeline envelope
// ---------------------------------------------------------------------------

export interface NewPipelineEnvelopeParams {
  finalText: string;
  bundle: RetrievedContextBundle;
  validationIssues: Array<{ type: string; detail: string }>;
  isViewerScoped: boolean;
  message: string;
  visualizationCommand: VisualizationCommand | undefined;
  visualizationFeedback: VisualizationFeedback | undefined;
}

/**
 * Build the NextResponse JSON envelope for the new pipeline.
 *
 * totalPeopleReferenced = sourcePeople.length (cited-only, after dedup).
 * When no citations, falls back to bundle.people.map(...) — these are the
 * retrieved people even if uncited (distinct from tools, which uses empty []).
 *
 * Extraction: uses extractCitedPeople() — identical to the inline logic that
 * previously lived in route.ts at lines ~581-599.
 */
export function buildNewPipelineEnvelope(
  params: NewPipelineEnvelopeParams,
  classifyChatIntent: (msg: string) => ChatIntent,
): NextResponse<ChatApiResponse> {
  const {
    finalText,
    bundle,
    validationIssues,
    isViewerScoped,
    message,
    visualizationCommand,
    visualizationFeedback,
  } = params;

  // validation.text here is finalText (already validated text)
  const citedPeople = extractCitedPeople(finalText);
  const sourcePeople = dedupeSourcePeople(
    citedPeople.length > 0
      ? citedPeople
      : bundle.people.map((p) => ({ id: p.id, name: p.fullName })),
    12,
  );

  const hasHistoricalContext = /historical context:/i.test(finalText);

  return NextResponse.json<ChatApiResponse>({
    response: finalText,
    searchMethod: 'neo4j',
    sources: {
      database: 'Neo4j Graph Database',
      historicalKnowledge: hasHistoricalContext,
      intent: classifyChatIntent(message),
      viewerScoped: isViewerScoped,
      familyRecords: {
        totalPeopleReferenced: sourcePeople.length,
        people: sourcePeople,
      },
    },
    ...(visualizationCommand ? { visualizationCommand } : {}),
    ...(visualizationFeedback ? { visualizationFeedback } : {}),
    ...(validationIssues.length > 0
      ? { _validationIssues: validationIssues }
      : {}),
  });
}

// ---------------------------------------------------------------------------
// Legacy pipeline envelope
// ---------------------------------------------------------------------------

export interface LegacyEnvelopeParams {
  responseText: string;
  /** The pre-populated sourcePeopleCandidates list (built from KB, viewer lineage,
   *  page context, visible people, etc.) before response-link scanning. */
  sourcePeopleCandidates: Array<{ id: string; name: string }>;
  /** The combined searchContext + knowledgeContext strings used to populate namesById. */
  searchContext: string;
  knowledgeContext: string;
  /** The viewer lineage summary (if viewer-scoped), used to expand namesById. */
  viewerLineageSummary: ViewerLineageSummary | null;
  viewerScoped: boolean;
  message: string;
  chatIntent: ChatIntent;
  visualizationCommand: VisualizationCommand | null;
  visualizationToolAttempted: boolean;
  visualizationRejectedReason: string;
}

/**
 * Build the NextResponse JSON envelope for the legacy pipeline.
 *
 * DIVERGENCE PRESERVED (byte-for-byte):
 *
 * 1. namesById resolution:
 *    Builds a name-resolution map from:
 *    a. sourcePeopleCandidates (KB + viewer lineage + page context)
 *    b. viewerLineageSummary.lineagePeople (if viewer-scoped)
 *    c. Context links in searchContext + knowledgeContext (scanned via regex)
 *    Response links are added to candidates ONLY if their ID already exists in
 *    namesById.  IDs NOT in namesById are silently dropped — this is why the
 *    legacy pipeline can under-count citations relative to tools/new.
 *
 * 2. totalPeopleReferenced = sourcePeopleCandidates.length (PRE-dedup).
 *    This is the raw pre-deduplication length of the candidates array — it
 *    includes KB entries that were never cited, and excludes response links
 *    whose names aren't in namesById.
 *
 * These two behaviors are NOT present in tools/new and MUST NOT be normalized.
 * They are locked by the L1, L2, DIVERGENCE characterization snapshots.
 */
export function buildLegacyEnvelope(
  params: LegacyEnvelopeParams,
): NextResponse<ChatApiResponse> {
  const {
    responseText,
    sourcePeopleCandidates,
    searchContext,
    knowledgeContext,
    viewerLineageSummary,
    viewerScoped,
    message,
    chatIntent,
    visualizationCommand,
    visualizationToolAttempted,
    visualizationRejectedReason,
  } = params;

  // ── Build namesById (name-resolution map) ──────────────────────────────────
  // Legacy's resolution strategy: populate from context BEFORE scanning the
  // response.  IDs not found here will be silently dropped from people[].
  // This is the root cause of the legacy under-count divergence.
  const namesById = new Map<string, string>();
  for (const candidate of sourcePeopleCandidates) {
    if (candidate.id && candidate.name)
      namesById.set(candidate.id, candidate.name);
  }
  if (viewerLineageSummary) {
    for (const person of viewerLineageSummary.lineagePeople) {
      if (person.id && person.name && !namesById.has(person.id)) {
        namesById.set(person.id, person.name);
      }
    }
  }
  // Scan searchContext + knowledgeContext for [Name](/person/id) entries so we
  // can resolve names for IDs injected via buildNeo4jContext sections.
  const contextLinkRegex = /\[([^\]]+)\]\(\/person\/([a-z0-9_-]+)\)/gi;
  let contextMatch: RegExpExecArray | null;
  const combinedContext = `${searchContext}\n${knowledgeContext}`;
  while ((contextMatch = contextLinkRegex.exec(combinedContext)) !== null) {
    const name = contextMatch[1];
    const id = contextMatch[2];
    if (!namesById.has(id)) namesById.set(id, name);
  }

  // ── Scan response for /person/id links, add only if name is in namesById ──
  // DIVERGENCE: response links whose names are NOT pre-populated in namesById
  // are silently dropped.  This is intentional (current behavior).
  const responseLinkRegex = /\/person\/([a-z0-9_-]+)/gi;
  let linkMatch: RegExpExecArray | null;
  const existingIds = new Set(sourcePeopleCandidates.map((p) => p.id));
  while ((linkMatch = responseLinkRegex.exec(responseText)) !== null) {
    const linkedId = linkMatch[1];
    if (existingIds.has(linkedId)) continue;
    const linkedName = namesById.get(linkedId);
    if (linkedName) {
      sourcePeopleCandidates.push({ id: linkedId, name: linkedName });
      existingIds.add(linkedId);
    }
  }

  // ── Build deduplicated source people (cap at 12) ───────────────────────────
  const sourcePeople = dedupeSourcePeople(sourcePeopleCandidates, 12);

  // ── Assemble response envelope ─────────────────────────────────────────────
  // DIVERGENCE: totalPeopleReferenced = sourcePeopleCandidates.length (PRE-dedup)
  // NOT sourcePeople.length (post-dedup).  This matches the current route.ts
  // behavior at line ~1177.
  const apiResponse: ChatApiResponse = {
    response: responseText,
    searchMethod: 'neo4j',
    sources: {
      database: 'Neo4j Graph Database',
      historicalKnowledge: inferHistoricalContextUsage(message, responseText),
      intent: chatIntent,
      viewerScoped,
      familyRecords: {
        totalPeopleReferenced: sourcePeopleCandidates.length,
        people: sourcePeople,
      },
    },
  };

  if (visualizationCommand) {
    apiResponse.visualizationCommand = visualizationCommand;
    apiResponse.visualizationFeedback = { status: 'applied' };
  } else if (visualizationToolAttempted) {
    apiResponse.visualizationFeedback = {
      status: 'rejected',
      reason: visualizationRejectedReason,
    };
  }

  return NextResponse.json<ChatApiResponse>(apiResponse);
}
