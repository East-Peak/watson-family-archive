import type { GraphDictionaries, QueryTerms } from './types';

// ---------------------------------------------------------------------------
// Static term sets
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'do', 'does', 'did',
  'my', 'me', 'i', 'of', 'in', 'on', 'at', 'to', 'for', 'and', 'or',
  'but', 'about', 'tell', 'show', 'who', 'what', 'when', 'where', 'how',
  'why', 'can', 'could', 'would', 'should', 'has', 'have', 'had', 'be',
  'been', 'being', 'this', 'that', 'these', 'those', 'it', 'its', 'any',
  'some', 'there', 'than', 'then',
]);

const RELATIONSHIP_TERMS = new Set([
  'father', 'mother', 'parent', 'parents', 'grandfather', 'grandmother',
  'grandparent', 'grandparents', 'ancestor', 'ancestors', 'child', 'children',
  'son', 'daughter', 'sibling', 'brother', 'sister', 'spouse', 'husband',
  'wife', 'uncle', 'aunt', 'cousin', 'family', 'lineage', 'line',
  'descendant', 'descendants',
]);

const ATTRIBUTE_TERMS = new Set([
  'oldest', 'youngest', 'earliest', 'latest', 'first', 'last', 'longest',
  'shortest', 'long-lived', 'centenarian',
]);

const TOPIC_TERMS = new Set([
  'military', 'war', 'ww1', 'wwi', 'ww2', 'wwii', 'veteran', 'veterans',
  'served', 'service', 'immigration', 'emigrated', 'emigration', 'census',
  'religion', 'quaker', 'burial', 'occupation',
]);

// Adjective → canonical place name
const PLACE_ADJECTIVES: Record<string, string> = {
  welsh: 'wales',
  english: 'england',
  german: 'germany',
  irish: 'ireland',
  scottish: 'scotland',
  swiss: 'switzerland',
  french: 'france',
  american: 'usa',
  canadian: 'canada',
  dutch: 'netherlands',
  polish: 'poland',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Tokenise a message: lowercase, split on whitespace and punctuation. */
function tokenise(message: string): string[] {
  return message
    .toLowerCase()
    .split(/[\s\p{P}]+/u)
    .filter(t => t.length > 0);
}

/** Return the original-case tokens from the raw message, one per whitespace split. */
function originalTokens(message: string): string[] {
  return message.split(/\s+/).filter(t => t.length > 0);
}

/**
 * Decide whether an unclassified token looks like a proper name.
 * We use the original-case message to detect capitalisation.
 */
function looksLikeName(token: string, message: string): boolean {
  // Build a regex that matches this token at a word boundary in the original message.
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?:^|\\s)(${escaped})(?:\\s|$|[,?.!])`, 'i');
  const match = re.exec(message);
  if (!match) return false;
  const found = match[1];
  // Capitalised (and not the very first word, which might just be sentence-start)?
  // We accept it if the matched word starts with an uppercase letter anywhere in
  // the string — not just sentence-initial position.
  return /^[A-Z]/.test(found);
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function extractQueryTerms(
  message: string,
  dictionaries: GraphDictionaries,
): QueryTerms {
  if (!message.trim()) {
    return { names: [], places: [], attributes: [], relationships: [], topics: [], raw: [] };
  }

  const tokens = tokenise(message);
  const nonStop = tokens.filter(t => !STOP_WORDS.has(t));

  const names: string[] = [];
  const places: string[] = [];
  const attributes: string[] = [];
  const relationships: string[] = [];
  const topics: string[] = [];

  for (const token of nonStop) {
    let classified = false;

    if (RELATIONSHIP_TERMS.has(token)) {
      relationships.push(token);
      classified = true;
    }

    if (ATTRIBUTE_TERMS.has(token)) {
      attributes.push(token);
      classified = true;
    }

    if (TOPIC_TERMS.has(token)) {
      topics.push(token);
      classified = true;
    }

    // Place: either in dictionary directly or via adjective map
    if (dictionaries.places.has(token)) {
      places.push(token);
      classified = true;
    } else if (PLACE_ADJECTIVES[token] !== undefined) {
      // Push the canonical place name (not the adjective); adjective stays in raw[]
      places.push(PLACE_ADJECTIVES[token]);
      classified = true;
    }

    // Surname from dictionary
    if (dictionaries.surnames.has(token)) {
      names.push(token);
      classified = true;
    }

    // Unclassified token — check if it looks like a proper name
    if (!classified && looksLikeName(token, message)) {
      names.push(token);
    }
  }

  // Multi-word occupation check (purely informational — occupations are in dictionaries
  // but we don't need a separate category per the QueryTerms spec; they stay out of names).
  // Nothing to do here; the token loop above handles single tokens and stops them from
  // falling into names via the occupation dictionary scan below.

  // Occupation tokens: remove tokens that are parts of known multi-word occupations
  // from the names bucket to avoid mis-classifying them.
  const occupationTokens = new Set<string>();
  for (const occ of dictionaries.occupations) {
    for (const word of occ.split(/\s+/)) {
      occupationTokens.add(word.toLowerCase());
    }
  }

  // Deduplicate each array while preserving order
  const dedup = (arr: string[]) => [...new Set(arr)];

  return {
    names: dedup(names.filter(n => !occupationTokens.has(n))),
    places: dedup(places),
    attributes: dedup(attributes),
    relationships: dedup(relationships),
    topics: dedup(topics),
    raw: dedup(nonStop),
  };
}
