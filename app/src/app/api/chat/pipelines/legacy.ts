/**
 * Legacy pipeline — the default/terminal path.
 *
 * Always returns a NextResponse (never returns null).
 * This is the terminal pipeline — tools and reliability fall through to it on
 * crash or skip.
 *
 * Contains the deterministic viewer-scoped returns (oldest ancestor, Welsh
 * ancestor, military ancestors) using viewerLineageSummary.ancestorCount
 * (NOT normalized — see chat-response.ts comment).
 */

import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { executeQuery } from '@/lib/neo4j/client';
import { buildSystemPrompt } from '../systemPrompt';
import { CHAT_TOOLS, parseVisualizationCommand } from '../tools';
import {
  dedupeSourcePeople,
  isEarliestWelshAncestorQuestion,
  isMilitaryAncestorsQuestion,
  isOldestAncestorQuestion,
  shouldUseViewerScope,
} from '../intelligence';
import { buildLegacyEnvelope } from '../chat-response';
import { scoreLineageClaim, scoreMilitaryLineageClaim } from '../confidence';
import { classifyQueryPlan } from '../query-planner';
import { getGraphDictionaries } from '../graph-dictionaries';
import {
  CHAT_MODEL,
  runAnthropicWithToolContinuation,
} from '../anthropic-runner';
import { getPersonRecordContext } from '@/lib/neo4j/queries/records';
import { log } from '@/lib/logger';
import {
  getKnowledgeForPeople,
  searchKnowledgeBase,
  buildNeo4jContext,
} from '@/lib/neo4j/queries/chatContext';
import {
  searchKnowledgeBaseForViewerLineage,
  buildViewerLineageContext,
  getAmbiguityGapYears,
  formatCandidateYears,
} from '@/lib/neo4j/queries/lineage';
import type { ViewerLineageSummary } from '@/lib/neo4j/queries/lineage';
import type { VisualizationCommand } from '@/types/visualization';
import type { ChatApiResponse } from '@/types/chat';
import type { SidebarMessage } from '../types';
import type { ChatPipelineContext } from './context';

/**
 * Run the legacy pipeline (terminal — always returns a NextResponse).
 */
