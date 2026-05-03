'use client';

import Link from 'next/link';
import type { MobileTreePersonDetails } from './useMobileTreePerson';

function getLifespanLabel(person: MobileTreePersonDetails) {
  if (person.isLiving) {
    return person.birthYear ? `Born ${person.birthYear}` : 'Living';
  }

  if (person.birthYear && person.deathYear) {
    return `${person.birthYear} - ${person.deathYear}`;
  }

  if (person.birthYear) {
    return `Born ${person.birthYear}`;
  }

  if (person.deathYear) {
    return `Died ${person.deathYear}`;
  }

  return 'Dates unknown';
}

interface MobileTreeFocusCardProps {
  person: MobileTreePersonDetails;
  onOpenDetails: () => void;
  helperText: string;
  recoveryLabel: string | null;
  onReturnToDefault: () => void;
}

export default function MobileTreeFocusCard({
  person,
  onOpenDetails,
  helperText,
  recoveryLabel,
  onReturnToDefault,
}: MobileTreeFocusCardProps) {
  const relationshipCounts = [
    person.father || person.mother ? `${Number(Boolean(person.father)) + Number(Boolean(person.mother))} parents` : null,
    person.spouses.length > 0 ? `${person.spouses.length} spouse${person.spouses.length === 1 ? '' : 's'}` : null,
    person.children.length > 0 ? `${person.children.length} child${person.children.length === 1 ? '' : 'ren'}` : null,
    person.siblings.length > 0 ? `${person.siblings.length} sibling${person.siblings.length === 1 ? '' : 's'}` : null,
  ].filter(Boolean);

  return (
    <section className="rounded-3xl border border-shield/10 bg-white/96 p-5 shadow-[0_20px_50px_rgba(22,16,135,0.12)]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-shield/45">Viewing</p>
          <h1 className="mt-2 whitespace-normal break-words font-serif text-2xl font-semibold leading-tight text-shield">
            {person.name}
          </h1>
          <p className="mt-1 text-sm text-slate-600">{getLifespanLabel(person)}</p>
          {person.birthPlace && (
            <p className="mt-1 text-sm text-slate-500">{person.birthPlace}</p>
          )}
          <p className="mt-3 max-w-xl text-sm text-slate-600">{helperText}</p>
        </div>

        <button
          type="button"
          onClick={onOpenDetails}
          className="shrink-0 rounded-full border border-shield/15 bg-shield/5 px-3 py-2 text-sm font-semibold text-shield transition-colors hover:bg-shield/10"
        >
          Details
        </button>
      </div>

      {relationshipCounts.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {relationshipCounts.map((label) => (
            <span
              key={label}
              className="rounded-full bg-shield/6 px-3 py-1 text-xs font-medium text-shield/70"
            >
              {label}
            </span>
          ))}
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        <Link
          href={`/person/${person.id}`}
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-shield px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-shield/92"
        >
          View Profile
        </Link>
        {recoveryLabel && (
          <button
            type="button"
            onClick={onReturnToDefault}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-shield/15 bg-white px-4 py-2.5 text-sm font-semibold text-shield transition-colors hover:bg-shield/5"
          >
            {recoveryLabel}
          </button>
        )}
      </div>
    </section>
  );
}
