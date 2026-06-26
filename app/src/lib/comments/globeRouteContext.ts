import type { GlobeViewState } from '@/components/globe/types';

const DEFAULT_EVENT_TYPES = [
  'birth',
  'death',
  'marriage',
  'census',
  'residence',
];

function hasDefaultEventTypes(eventTypes: string[]): boolean {
  if (eventTypes.length !== DEFAULT_EVENT_TYPES.length) {
    return false;
  }

  return DEFAULT_EVENT_TYPES.every((eventType) =>
    eventTypes.includes(eventType),
  );
}

export function buildGlobeRouteContext(
  state: GlobeViewState,
): Record<string, unknown> {
  const routeContext: Record<string, unknown> = {};

  if (state.branch && state.branch !== 'all') {
    routeContext.branch = state.branch;
  }

  if (state.yearRange) {
    routeContext.yearRange = state.yearRange;
  }

  if (!hasDefaultEventTypes(state.eventTypes)) {
    routeContext.eventTypes = state.eventTypes;
  }

  if (state.regions.length > 0) {
    routeContext.regions = state.regions;
  }

  if (state.highlightPerson) {
    routeContext.highlightPerson = state.highlightPerson;
  }

  if (state.viewMode !== 'pins') {
    routeContext.viewMode = state.viewMode;
  }

  if (!state.showApproximate) {
    routeContext.showApproximate = false;
  }

  if (!state.showArcs) {
    routeContext.showArcs = false;
  }

  if (state.showLabels) {
    routeContext.showLabels = true;
  }

  if (state.arcColorMode !== 'default') {
    routeContext.arcColorMode = state.arcColorMode;
  }

  return routeContext;
}
