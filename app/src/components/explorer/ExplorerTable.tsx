'use client';

import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import TableRow from './TableRow';
import type { ExplorerPerson, SortField, SortDirection } from './types';

interface Column {
  field: SortField;
  label: string;
  align?: 'left' | 'center' | 'right';
  width: string;
}

const COLUMNS: Column[] = [
  { field: 'fullName', label: 'Name', align: 'left', width: '16%' },
  { field: 'birthYear', label: 'Birth', align: 'left', width: '10%' },
  { field: 'deathYear', label: 'Death', align: 'left', width: '10%' },
  { field: 'originCountry', label: 'Origin', align: 'left', width: '11%' },
  { field: 'sex', label: 'Sex', align: 'center', width: '5%' },
  { field: 'status', label: 'Record Status', align: 'left', width: '12%' },
  {
    field: 'completenessScore',
    label: 'Completeness',
    align: 'left',
    width: '13%',
  },
  { field: 'sourceCount', label: 'Sources', align: 'center', width: '8%' },
  { field: 'researchScore', label: 'Research', align: 'center', width: '7%' },
  { field: 'validationStatus', label: 'Valid', align: 'center', width: '8%' },
];

interface ExplorerTableProps {
  data: ExplorerPerson[];
  sortField: SortField;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
}

function SortArrow({ direction }: { direction: SortDirection }) {
  return (
    <span className="ml-1 inline-block leading-none">
      {direction === 'asc' ? '↑' : '↓'}
    </span>
  );
}

export default function ExplorerTable({
  data,
  sortField,
  sortDirection,
  onSort,
}: ExplorerTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 41,
    overscan: 12,
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
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={COLUMNS.length}
                className="px-3 py-10 text-center text-shield/40 text-sm"
              >
                No people match your filters.
              </td>
            </tr>
          ) : (
            <>
              {paddingTop > 0 && (
                <tr aria-hidden="true">
                  <td
                    colSpan={COLUMNS.length}
                    style={{ height: paddingTop, padding: 0, border: 'none' }}
                  />
                </tr>
              )}
              {virtualItems.map((vi) => (
                <TableRow key={data[vi.index].id} person={data[vi.index]} />
              ))}
              {paddingBottom > 0 && (
                <tr aria-hidden="true">
                  <td
                    colSpan={COLUMNS.length}
                    style={{
                      height: paddingBottom,
                      padding: 0,
                      border: 'none',
                    }}
                  />
                </tr>
              )}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}
