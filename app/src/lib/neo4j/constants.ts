/**
 * Shared Neo4j traversal depth constants.
 *
 * MAX_ANCESTRY_DEPTH caps the recursive CHILD_OF ancestry traversal used
 * throughout the app (deep-lineage queries).  The descendant traversals
 * (CHILD_OF*0..6 / PARENT_OF*0..6) are intentionally left as literals —
 * they serve a different, separately-tuned depth.
 */

export const MAX_ANCESTRY_DEPTH = 20;
