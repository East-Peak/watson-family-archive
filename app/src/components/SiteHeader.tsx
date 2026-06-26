'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useChat } from '@/components/ChatProvider';
import { siteConfig } from '@/lib/siteConfig';
import ViewerBadge from '@/components/ViewerBadge';

// Public read-only viewer chrome: the comment pill and the Activity feed link
// are removed (their subsystems are pruned), and the "Ask AI" control only
// renders when the optional chat panel is enabled (NEXT_PUBLIC_ENABLE_CHAT).
const chatEnabled = process.env.NEXT_PUBLIC_ENABLE_CHAT === 'true';

const NAV_ITEMS = [
  { href: '/', label: 'Home' },
  { href: '/tree', label: 'Tree' },
  { href: '/globe', label: 'Globe' },
  { href: '/explorer', label: 'Data Explorer', compactLabel: 'Explorer' },
  { href: '/timeline', label: 'Timeline' },
];

const isMac =
  typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);

export default function SiteHeader() {
  const pathname = usePathname();
  const { openSearch, isSidebarOpen, toggleSidebar } = useChat();
  const navItems =
    pathname === '/'
      ? NAV_ITEMS.filter((item) => item.href !== '/')
      : NAV_ITEMS;
  const compactTitle = siteConfig.title.endsWith('Family Tree')
    ? siteConfig.title.replace('Family Tree', 'Tree')
    : siteConfig.title;
  const searchShortcut = isMac ? '⌘K' : 'Ctrl+K';
  const aiShortcut = isMac ? '⌘⇧K' : 'Ctrl+Shift+K';

  return (
    <header className="sticky top-0 z-40 w-full bg-shield border-b border-white/10 backdrop-blur-md flex-shrink-0">
      <div className="mx-auto flex h-14 max-w-full items-center gap-3 px-3 sm:px-4 md:px-6">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-3 whitespace-nowrap hover:opacity-90 transition-opacity"
        >
          <span className="font-serif text-base font-semibold text-white sm:text-lg">
            <span className="hidden lg:inline">{siteConfig.title}</span>
            <span className="lg:hidden">{compactTitle}</span>
          </span>
        </Link>

        <nav className="hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap pr-1 md:flex [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-white/15 text-white'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                } shrink-0 px-3 lg:px-4`}
              >
                <span className="xl:hidden">
                  {item.compactLabel ?? item.label}
                </span>
                <span className="hidden xl:inline">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center justify-end gap-1.5 lg:gap-2">
          <ViewerBadge />
          <button
            type="button"
            onClick={openSearch}
            aria-label={`Search ${searchShortcut}`}
            title={`Search ${searchShortcut}`}
            className="flex items-center gap-2 rounded-full border border-white/20 bg-white/15 px-2.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-white/25 lg:px-3"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <span className="hidden lg:inline">Search</span>
            <kbd className="hidden 2xl:inline ml-1 px-1.5 py-0.5 text-[10px] bg-white/10 rounded text-white/50">
              {searchShortcut}
            </kbd>
          </button>
          {chatEnabled && (
            <button
              type="button"
              id="sidebar-toggle"
              onClick={toggleSidebar}
              aria-label={`Ask AI ${aiShortcut}`}
              title={`Ask AI ${aiShortcut}`}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                isSidebarOpen
                  ? 'bg-white/25 border-white/30'
                  : 'bg-white/15 hover:bg-white/25 border-white/20'
              }`}
            >
              <svg
                className="w-4 h-4 text-white"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"
                />
              </svg>
              <span className="hidden xl:inline bg-gradient-to-r from-violet-300 via-fuchsia-300 to-amber-300 bg-clip-text text-transparent font-semibold">
                Ask AI
              </span>
              <kbd className="hidden 2xl:inline px-1.5 py-0.5 text-[10px] bg-white/10 rounded text-white/50">
                {isMac ? '⌘⇧K' : '⌃⇧K'}
              </kbd>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
