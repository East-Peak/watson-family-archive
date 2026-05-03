// Tool definitions for the genealogy tree AI chat interface
import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import type {
  PageContext,
  VisualizationAction,
  VisualizationCommand,
  VisualizationTarget,
} from '@/types/visualization';
export type { VisualizationCommand } from '@/types/visualization';

const VISUALIZATION_ACTIONS = ['filter', 'highlight', 'focusOn', 'showCollection', 'reset'] as const;
const VISUALIZATION_TARGETS = ['globe', 'tree', 'both'] as const;
const TREE_ACTIONS = new Set<typeof VISUALIZATION_ACTIONS[number]>([
  'filter',
  'highlight',
  'focusOn',
  'showCollection',
  'reset',
]);
const GLOBE_ACTIONS = new Set<typeof VISUALIZATION_ACTIONS[number]>([
  'filter',
  'showCollection',
  'reset',
]);

// Available family branches for filtering
export const AVAILABLE_BRANCHES = [
  'watson',
  'davies',
  'davis',
  'slater',
  'hughes',
  'evans',
  'mayer',
  'martin',
  'jenkins',
  'dawes',
  'duff',
  'lindsay',
  'hutchinson',
  'kirkwood',
];

// Available collections
export const AVAILABLE_COLLECTIONS = [
  'welsh-heritage',
  'scottish-heritage',
  'irish-heritage',
  'english-heritage',
  'german-heritage',
  'civil-war',
  'wwi-veterans',
  'wwii-veterans',
  'longevity',
  'large-families',
  'gold-rush',
  'welsh-immigration',
  'england-to-california',
];

// New genealogy tool definitions for the Opus tools pipeline
export const GENEALOGY_TOOLS: Tool[] = [
  {
    name: 'search_people',
    description: 'Search for people in the family tree by name or keyword. For location-based queries ("who lived in San Francisco"), use the place parameter instead of putting the location in query. Supports optional filters for structured queries like "oldest," "military service," "born in Wales," "immigrated to America." Returns up to 10 matches with basic info.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search term (name, place, or keyword)' },
        scope: { type: 'string', enum: ['viewer-ancestors', 'whole-tree'], description: 'Scope. Use viewer-ancestors when the user asks about "my" family.' },
        sort_by: { type: 'string', enum: ['oldest', 'youngest', 'longest-lived', 'name'], description: 'Sort order for results' },
        born_in_country: { type: 'string', description: 'Filter to people born in this country' },
        died_in_country: { type: 'string', description: 'Filter to people who died in this country' },
        immigration: { type: 'boolean', description: 'Filter to people who were born in one country and died in another (immigrants)' },
        military: { type: 'boolean', description: 'Filter to people with military service records' },
        occupation: { type: 'string', description: 'Filter to people with this occupation' },
        place: { type: 'string', description: 'Filter to people connected to this place (city, county, state, or country). Searches birth place, death place, and all known residences from census/vital records. Use this instead of putting locations in the query parameter.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'fetch_person',
    description: 'Fetch details for a specific person. By default returns structured data (dates, places, parents, spouse, children, occupations, life events) plus a 3000-character biography summary. Use the section parameter to drill into specific topics from their full research file.',
    input_schema: {
      type: 'object' as const,
      properties: {
        person_id: { type: 'string', description: 'The person slug (e.g., nicholas_wyatt)' },
        section: { type: 'string', enum: ['full', 'biography', 'sources', 'research_notes', 'life_events', 'family_structure'], description: 'Which section of the markdown to return. Default: summary (3000 chars). Use "full" for the complete file.' },
      },
      required: ['person_id'],
    },
  },
  {
    name: 'fetch_records',
    description: 'Fetch all source records for a person: census, vital, military, immigration records. Includes evidence tier (A-E), collection name, year, place, and household participants. Use when asked about evidence, sources, proof, or confidence.',
    input_schema: {
      type: 'object' as const,
      properties: {
        person_id: { type: 'string' },
      },
      required: ['person_id'],
    },
  },
  {
    name: 'get_viewer_lineage',
    description: 'Get a summary of the current viewer\'s direct ancestor chain: all ancestors with names, dates, birth places, and generation number. Use when the user asks about "my ancestors," "my family," or "my line." The viewer ID is automatically set from the request context — no parameter needed.',
    input_schema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'get_tree_stats',
    description: 'Get aggregate tree statistics: total people, total records, earliest/latest birth years, total countries, total places. Use for "how many" or "how big" questions.',
    input_schema: {
      type: 'object' as const,
      properties: {},
    },
  },
];

