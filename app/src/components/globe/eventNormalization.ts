import type { GlobeEventType } from './types';

/**
 * Normalize raw LifeEvent.event text into a canonical globe event type.
 */
export function normalizeLifeEventType(eventText: string): GlobeEventType {
  if (!eventText) return 'other';
  const lower = eventText.toLowerCase();

  if (lower.includes('census')) return 'census';
  if (lower.includes('residence') || lower.includes('resided'))
    return 'residence';
  if (
    lower.includes('began working as') ||
    lower.includes('occupation') ||
    lower.includes('employed')
  )
    return 'occupation';
  if (
    lower.includes('immigration') ||
    lower.includes('emigration') ||
    lower.includes('immigrated') ||
    lower.includes('emigrated')
  )
    return 'migration';
  if (
    lower.includes('military') ||
    lower.includes('enlisted') ||
    lower.includes('served in')
  )
    return 'military';

  return 'other';
}
