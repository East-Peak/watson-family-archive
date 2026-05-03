'use client';

import MobileTreeFocusCard from './MobileTreeFocusCard';
import MobileTreePersonSheet from './MobileTreePersonSheet';
import MobileTreeRelationshipGroup from './MobileTreeRelationshipGroup';
import type { MobileTreeFamilyMember, MobileTreePersonDetails } from './useMobileTreePerson';

function collectParents(person: MobileTreePersonDetails): MobileTreeFamilyMember[] {
  return [person.father, person.mother].filter((member): member is MobileTreeFamilyMember => Boolean(member));
}

interface MobileTreeNavigatorProps {
  focusPerson: MobileTreePersonDetails | null;
  detailPerson: MobileTreePersonDetails | null;
  loading: boolean;
  error: string | null;
  detailLoading?: boolean;
  detailError?: string | null;
  detailOpen?: boolean;
  defaultFocusLabel: string | null;
  showRecoveryAction: boolean;
  onSelectFocus: (personId: string) => void;
  onOpenDetails: (personId: string) => void;
  onCloseDetails: () => void;
  onInspectPerson: (personId: string) => void;
  onViewHere: (personId: string) => void;
  onReturnToDefault: () => void;
}

export default function MobileTreeNavigator({
  focusPerson,
  detailPerson,
  loading,
  error,
  detailLoading = false,
  detailError = null,
  detailOpen = false,
  defaultFocusLabel,
  showRecoveryAction,
  onSelectFocus,
  onOpenDetails,
  onCloseDetails,
  onInspectPerson,
  onViewHere,
  onReturnToDefault,
}: MobileTreeNavigatorProps) {
  if (loading) {
    return (
      <div data-testid="mobile-tree-navigator" className="md:hidden px-4 py-6">
        <div className="rounded-3xl border border-shield/10 bg-white/96 px-5 py-8 text-center text-sm text-slate-500 shadow-[0_18px_40px_rgba(22,16,135,0.1)]">
          Loading family navigator...
        </div>
      </div>
    );
  }

  if (error || !focusPerson) {
    return (
      <div data-testid="mobile-tree-navigator" className="md:hidden px-4 py-6">
        <div className="rounded-3xl border border-red-200 bg-red-50 px-5 py-6 text-sm text-red-700 shadow-sm">
          {error ?? 'Unable to load the tree navigator.'}
        </div>
      </div>
    );
  }

  return (
    <div data-testid="mobile-tree-navigator" className="md:hidden space-y-4 px-4 py-6">
      <MobileTreeFocusCard
        person={focusPerson}
        onOpenDetails={() => onOpenDetails(focusPerson.id)}
        helperText="Tap a relative below to view them here. Use the details button to inspect without losing your place."
        recoveryLabel={showRecoveryAction ? defaultFocusLabel : null}
        onReturnToDefault={onReturnToDefault}
      />

      <MobileTreeRelationshipGroup
        title="Parents"
        members={collectParents(focusPerson)}
        onSelectFocus={onSelectFocus}
        onOpenDetails={onOpenDetails}
      />

      <MobileTreeRelationshipGroup
        title="Spouses"
        members={focusPerson.spouses}
        onSelectFocus={onSelectFocus}
        onOpenDetails={onOpenDetails}
      />

      <MobileTreeRelationshipGroup
        title="Children"
        members={focusPerson.children}
        onSelectFocus={onSelectFocus}
        onOpenDetails={onOpenDetails}
      />

      <MobileTreeRelationshipGroup
        title="Siblings"
        members={focusPerson.siblings}
        onSelectFocus={onSelectFocus}
        onOpenDetails={onOpenDetails}
      />

      <MobileTreePersonSheet
        open={detailOpen}
        person={detailPerson}
        loading={detailLoading}
        error={detailError}
        onClose={onCloseDetails}
        onInspectPerson={onInspectPerson}
        onViewHere={onViewHere}
        focusPersonId={focusPerson.id}
      />
    </div>
  );
}
