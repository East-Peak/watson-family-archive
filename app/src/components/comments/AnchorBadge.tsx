import type { ContributionEntity } from '@/lib/contributions/types';

interface AnchorBadgeProps {
  entity: ContributionEntity | null;
  url: string;
  routeContext: Record<string, unknown> | null;
}

function formatEntityId(id: string): string {
  return id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatKeyLabel(key: string): string {
  return key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatRouteContextEntry(key: string, value: unknown): string {
  if (key === 'view' && typeof value === 'string') {
    return value;
  }

  if (key === 'yearRange' && value && typeof value === 'object') {
    const maybeRange = value as { startYear?: number; endYear?: number };
    if (typeof maybeRange.startYear === 'number' || typeof maybeRange.endYear === 'number') {
      const start = typeof maybeRange.startYear === 'number' ? String(maybeRange.startYear) : '...';
      const end = typeof maybeRange.endYear === 'number' ? String(maybeRange.endYear) : '...';
      return `yearRange: ${start}-${end}`;
    }
  }

  if (key === 'completenessRange' && value && typeof value === 'object') {
    const maybeRange = value as { min?: number; max?: number };
    if (typeof maybeRange.min === 'number' && typeof maybeRange.max === 'number') {
      return `completeness: ${maybeRange.min}-${maybeRange.max}%`;
    }
  }

  if (key === 'sort' && value && typeof value === 'object') {
    const maybeSort = value as { label?: string; direction?: string };
    if (typeof maybeSort.label === 'string') {
      return `sort: ${maybeSort.label}${maybeSort.direction === 'desc' ? ' desc' : ''}`;
    }
  }

  if (key === 'decade' && typeof value === 'number') {
    return `decade: ${value}s`;
  }

  if (Array.isArray(value)) {
    const stringValues = value.filter((entry): entry is string => typeof entry === 'string');
    if (stringValues.length === 0) return formatKeyLabel(key);
    if (stringValues.length <= 2) {
      return `${formatKeyLabel(key)}: ${stringValues.join(', ')}`;
    }
    return `${formatKeyLabel(key)}: ${stringValues.slice(0, 2).join(', ')} +${stringValues.length - 2} more`;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    return `${formatKeyLabel(key)}: ${value}`;
  }

  return formatKeyLabel(key);
}

function routeContextSummary(ctx: Record<string, unknown>): string {
  const keys = Object.keys(ctx).slice(0, 4);
  const parts = keys.map((key) => formatRouteContextEntry(key, ctx[key]));
  if (Object.keys(ctx).length > 4) {
    parts.push(`+${Object.keys(ctx).length - 4} more`);
  }
  return parts.join(', ');
}

function pathFromUrl(url: string): string {
  try {
    return new URL(url, 'http://localhost').pathname;
  } catch {
    return url;
  }
}

export default function AnchorBadge({ entity, url, routeContext }: AnchorBadgeProps) {
  const path = pathFromUrl(url);

  if (entity) {
    return (
      <div className="text-xs text-gray-500 flex items-center gap-1.5 mt-1">
        <span className="inline-block w-2 h-2 rounded-full bg-oak" />
        <span>Tagged to: <strong>{formatEntityId(entity.id)}</strong></span>
      </div>
    );
  }

  if (routeContext && Object.keys(routeContext).length > 0) {
    return (
      <div className="text-xs text-gray-500 flex items-center gap-1.5 mt-1">
        <span className="inline-block w-2 h-2 rounded-full bg-blue-400" />
        <span>Tagged to: this view of <strong>{path}</strong> ({routeContextSummary(routeContext)})</span>
      </div>
    );
  }

  return (
    <div className="text-xs text-gray-500 flex items-center gap-1.5 mt-1">
      <span className="inline-block w-2 h-2 rounded-full bg-gray-400" />
      <span>Tagged to: page <strong>{path}</strong></span>
    </div>
  );
}
