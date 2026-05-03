'use client';

import TableRow from './TableRow';
import type { ExplorerPerson, SortField, SortDirection } from './types';

interface Column {
  field: SortField;
  label: string;
  align?: 'left' | 'center' | 'right';
}

const COLUMNS: Column[] = [
  { field: 'fullName', label: 'Name', align: 'left' },
  { field: 'birthYear', label: 'Birth', align: 'left' },
  { field: 'deathYear', label: 'Death', align: 'left' },
  { field: 'originCountry', label: 'Origin', align: 'left' },
  { field: 'sex', label: 'Sex', align: 'center' },
  { field: 'status', label: 'Record Status', align: 'left' },
  { field: 'completenessScore', label: 'Completeness', align: 'left' },
  { field: 'sourceCount', label: 'Sources', align: 'center' },
  { field: 'researchScore', label: 'Research', align: 'center' },
  { field: 'validationStatus', label: 'Valid', align: 'center' },
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
                No people match your filters.
              </td>
            </tr>
          ) : (
            data.map((person) => <TableRow key={person.id} person={person} />)
          )}
        </tbody>
      </table>
    </div>
  );
}
