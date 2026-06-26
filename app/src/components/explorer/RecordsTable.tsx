'use client';

import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import RecordTableRow from './RecordTableRow';
import type { ExplorerRecord, RecordSortField, SortDirection } from './types';

interface Column {
  field: RecordSortField;
  label: string;
  align?: 'left' | 'center' | 'right';
  width: string;
}

const COLUMNS: Column[] = [
  { field: 'type', label: 'Type', align: 'left', width: '13%' },
  { field: 'year', label: 'Year', align: 'left', width: '8%' },
  { field: 'collection', label: 'Collection', align: 'left', width: '24%' },
  { field: 'place', label: 'Place', align: 'left', width: '18%' },
  { field: 'participantCount', label: 'People', align: 'center', width: '8%' },
  { field: 'tier', label: 'Tier', align: 'center', width: '9%' },
  { field: 'evidenceClass', label: 'Evidence', align: 'center', width: '11%' },
  { field: 'linkedPeople', label: 'Linked', align: 'center', width: '9%' },
];

interface RecordsTableProps {
  data: ExplorerRecord[];
  sortField: RecordSortField;
  sortDirection: SortDirection;
  onSort: (field: RecordSortField) => void;
}

function SortArrow({ direction }: { direction: SortDirection }) {
  return (
    <span className="ml-1 inline-block leading-none">
      {direction === 'asc' ? '↑' : '↓'}
    </span>
  );
}

export default function RecordsTable({
  data,
  sortField,
  sortDirection,
  onSort,
}: RecordsTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Each record is its own <tbody> (1-2 <tr>s of variable height). Dynamic
  // measureElement corrects the initial estimate so EXPANDING a row reflows.
  const rowVirtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 41,
    overscan: 8,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom =
    virtualItems.length > 0
      ? rowVirtualizer.getTotalSize() -
        virtualItems[virtualItems.length - 1].end
      : 0;

  return (
    <div
      ref={scrollRef}
      className="overflow-auto flex-1 bg-white border-t border-amber-200/40"
    >
      <table
        className="min-w-[900px] w-full border-collapse text-sm text-shield/80"
        style={{ tableLayout: 'fixed' }}
      >
        <colgroup>
          {COLUMNS.map((col) => (
            <col key={col.field} style={{ width: col.width }} />
          ))}
        </colgroup>
        <thead className="sticky top-0 z-10 bg-white border-b border-amber-200/40">
          <tr>
            {COLUMNS.map((col) => {
              const isActive = sortField === col.field;
              const alignClass =
                col.align === 'center'
                  ? 'text-center'
                  : col.align === 'right'
                    ? 'text-right'
                    : 'text-left';

              return (
                <th
                  key={col.field}
                  className={`px-3 py-2 font-medium text-xs uppercase tracking-wide whitespace-nowrap border-b border-shield/10 select-none cursor-pointer transition-colors ${alignClass} ${
                    isActive
                      ? 'text-indigo-600'
                      : 'text-shield/40 hover:text-shield/70'
                  }`}
                  onClick={() => onSort(col.field)}
                >
                  {col.label}
                  {isActive && <SortArrow direction={sortDirection} />}
                </th>
              );
            })}
          </tr>
        </thead>
        {data.length === 0 ? (
          <tbody>
            <tr>
              <td
                colSpan={COLUMNS.length}
                className="px-3 py-10 text-center text-shield/40 text-sm"
              >
                No records match your filters.
              </td>
            </tr>
          </tbody>
        ) : (
          <>
            {paddingTop > 0 && (
              <tbody aria-hidden="true">
                <tr>
                  <td
                    colSpan={COLUMNS.length}
                    style={{ height: paddingTop, padding: 0, border: 'none' }}
                  />
                </tr>
              </tbody>
            )}
            {virtualItems.map((vi) => (
              <tbody
                key={data[vi.index].id}
                data-index={vi.index}
                ref={rowVirtualizer.measureElement}
              >
                <RecordTableRow record={data[vi.index]} />
              </tbody>
            ))}
            {paddingBottom > 0 && (
              <tbody aria-hidden="true">
                <tr>
                  <td
                    colSpan={COLUMNS.length}
                    style={{
                      height: paddingBottom,
                      padding: 0,
                      border: 'none',
                    }}
                  />
                </tr>
              </tbody>
            )}
          </>
        )}
      </table>
    </div>
  );
}
