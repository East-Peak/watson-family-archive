'use client';

import Link from 'next/link';
import BottomSheet from '@/components/mobile/BottomSheet';
import type {
  MobileTreeFamilyMember,
  MobileTreePersonDetails,
} from './useMobileTreePerson';

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

function renderQuickHopSection(
  title: string,
  members: MobileTreeFamilyMember[],
  onInspectPerson: (personId: string) => void,
) {
  if (members.length === 0) return null;

  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-shield/45">
        {title}
      </h3>
      <div className="space-y-2">
        {members.map((member) => (
          <button
            key={member.id}
            type="button"
            aria-label={`Inspect ${member.name}`}
            onClick={() => onInspectPerson(member.id)}
            className="flex min-h-11 w-full items-center justify-between rounded-2xl border border-shield/10 bg-parchment/40 px-4 py-3 text-left transition-colors hover:bg-parchment/70"
          >
            <span>
              <span className="block text-sm font-semibold text-slate-800">
                {member.name}
              </span>
              {member.birthYear && (
                <span className="block text-xs text-slate-500">
                  b. {member.birthYear}
                </span>
              )}
            </span>
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-shield/55">
              Inspect
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

interface MobileTreePersonSheetProps {
  open: boolean;
  person: MobileTreePersonDetails | null;
  focusPersonId: string | null;
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
  onInspectPerson: (personId: string) => void;
  onViewHere: (personId: string) => void;
}

export default function MobileTreePersonSheet({
  open,
  person,
  focusPersonId,
  loading = false,
  error = null,
  onClose,
  onInspectPerson,
  onViewHere,
}: MobileTreePersonSheetProps) {
  const isFocusedPerson = Boolean(person?.id && person.id === focusPersonId);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={person?.name ?? 'Family Details'}
    >
      {loading && (
        <div className="py-10 text-center text-sm text-slate-500">
          Loading family details...
        </div>
      )}

      {!loading && error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && person && (
        <div className="space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-shield/45">
              Person
            </p>
            <h2 className="mt-2 font-serif text-2xl font-semibold text-shield">
              {person.name}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {getLifespanLabel(person)}
            </p>
            {person.birthPlace && (
              <p className="mt-1 text-sm text-slate-500">{person.birthPlace}</p>
            )}
            {person.occupation && (
              <p className="mt-1 text-sm text-slate-500">{person.occupation}</p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {!isFocusedPerson && (
              <button
                type="button"
                onClick={() => onViewHere(person.id)}
                className="flex min-h-11 items-center justify-center rounded-full bg-shield px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-shield/92"
              >
                View Here
              </button>
            )}
            <Link
              href={`/person/${person.id}`}
              onClick={onClose}
              className={`flex min-h-11 items-center justify-center rounded-full border border-shield/15 bg-white px-4 py-2.5 text-sm font-semibold text-shield transition-colors hover:bg-shield/5 ${
                isFocusedPerson ? 'sm:col-span-2' : ''
              }`}
            >
              View Full Profile
            </Link>
          </div>

          <div className="space-y-4">
            {renderQuickHopSection(
              'Parents',
              [person.father, person.mother].filter(
                (member): member is MobileTreeFamilyMember => Boolean(member),
              ),
              onInspectPerson,
            )}
            {renderQuickHopSection('Spouses', person.spouses, onInspectPerson)}
            {renderQuickHopSection(
              'Children',
              person.children,
              onInspectPerson,
            )}
            {renderQuickHopSection(
              'Siblings',
              person.siblings,
              onInspectPerson,
            )}
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
