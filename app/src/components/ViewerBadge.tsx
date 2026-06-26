'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import BottomSheet from '@/components/mobile/BottomSheet';
import {
  useMe,
  hasViewerPerson,
  type AuthIdentity,
  type MePerson,
} from '@/components/MeProvider';
import { useKeyboardNav } from '@/hooks/useKeyboardNav';

type MobilePresentation = 'sheet' | 'inline';
type MenuPresentation = 'dropdown' | MobilePresentation;

interface ViewerBadgeProps {
  mobilePresentation?: MobilePresentation;
  onAction?: () => void;
}

interface ViewerMenuContentProps {
  me: MePerson;
  authIdentity: AuthIdentity | null;
  presentation: MenuPresentation;
  onAction?: () => void;
  onChangeViewer: () => void;
  onClearViewer: () => void;
  activeIndex?: number;
  itemRefs?: React.MutableRefObject<(HTMLElement | null)[]>;
  onKeyDown?: (e: React.KeyboardEvent) => void;
}

function getShortName(name: string) {
  const parts = name.split(' ');
  if (parts.length <= 1) return name;
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

function ViewerMenuContent({
  me,
  authIdentity,
  presentation,
  onAction,
  onChangeViewer,
  onClearViewer,
  activeIndex = -1,
  itemRefs,
  onKeyDown,
}: ViewerMenuContentProps) {
  const isMobileMenu = presentation !== 'dropdown';
  const infoBlockClass = isMobileMenu
    ? 'rounded-2xl border border-shield/10 bg-shield/5 px-4 py-4'
    : 'px-4 py-3 border-b border-gray-100';
  const actionBaseClass = isMobileMenu
    ? 'flex w-full items-center justify-between rounded-2xl border border-shield/10 bg-white px-4 py-3 text-sm font-semibold text-shield transition-colors hover:border-shield/20 hover:bg-shield/5'
    : 'block w-full px-4 py-2 text-left text-sm transition-colors';
  const neutralActionClass = isMobileMenu
    ? actionBaseClass
    : `${actionBaseClass} text-gray-700 hover:bg-gray-50`;
  const dangerActionClass = isMobileMenu
    ? `${actionBaseClass} border-red-200/80 text-red-700 hover:bg-red-50`
    : `${actionBaseClass} text-red-600 hover:bg-red-50`;

  // Build ordered list of action items for keyboard nav indexing (dropdown only)
  let itemIndex = 0;
  const nextIndex = () => itemIndex++;

  const activeClass = (idx: number) =>
    !isMobileMenu && idx === activeIndex
      ? 'bg-gray-100 ring-1 ring-inset ring-shield/20'
      : '';

  const menuItemId = (idx: number) => `viewer-menu-item-${idx}`;

  const setRef = (el: HTMLElement | null, idx: number) => {
    if (el) el.id = menuItemId(idx);
    if (itemRefs) itemRefs.current[idx] = el;
  };

  return (
    <div
      className={isMobileMenu ? 'space-y-3' : undefined}
      onKeyDown={!isMobileMenu ? onKeyDown : undefined}
    >
      {authIdentity && (
        <div className={infoBlockClass}>
          <p className="text-xs uppercase tracking-[0.2em] text-shield/45">
            Signed in as
          </p>
          <p
            className={`truncate ${isMobileMenu ? 'mt-1 text-sm font-semibold text-shield' : 'text-sm font-medium text-gray-900'}`}
          >
            {authIdentity.email}
          </p>
        </div>
      )}

      <div className={infoBlockClass}>
        <p className="text-xs uppercase tracking-[0.2em] text-shield/45">
          Current viewer
        </p>
        <p
          className={`truncate ${isMobileMenu ? 'mt-1 text-base font-semibold text-shield' : 'text-sm font-medium text-gray-900'}`}
        >
          {me.name}
        </p>
      </div>

      <div className={isMobileMenu ? 'space-y-2' : 'py-1'}>
        {hasViewerPerson(me) &&
          (() => {
            const idx = nextIndex();
            return (
              <Link
                href={`/person/${me.id}`}
                onClick={onAction}
                ref={(el) => setRef(el, idx)}
                role="menuitem"
                className={`${neutralActionClass} ${activeClass(idx)}`}
              >
                <span>Go to my profile</span>
                {isMobileMenu && (
                  <svg
                    className="h-4 w-4 shrink-0"
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
                )}
              </Link>
            );
          })()}


        {(() => {
          const idx = nextIndex();
          return (
            <button
              type="button"
              onClick={onChangeViewer}
              ref={(el) => setRef(el, idx)}
              role="menuitem"
              className={`${neutralActionClass} ${activeClass(idx)}`}
            >
              <span>Change viewer</span>
              {isMobileMenu && (
                <svg
                  className="h-4 w-4 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              )}
            </button>
          );
        })()}

        {(() => {
          const idx = nextIndex();
          return (
            <button
              type="button"
              onClick={onClearViewer}
              ref={(el) => setRef(el, idx)}
              role="menuitem"
              className={`${dangerActionClass} ${activeClass(idx)}`}
            >
              <span>Clear viewer</span>
              {isMobileMenu && (
                <svg
                  className="h-4 w-4 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              )}
            </button>
          );
        })()}

      </div>
    </div>
  );
}

export default function ViewerBadge({
  mobilePresentation,
  onAction,
}: ViewerBadgeProps) {
  const { me, setMe, setOnboardingOpen, authIdentity } = useMe();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuItemRefs = useRef<(HTMLElement | null)[]>([]);
  const presentation: MenuPresentation = mobilePresentation ?? 'dropdown';
  const isDropdown = presentation === 'dropdown';
  const isMobileSheetTrigger = presentation === 'sheet';

  useEffect(() => {
    if (!open || !isDropdown) return undefined;

    function handleClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isDropdown, open]);

  // Compute dropdown item count based on current me/authIdentity state
  const dropdownItemCount =
    (me && hasViewerPerson(me) ? 1 : 0) + // Go to my profile
    1 + // Change viewer
    1 + // Clear viewer
    (authIdentity ? 1 : 0); // Sign out

  const closeMenu = () => setOpen(false);
  const handleAction = () => {
    closeMenu();
    onAction?.();
  };
  const handleChangeViewer = () => {
    handleAction();
    setOnboardingOpen(true);
  };
  const handleClearViewer = () => {
    setMe(null);
    handleAction();
  };

  // Build ordered actions matching the render order in ViewerMenuContent
  const buildMenuActions = () => {
    const actions: (() => void)[] = [];
    if (me && hasViewerPerson(me)) actions.push(handleAction); // Go to my profile — Link handles nav, just close
    actions.push(handleChangeViewer);
    actions.push(handleClearViewer);
    return actions;
  };

  const { activeIndex, handleKeyDown } = useKeyboardNav({
    itemCount: isDropdown && open ? dropdownItemCount : 0,
    isOpen: isDropdown ? open : false,
    onSelect: (index) => {
      const actions = buildMenuActions();
      if (actions[index]) {
        // For Link items, trigger a click on the element directly
        const el = menuItemRefs.current[index];
        if (el) {
          (el as HTMLElement).click();
        } else {
          actions[index]();
        }
      }
    },
    onEscape: closeMenu,
  });

  const shortName = me ? getShortName(me.name) : null;
  const btnClass = isMobileSheetTrigger
    ? 'flex min-w-0 max-w-[8.75rem] items-center gap-1.5 rounded-full border border-white/20 bg-white/15 px-2.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-white/25'
    : 'flex min-w-0 items-center gap-1.5 rounded-full border border-white/20 bg-white/15 px-2.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-white/25 lg:px-3';

  if (!me) {
    if (presentation === 'inline') {
      return (
        <div className="space-y-3">
          <div className="rounded-2xl border border-shield/10 bg-white px-4 py-4">
            <p className="text-xs uppercase tracking-[0.2em] text-shield/45">
              Current viewer
            </p>
            <p className="mt-1 text-sm font-semibold text-shield">
              No viewer selected
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              onAction?.();
              setOnboardingOpen(true);
            }}
            className="flex w-full items-center justify-between rounded-2xl border border-shield/10 bg-white px-4 py-3 text-sm font-semibold text-shield transition-colors hover:border-shield/20 hover:bg-shield/5"
          >
            <span>Set viewer</span>
            <svg
              className="h-4 w-4 shrink-0"
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
          </button>
        </div>
      );
    }

    return (
      <button
        type="button"
        onClick={() => {
          onAction?.();
          setOnboardingOpen(true);
        }}
        aria-label="Set viewer"
        title="Set viewer"
        className={btnClass}
      >
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
            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
          />
        </svg>
        {isMobileSheetTrigger ? (
          <span className="truncate">Viewer</span>
        ) : (
          <>
            <span className="hidden xl:inline">Set viewer</span>
            <span className="hidden md:inline xl:hidden">Viewer</span>
          </>
        )}
      </button>
    );
  }

  if (presentation === 'inline') {
    return (
      <ViewerMenuContent
        me={me}
        authIdentity={authIdentity}
        presentation="inline"
        onAction={onAction}
        onChangeViewer={handleChangeViewer}
        onClearViewer={handleClearViewer}
      />
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={isDropdown ? handleKeyDown : undefined}
        aria-label={`Viewer: ${shortName}`}
        title={`Viewer: ${shortName}`}
        aria-haspopup="true"
        aria-expanded={isDropdown ? open : undefined}
        className={btnClass}
      >
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
            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
          />
        </svg>
        {isMobileSheetTrigger ? (
          <span className="truncate">{shortName}</span>
        ) : (
          <>
            <span className="hidden max-w-36 truncate xl:inline">
              Viewer: {shortName}
            </span>
            <span className="hidden max-w-24 truncate md:inline xl:hidden">
              {shortName}
            </span>
          </>
        )}
        <svg
          className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {presentation === 'sheet' && (
        <BottomSheet open={open} onClose={closeMenu} title="Viewer">
          <ViewerMenuContent
            me={me}
            authIdentity={authIdentity}
            presentation="sheet"
            onAction={handleAction}
            onChangeViewer={handleChangeViewer}
            onClearViewer={handleClearViewer}
              />
        </BottomSheet>
      )}

      {open && isDropdown && (
        <div
          className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl"
          onKeyDown={handleKeyDown}
          tabIndex={-1}
          role="menu"
          aria-activedescendant={
            activeIndex >= 0 ? `viewer-menu-item-${activeIndex}` : undefined
          }
        >
          <ViewerMenuContent
            me={me}
            authIdentity={authIdentity}
            presentation="dropdown"
            onAction={handleAction}
            onChangeViewer={handleChangeViewer}
            onClearViewer={handleClearViewer}
                activeIndex={activeIndex}
            itemRefs={menuItemRefs}
          />
        </div>
      )}
    </div>
  );
}
