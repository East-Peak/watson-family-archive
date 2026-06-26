'use client';

import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

// Lightweight class joiner — the project has no `cn`/clsx dependency, and a
// simple falsy-filtering join is all this component needs.
function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

interface VirtualizedCardListProps<T extends { id: string }> {
  items: T[];
  renderItem: (item: T) => React.ReactNode;
  className?: string;
  'data-testid'?: string;
}

/**
 * Reusable vertical virtualized list backed by @tanstack/react-virtual with
 * dynamic measurement. Owns its own scroll container and renders only the
 * visible window of cards, so long mobile lists don't materialize thousands of
 * DOM nodes. The `measureElement` ref + `data-index` give each row its real
 * height, so expanding cards (e.g. record participant lists) reflow correctly.
 */
export default function VirtualizedCardList<T extends { id: string }>({
  items,
  renderItem,
  className,
  'data-testid': dataTestId,
}: VirtualizedCardListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 132,
    overscan: 6,
  });

  return (
    <div
      ref={parentRef}
      className={cn('flex-1 overflow-y-auto', className)}
      data-testid={dataTestId}
    >
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((vi) => (
          <div
            key={items[vi.index].id}
            data-index={vi.index}
            ref={virtualizer.measureElement}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${vi.start}px)`,
            }}
          >
            {renderItem(items[vi.index])}
          </div>
        ))}
      </div>
    </div>
  );
}
