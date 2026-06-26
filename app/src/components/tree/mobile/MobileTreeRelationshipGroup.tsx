'use client';

import type { MobileTreeFamilyMember } from './useMobileTreePerson';

interface MobileTreeRelationshipGroupProps {
  title: string;
  members: MobileTreeFamilyMember[];
  onSelectFocus: (personId: string) => void;
  onOpenDetails: (personId: string) => void;
}

export default function MobileTreeRelationshipGroup({
  title,
  members,
  onSelectFocus,
  onOpenDetails,
}: MobileTreeRelationshipGroupProps) {
  return (
    <section className="rounded-3xl border border-shield/10 bg-white/92 p-4 shadow-[0_14px_32px_rgba(22,16,135,0.08)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-serif text-xl font-semibold text-shield">
          {title}
        </h2>
        <span className="rounded-full bg-shield/6 px-2.5 py-1 text-xs font-medium text-shield/65">
          {members.length}
        </span>
      </div>

      {members.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-shield/10 bg-parchment/55 px-4 py-3 text-sm text-slate-500">
          No known {title.toLowerCase()} yet.
        </p>
      ) : (
        <div className="space-y-2">
          {members.map((member) => (
            <div
              key={member.id}
              className="flex items-center gap-2 rounded-2xl border border-shield/10 bg-parchment/40 p-2"
            >
              <button
                type="button"
                aria-label={`View ${member.name} here`}
                onClick={() => onSelectFocus(member.id)}
                className="flex min-h-11 flex-1 items-center justify-between rounded-2xl px-3 py-2 text-left transition-colors hover:bg-white/70"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-800">
                    {member.name}
                  </span>
                  {member.birthYear && (
                    <span className="block text-xs text-slate-500">
                      b. {member.birthYear}
                    </span>
                  )}
                </span>
                <span className="ml-3 flex shrink-0 items-center gap-2 text-xs font-semibold text-shield/55">
                  <span className="uppercase tracking-[0.14em]">View</span>
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </span>
              </button>

              <button
                type="button"
                aria-label={`Inspect ${member.name}`}
                onClick={() => onOpenDetails(member.id)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-shield/12 bg-white text-shield/70 transition-colors hover:bg-shield/5 hover:text-shield"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