export async function runLegacyPipeline(
  ctx: ChatPipelineContext,
): Promise<NextResponse> {
  const {
    message,
    anthropicApiKey,
    history,
    pageContext,
    validatedViewer,
    chatIntent,
    treeId,
  } = ctx;

  const viewerScoped = shouldUseViewerScope(
    message,
    Boolean(validatedViewer?.id),
  );
  // Exclude "first ancestor who came to America" — that's immigration, not age
  const hasImmigrationContext =
    /\b(came to|immigrat|emigrat|arrived|crossed|settled in|moved to|journey|voyage|ship)\b/i.test(
      message,
    );
  const viewerScopedOldestQuestion =
    viewerScoped && isOldestAncestorQuestion(message) && !hasImmigrationContext;
  const viewerScopedEarliestWelshQuestion =
    viewerScoped && isEarliestWelshAncestorQuestion(message);
  // Military questions are viewer-scoped when ANY viewer is set, even without possessive words
  const viewerScopedMilitaryQuestion =
    Boolean(validatedViewer?.id) && isMilitaryAncestorsQuestion(message);

  // Shadow mode: log planner classification for comparison with existing system
  try {
    const dictionaries = await getGraphDictionaries();
    const queryPlan = classifyQueryPlan(
      message,
      validatedViewer ?? null,
      pageContext ?? null,
      (history ?? []) as unknown as SidebarMessage[],
      null,
      dictionaries,
    );
    if (process.env.NODE_ENV !== 'test') {
      log.info('chat.pipeline_enter', {
        pipeline: 'legacy',
        messagePreview: message.slice(0, 80),
        plan: {
          answerMode: queryPlan.answerMode,
          anchorType: queryPlan.anchor.type,
          anchorConfidence: queryPlan.anchor.confidence,
          searchDomain: queryPlan.searchDomain,
          needsClarification: queryPlan.needsClarification,
        },
        existing: {
          viewerScoped,
          oldestQ: viewerScopedOldestQuestion,
          welshQ: viewerScopedEarliestWelshQuestion,
          militaryQ: viewerScopedMilitaryQuestion,
        },
      });
    }
  } catch (err) {
    // Shadow mode: never break existing functionality
    console.error('[AI Planner Shadow] Classification error:', err);
  }

  let viewerLineageSummary: ViewerLineageSummary | null = null;
  let searchContext = '';
  if ((viewerScoped || viewerScopedMilitaryQuestion) && validatedViewer) {
    viewerLineageSummary = await buildViewerLineageContext(
      validatedViewer,
      treeId,
    );
    searchContext = viewerLineageSummary.context;
  } else {
    const personId =
      pageContext?.type === 'person' ? pageContext?.personId : undefined;
    searchContext = await buildNeo4jContext(message, treeId, personId);
  }

  // Build additional context from knowledge base
  let knowledgeContext = '';
  const sourcePeopleCandidates: Array<{ id: string; name: string }> = [];
  if (viewerLineageSummary) {
    sourcePeopleCandidates.push(...viewerLineageSummary.sourcePeople);
  }

  // If on tree view with visible people, include their context
  if (
    pageContext?.type === 'tree' &&
    (pageContext.visiblePersonIds?.length ?? 0) > 0
  ) {
    const visibleKnowledge = await getKnowledgeForPeople(
      pageContext.visiblePersonIds ?? [],
      treeId,
    );

    if (visibleKnowledge.size > 0) {
      knowledgeContext += `\n### People Currently Visible on Tree\n`;
      knowledgeContext += `You are looking at a family tree with ${visibleKnowledge.size} people visible.\n\n`;

      // Include brief info about visible people
      let count = 0;
      for (const [id, entry] of visibleKnowledge) {
        if (count >= 10) break; // Limit to 10 most relevant
        sourcePeopleCandidates.push({ id, name: entry.name });
        const years =
          entry.birthYear && entry.deathYear
            ? `(${entry.birthYear}-${entry.deathYear})`
            : entry.birthYear
              ? `(b. ${entry.birthYear})`
              : '';
        knowledgeContext += `- **[${entry.name}](/person/${id})** ${years}`;
        if (entry.birthPlace) knowledgeContext += ` - born ${entry.birthPlace}`;
        if (entry.occupations.length > 0)
          knowledgeContext += ` [${entry.occupations.join(', ')}]`;
        knowledgeContext += '\n';
        count++;
      }

      // If focus person, include more detail
      if (pageContext.focusPersonId) {
        const focusPerson = visibleKnowledge.get(pageContext.focusPersonId);
        if (focusPerson) {
          knowledgeContext += `\n**Focus Person: ${focusPerson.name}**\n`;
          if (focusPerson.occupations.length > 0) {
            knowledgeContext += `Occupations: ${focusPerson.occupations.join(', ')}\n`;
          }
          if (focusPerson.lifeEvents.length > 0) {
            const eventSummaries = focusPerson.lifeEvents
              .sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999))
              .slice(0, 8)
              .map((le) => (le.year ? `${le.year} - ${le.event}` : le.event));
            knowledgeContext += `Key Events: ${eventSummaries.join('; ')}\n`;
          }
          // Include biography excerpt if available
          if (focusPerson.biography) {
            const excerpt = focusPerson.biography.slice(0, 500);
            knowledgeContext += excerpt;
            if (focusPerson.biography.length > 500) knowledgeContext += '...';
            knowledgeContext += '\n';
          }
        }
      }
    }
  }

  // Search knowledge base for relevant entries based on user query
  const relevantEntries =
    (viewerScoped || viewerScopedMilitaryQuestion) && validatedViewer
      ? await searchKnowledgeBaseForViewerLineage(
          message,
          validatedViewer.id,
          treeId,
          3,
        )
      : await searchKnowledgeBase(message, treeId, 3);
  if (relevantEntries.length > 0) {
    knowledgeContext += `\n### Relevant People from Database\n`;
    for (const entry of relevantEntries) {
      sourcePeopleCandidates.push({ id: entry.id, name: entry.name });
      const years =
        entry.birthYear && entry.deathYear
          ? `(${entry.birthYear}-${entry.deathYear})`
          : entry.birthYear
            ? `(b. ${entry.birthYear})`
            : '';
      knowledgeContext += `\n**${entry.name}** ${years} (ID: ${entry.id})\n`;
      if (entry.birthPlace) knowledgeContext += `Born: ${entry.birthPlace}\n`;
      if (entry.deathPlace) knowledgeContext += `Died: ${entry.deathPlace}\n`;
      if (entry.marriagePlace || entry.marriageYear) {
        knowledgeContext += `Married: ${entry.marriagePlace || 'unknown place'}`;
        if (entry.marriageYear) knowledgeContext += ` (${entry.marriageYear})`;
        knowledgeContext += '\n';
      }
      if (entry.occupations.length > 0) {
        knowledgeContext += `Occupations: ${entry.occupations.join(', ')}\n`;
      }
      if (entry.lifeEvents.length > 0) {
        const eventSummaries = entry.lifeEvents
          .sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999))
          .slice(0, 8)
          .map((le) => (le.year ? `${le.year} - ${le.event}` : le.event));
        knowledgeContext += `Key Events: ${eventSummaries.join('; ')}\n`;
      }
      // Include biography if available
      if (entry.biography) {
        const excerpt = entry.biography.slice(0, 800);
        knowledgeContext += excerpt;
        if (entry.biography.length > 800) knowledgeContext += '...';
        knowledgeContext += '\n';
      }
    }
  }

  // Deterministic viewer-scoped answers for high-frequency lineage prompts
  if (
    (viewerScopedOldestQuestion ||
      viewerScopedEarliestWelshQuestion ||
      viewerScopedMilitaryQuestion) &&
    viewerLineageSummary
  ) {
    if (viewerScopedOldestQuestion || viewerScopedEarliestWelshQuestion) {
      const candidatePool = viewerScopedEarliestWelshQuestion
        ? viewerLineageSummary.lineagePeople.filter(
            (person) =>
              (person.birthPlace || '').toLowerCase().includes('wales') ||
              (person.birthPlace || '').toLowerCase().includes('welsh'),
          )
        : viewerLineageSummary.earliestCandidates;
      const primary = candidatePool[0] || null;
      const ambiguityGapYears = primary
        ? getAmbiguityGapYears(candidatePool, primary)
        : null;
      const confidence = primary
        ? scoreLineageClaim({
            birthYear: primary.birthYear,
            verificationStatus: primary.verificationStatus,
            generation: primary.generation,
            parentCount: primary.parentCount,
            birthPlace: primary.birthPlace,
            ambiguityGapYears,
          })
        : scoreLineageClaim({
            birthYear: null,
            verificationStatus: null,
            generation: 0,
            parentCount: 0,
            birthPlace: null,
            ambiguityGapYears: null,
          });

      const sourcePeople = dedupeSourcePeople(
        [
          ...sourcePeopleCandidates,
          ...candidatePool.map((person) => ({
            id: person.id,
            name: person.name,
          })),
        ],
        6,
      );

      let response = '';
      if (!primary) {
        response = viewerScopedEarliestWelshQuestion
          ? `I couldn't find a clearly documented Welsh direct-line ancestor for ${validatedViewer?.name || 'your selected viewer'} in the current data. I kept this scoped to your lineage.`
          : `I couldn't find a direct-line ancestor with enough date data to identify the oldest person confidently. I kept this scoped to your selected lineage.`;
      } else if (confidence.passed) {
        response = viewerScopedEarliestWelshQuestion
          ? `Your earliest known Welsh direct-line ancestor is **[${primary.name}](/person/${primary.id})** (${formatCandidateYears(primary)})${
              primary.birthPlace ? ` from ${primary.birthPlace}` : ''
            }.\n\nI scoped this to your selected lineage${validatedViewer ? ` (**${validatedViewer.name}**)` : ''}, not the whole tree.`
          : `Your oldest known direct ancestor is **[${primary.name}](/person/${primary.id})** (${formatCandidateYears(primary)})${
              primary.birthPlace ? ` from ${primary.birthPlace}` : ''
            }.\n\nI scoped this to your selected lineage${validatedViewer ? ` (**${validatedViewer.name}**)` : ''}, not the whole tree.`;
      } else {
        const topCandidates = candidatePool.slice(0, 3);
        response = `${viewerScopedEarliestWelshQuestion ? 'I could not determine a single earliest Welsh ancestor with high confidence.' : 'I could not determine a single oldest ancestor with high confidence.'}\n\nTop candidates in your lineage:\n${topCandidates
          .map(
            (person) =>
              `- **[${person.name}](/person/${person.id})** (${formatCandidateYears(person)})${person.birthPlace ? ` — ${person.birthPlace}` : ''}`,
          )
          .join(
            '\n',
          )}\n\nThis result is scoped to **${validatedViewer?.name || 'your selected viewer'}** and includes a confidence caveat.`;
      }

      const deterministicResponse: ChatApiResponse = {
        response,
        searchMethod: 'neo4j',
        sources: {
          database: 'Neo4j Graph Database',
          historicalKnowledge: false,
          intent: chatIntent,
          viewerScoped: true,
          confidence,
          familyRecords: {
            totalPeopleReferenced: viewerLineageSummary.ancestorCount,
            people: sourcePeople,
          },
        },
      };

      return NextResponse.json(deterministicResponse);
    }

    if (viewerScopedMilitaryQuestion) {
      const militaryPeople = viewerLineageSummary.militaryAncestors;
      const verifiedCount = militaryPeople.filter(
        (person) =>
          (person.verificationStatus || '').toUpperCase() === 'VERIFIED',
      ).length;
      const confidence = scoreMilitaryLineageClaim({
        count: militaryPeople.length,
        verifiedCount,
        withWarCount: militaryPeople.length,
      });
      const sourcePeople = dedupeSourcePeople(
        [
          ...sourcePeopleCandidates,
          ...militaryPeople.map((person) => ({
            id: person.id,
            name: person.name,
          })),
        ],
        6,
      );

      let response = '';
      if (militaryPeople.length === 0) {
        response = `I could not find documented military service in your currently linked direct lineage for **${validatedViewer?.name || 'the selected viewer'}**.`;
      } else {
        const list = militaryPeople
          .slice(0, 8)
          .map(
            (person) =>
              `- **[${person.name}](/person/${person.id})** (${formatCandidateYears(person)}) — ${person.wars.join(', ')}`,
          )
          .join('\n');
        response = `I found **${militaryPeople.length}** direct-line ancestors with documented military service for **${validatedViewer?.name || 'the selected viewer'}**:\n\n${list}\n\nThis answer is scoped to your selected lineage, not the whole tree.`;
      }

      const deterministicResponse: ChatApiResponse = {
        response,
        searchMethod: 'neo4j',
        sources: {
          database: 'Neo4j Graph Database',
          historicalKnowledge: false,
          intent: chatIntent,
          viewerScoped: true,
          confidence,
          familyRecords: {
            totalPeopleReferenced: viewerLineageSummary.ancestorCount,
            people: sourcePeople,
          },
        },
      };

      return NextResponse.json(deterministicResponse);
    }
  }

  // Get stats for system prompt from Neo4j
  const statsResult = await executeQuery<{
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

  const stats = {
    totalPeople: statsResult[0]?.totalPeople || 0,
    withResearch: statsResult[0]?.totalPeople || 0,
    withBiography: 0,
    verified: statsResult[0]?.verified || 0,
  };

  // Build enhanced system prompt with viewer identity
  const systemPrompt = buildSystemPrompt(
    pageContext,
    stats,
    undefined,
    validatedViewer,
  );
  const enabledTools = CHAT_TOOLS;

  // Fetch record evidence context if viewing a specific person
  let recordContext = '';
  if (pageContext?.type === 'person' && pageContext?.personId) {
    try {
      recordContext = await getPersonRecordContext(
        pageContext.personId,
        treeId,
      );
    } catch (err) {
      console.error('Failed to fetch record context:', err);
    }
    // The current person on a person page is implicitly referenced by the
    // system prompt. Ensure they're available for sourcePeopleCandidates
    // if the model cites them in the response.
    if (pageContext.personName) {
      sourcePeopleCandidates.push({
        id: pageContext.personId,
        name: pageContext.personName,
      });
    }
  }

  // Combine all context
  const fullContext = `${searchContext}
${knowledgeContext}

---
Data source: Neo4j Graph Database + Knowledge Base (enriched research data)`;

  // Initialize Anthropic client
  const legacyAnthropic = new Anthropic({ apiKey: anthropicApiKey });

  // Build messages
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  // Add conversation history if provided
  if (history && Array.isArray(history)) {
    for (const msg of history.slice(-6)) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
  }

  // Add current message with context
  messages.push({
    role: 'user',
    content: `${message}

---
[Inferred chat intent: ${chatIntent}]
Use this as routing guidance only and still answer directly.

[Source expectations]
- Distinguish family records from general historical context.
- Prefer documented family records for ancestor-specific facts.

[Context from family tree database:]
${fullContext}${recordContext ? `\n[Source record evidence for this person:]\n${recordContext}` : ''}`,
  });

  // Call Claude Opus with tools
  const response = await legacyAnthropic.messages.create({
    model: CHAT_MODEL,
    max_tokens: 2048,
    system: systemPrompt,
    tools: enabledTools,
    messages,
  });

  // Process response - handle tool use
  let responseText = '';
  let visualizationCommand: VisualizationCommand | null = null;
  let visualizationToolAttempted = false;
  const visualizationRejectedReason =
    'That command is not supported on this page, or it was missing required parameters.';

  for (const block of response.content) {
    if (block.type === 'text') {
      responseText += block.text;
    } else if (block.type === 'tool_use') {
      if (block.name === 'control_visualization') {
        visualizationToolAttempted = true;
        visualizationCommand = parseVisualizationCommand(
          block.input,
          pageContext,
        );
      }
    }
  }

  // If we got a tool use, we need to continue the conversation to get the text response
  responseText += await runAnthropicWithToolContinuation(
    {
      anthropic: legacyAnthropic,
      model: CHAT_MODEL,
      systemPrompt,
      initialMessages: messages,
      firstResponse: response,
      visualizationCommand,
      pageContext,
      treeId,
      logPrefix: '[AI Legacy Pipeline]',
    },
    responseText,
  );

  if (!responseText) {
    responseText = 'I apologize, I was unable to generate a response.';
  }

  return buildLegacyEnvelope({
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
  });
}
