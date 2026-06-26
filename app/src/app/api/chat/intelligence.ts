import type { ChatIntent, ChatSourcePerson } from '@/types/chat';

const VISUALIZATION_PATTERNS = [
  /\bshow\b/,
  /\bdisplay\b/,
  /\bfilter\b/,
  /\bhighlight\b/,
  /\bfocus\b/,
  /\breset\b/,
  /\bcollection\b/,
  /\bmap\b/,
  /\bglobe\b/,
  /\btree\b/,
  /\bzoom\b/,
  /\bhide\b/,
];

const QUESTION_PATTERNS = [
  /\bwho\b/,
  /\bwhat\b/,
  /\bwhen\b/,
  /\bwhere\b/,
  /\bwhy\b/,
  /\bhow\b/,
  /\btell me\b/,
  /\bexplain\b/,
  /\bwhich\b/,
  /\blist\b/,
  /\bcount\b/,
];

const HISTORICAL_CONTEXT_PATTERNS = [
  /\bhistor(y|ical)\b/,
  /\bcivil war\b/,
  /\bworld war\b/,
  /\bwwi\b/,
  /\bwwii\b/,
  /\bwar\b/,
  /\bcentury\b/,
  /\bimmigration\b/,
  /\bmigration\b/,
  /\bindustrial revolution\b/,
  /\bcolonial\b/,
  /\bvictorian\b/,
];

const VIEWER_POSSESSIVE_PATTERNS = [
  /\bmy\b/,
  /\bour\b/,
  /\bmine\b/,
  /\bme\b/,
  /\bi\b/,
];

const LINEAGE_REFERENCE_PATTERNS = [
  /\bancestor\b/,
  /\bancestors\b/,
  /\blineage\b/,
  /\bfamily line\b/,
  /\bfamily tree\b/,
  /\bparent\b/,
  /\bparents\b/,
  /\bgrandparent\b/,
  /\bgrandparents\b/,
  /\bgreat[- ]grandparent\b/,
  /\bbloodline\b/,
];

const OLDEST_ANCESTOR_PATTERNS = [
  /\b(oldest|earliest)\b.*\bancestor(s)?\b/,
  /\bfirst\b.*\bancestor(s)?\b/,
  /\b(oldest|earliest)\b.*\b(in|on)\b.*\bline(age)?\b/,
];

const WELSH_PATTERNS = [/\bwelsh\b/, /\bwales\b/];
const MILITARY_PATTERNS = [
  /\bmilitary\b/,
  /\bwar\b/,
  /\bveteran(s)?\b/,
  /\bserved\b/,
  /\bservice\b/,
];

export function classifyChatIntent(message: string): ChatIntent {
  const normalized = message.toLowerCase();
  const hasQuestionMark = normalized.includes('?');
  const visualizationScore = VISUALIZATION_PATTERNS.reduce(
    (score, pattern) => (pattern.test(normalized) ? score + 1 : score),
    0,
  );
  const questionScore =
    QUESTION_PATTERNS.reduce(
      (score, pattern) => (pattern.test(normalized) ? score + 1 : score),
      0,
    ) + (hasQuestionMark ? 1 : 0);

  if (visualizationScore > 0 && questionScore > 0) return 'mixed';
  if (visualizationScore > 0) return 'visualization';
  return 'question';
}

export function inferHistoricalContextUsage(
  message: string,
  responseText?: string,
): boolean {
  const combined = `${message} ${responseText || ''}`.toLowerCase();
  return HISTORICAL_CONTEXT_PATTERNS.some((pattern) => pattern.test(combined));
}

export function shouldUseViewerScope(
  message: string,
  hasViewer: boolean,
): boolean {
  if (!hasViewer) return false;
  const normalized = message.toLowerCase();
  const hasPossessiveReference = VIEWER_POSSESSIVE_PATTERNS.some((pattern) =>
    pattern.test(normalized),
  );
  if (!hasPossessiveReference) return false;
  return LINEAGE_REFERENCE_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function isOldestAncestorQuestion(message: string): boolean {
  const normalized = message.toLowerCase();
  return OLDEST_ANCESTOR_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function isEarliestWelshAncestorQuestion(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    isOldestAncestorQuestion(normalized) &&
    WELSH_PATTERNS.some((pattern) => pattern.test(normalized))
  );
}

export function isMilitaryAncestorsQuestion(message: string): boolean {
  const normalized = message.toLowerCase();
  const hasMilitaryReference = MILITARY_PATTERNS.some((pattern) =>
    pattern.test(normalized),
  );
  if (!hasMilitaryReference) return false;
  // Military questions are viewer-scoped even without explicit lineage words —
  // "Who served in the military?" implicitly asks about the viewer's family
  const hasQuestionOrCommand =
    /\b(who|which|what|how many|are there|were there|did any|did anyone|show|list|tell|served)\b/.test(
      normalized,
    );
  return hasQuestionOrCommand;
}

export function dedupeSourcePeople(
  people: Array<{ id: string; name: string }>,
  limit: number = 6,
): ChatSourcePerson[] {
  const deduped = new Map<string, ChatSourcePerson>();

  for (const person of people) {
    if (!person?.id || !person?.name) continue;
    if (!deduped.has(person.id)) {
      deduped.set(person.id, { id: person.id, name: person.name });
    }
    if (deduped.size >= limit) break;
  }

  return [...deduped.values()];
}