// Tool definitions for Claude
export const CHAT_TOOLS: Tool[] = [
  {
    name: 'analyze_research_gaps',
    description: 'Analyze record coverage for a person and suggest what records to search for next. Use this when the user asks about research gaps, missing records, what to research next, or record coverage for a specific person.',
    input_schema: {
      type: 'object' as const,
      properties: {
        person_id: {
          type: 'string',
          description: 'The person ID (slug) to analyze. Use the current person context if available.',
        },
      },
      required: ['person_id'],
    },
  },
  {
    name: 'control_visualization',
    description: `Control the family tree or globe visualization to help users explore their ancestry visually.

Use this tool when users ask to:
- "Show me" or "display" certain ancestors
- Filter by nationality, heritage, or family branch (e.g., "Show Welsh ancestors")
- Highlight specific people
- Navigate to a collection
- Reset filters

IMPORTANT: Always explain what you're doing before using this tool.

Command constraints:
- target=tree supports: filter, highlight, focusOn, showCollection, reset
- target=globe supports: filter, showCollection, reset
- filter + tree requires one of: personId, personIds, branch
- filter + globe requires one of: branch, location
- focusOn requires personId
- highlight requires personIds
- showCollection requires collectionType

Available branches: ${AVAILABLE_BRANCHES.join(', ')}
Available collections: ${AVAILABLE_COLLECTIONS.join(', ')}`,
    input_schema: {
      type: 'object' as const,
      properties: {
        action: {
          type: 'string',
          enum: [...VISUALIZATION_ACTIONS],
          description: 'The visualization action to perform',
        },
        target: {
          type: 'string',
          enum: [...VISUALIZATION_TARGETS],
          description: 'Which visualization to control. Use "both" when user doesn\'t specify.',
        },
        params: {
          type: 'object',
          description: 'Parameters for the action',
          properties: {
            branch: {
              type: 'string',
              description: 'Family branch to filter by (e.g., "watson", "davies", "welsh")',
            },
            personIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of person IDs to highlight',
            },
            personId: {
              type: 'string',
              description: 'Single person ID to focus on',
            },
            collectionType: {
              type: 'string',
              description: 'Collection type to show (e.g., "civil-war", "welsh-heritage")',
            },
            location: {
              type: 'string',
              description: 'Location to filter by (for globe)',
            },
          },
        },
      },
      required: ['action', 'target', 'params'],
    },
  },
];

// Combined tool list: genealogy tools + existing chat tools
export const ALL_TOOLS: Tool[] = [...GENEALOGY_TOOLS, ...CHAT_TOOLS];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeSlug(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '-');
}

function normalizeBranch(value: string): string {
  let normalized = value.trim().toLowerCase();
  if (!normalized) return normalized;

  if (normalized === 'my lines' || normalized === 'my line') {
    return 'my-lines';
  }

  normalized = normalized
    .replace(/\bbranch\b/g, '')
    .replace(/\bfamily\b/g, '')
    .replace(/\blineage\b/g, '')
    .trim();

  if (normalized.includes('/')) {
    normalized = normalized.split('/')[0]?.trim() || normalized;
  }

  return normalized.replace(/\s+/g, '-');
}

function getActiveTargetFromPageContext(pageContext?: PageContext): Exclude<VisualizationTarget, 'both'> | null {
  if (pageContext?.type === 'tree') return 'tree';
  if (pageContext?.type === 'globe') return 'globe';
  return null;
}

function normalizeTargetForAction(
  target: VisualizationTarget,
  action: VisualizationAction,
  pageTarget: Exclude<VisualizationTarget, 'both'> | null
): VisualizationTarget {
  if (target === 'both') {
    if (action === 'focusOn' || action === 'highlight') {
      return 'tree';
    }
    if (pageTarget) {
      return pageTarget;
    }
  }
  return target;
}

function isActionSupported(target: VisualizationTarget, action: VisualizationAction): boolean {
  if (target === 'tree') return TREE_ACTIONS.has(action);
  if (target === 'globe') return GLOBE_ACTIONS.has(action);
  return action === 'filter' || action === 'showCollection' || action === 'reset';
}

function hasRequiredParams(
  action: VisualizationAction,
  target: VisualizationTarget,
  params: VisualizationCommand['params']
): boolean {
  switch (action) {
    case 'focusOn':
      return Boolean(params.personId);
    case 'highlight':
      return Boolean(params.personIds && params.personIds.length > 0);
    case 'showCollection':
      return Boolean(params.collectionType);
    case 'reset':
      return true;
    case 'filter':
      if (target === 'globe') {
        return Boolean(params.branch || params.location);
      }
      if (target === 'tree') {
        return Boolean(params.personId || (params.personIds && params.personIds.length > 0) || params.branch);
      }
      return Boolean(params.branch || params.location);
    default:
      return false;
  }
}

// Parse and validate a visualization command from tool use
export function parseVisualizationCommand(
  toolInput: unknown,
  pageContext?: PageContext
): VisualizationCommand | null {
  if (!toolInput || typeof toolInput !== 'object') {
    return null;
  }

  const input = toolInput as Record<string, unknown>;
  const action = input.action as VisualizationAction;
  const target = input.target as VisualizationTarget;

  // Validate action
  if (!VISUALIZATION_ACTIONS.includes(action)) {
    return null;
  }

  // Validate target
  if (!VISUALIZATION_TARGETS.includes(target)) {
    return null;
  }

  const rawParams = (input.params as Record<string, unknown>) || {};
  const personIds = Array.isArray(rawParams.personIds)
    ? [...new Set(rawParams.personIds.filter(isNonEmptyString).map((id) => id.trim()))]
    : undefined;
  const params: VisualizationCommand['params'] = {
    branch: isNonEmptyString(rawParams.branch) ? normalizeBranch(rawParams.branch) : undefined,
    personIds: personIds && personIds.length > 0 ? personIds : undefined,
    personId: isNonEmptyString(rawParams.personId) ? rawParams.personId.trim() : undefined,
    collectionType: isNonEmptyString(rawParams.collectionType) ? normalizeSlug(rawParams.collectionType) : undefined,
    location: isNonEmptyString(rawParams.location) ? rawParams.location.trim() : undefined,
  };

  const pageTarget = getActiveTargetFromPageContext(pageContext);
  if (!pageTarget) {
    return null;
  }
  const normalizedTarget = normalizeTargetForAction(target, action, pageTarget);
  if (pageTarget && normalizedTarget !== pageTarget) {
    return null;
  }
  if (!isActionSupported(normalizedTarget, action)) {
    return null;
  }
  if (!hasRequiredParams(action, normalizedTarget, params)) {
    return null;
  }

  return {
    action,
    target: normalizedTarget,
    params,
  };
}
