'use client';

import RecordTableRow from './RecordTableRow';
import type { ExplorerRecord, RecordSortField, SortDirection } from './types';

interface Column {
  field: RecordSortField;
  label: string;
  align?: 'left' | 'center' | 'right';
}

const COLUMNS: Column[] = [
  { field: 'type', label: 'Type', align: 'left' },
  { field: 'year', label: 'Year', align: 'left' },
  { field: 'collection', label: 'Collection', align: 'left' },
  { field: 'place', label: 'Place', align: 'left' },
  { field: 'participantCount', label: 'People', align: 'center' },
  { field: 'tier', label: 'Tier', align: 'center' },
  { field: 'evidenceClass', label: 'Evidence', align: 'center' },
  { field: 'linkedPeople', label: 'Linked', align: 'center' },
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
  return (
    <div className="overflow-auto flex-1 bg-white border-t border-amber-200/40">
      <table className="min-w-[900px] w-full border-collapse text-sm text-shield/80">
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
                    isActive ? 'text-indigo-600' : 'text-shield/40 hover:text-shield/70'
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
                No records match your filters.
              </td>
            </tr>
          ) : (
            data.map((record) => (
              <RecordTableRow key={record.id} record={record} />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
