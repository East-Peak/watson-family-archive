'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useChat } from '@/components/ChatProvider';
import ViewerBadge from '@/components/ViewerBadge';
import { siteConfig } from '@/lib/siteConfig';
import type { MobileShellChrome } from '@/components/mobile/MobileShellMode';

interface MobileTopBarProps {
  chrome: MobileShellChrome;
}

const ROUTE_LABELS: Record<string, string> = {
  '/': 'Home',
  '/activity': 'Activity',
  '/timeline': 'Timeline',
  '/tree': 'Tree',
  '/globe': 'Globe',
  '/explorer': 'Explorer',
};

export default function MobileTopBar({ chrome }: MobileTopBarProps) {
  const pathname = usePathname();
  const { openSearch, isSidebarOpen, toggleSidebar } = useChat();
  const { mode, immersiveExitHref } = chrome;
  const isImmersive = mode === 'immersive';
  const title = isImmersive ? ROUTE_LABELS[pathname] ?? siteConfig.shortTitle : siteConfig.shortTitle;

  return (
    <header
      className={`md:hidden ${isImmersive ? 'fixed inset-x-0 top-0 z-40 bg-shield/78 backdrop-blur-md' : 'sticky top-0 z-40 border-b border-white/10 bg-shield backdrop-blur-md'}`}
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
      data-comment-chrome=""
    >
      <div className="flex h-14 items-center gap-2 px-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {isImmersive && pathname !== '/' && (
            <Link
              href={immersiveExitHref ?? '/'}
              aria-label="Exit immersive mode"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 bg-black/20 text-white transition-colors hover:bg-black/30"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
          )}
          <Link
            href="/"
            className="min-w-0 truncate font-serif text-base font-semibold text-white"
          >
            {title}
          </Link>
        </div>

        <button
          type="button"
          onClick={openSearch}
          aria-label="Search"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/12 text-white transition-colors hover:bg-white/22"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>

        <ViewerBadge mobilePresentation="sheet" />

        {isImmersive && (
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label="Ask AI"
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-white transition-colors ${
              isSidebarOpen
                ? 'border-white/35 bg-white/24'
                : 'border-white/20 bg-white/12 hover:bg-white/22'
            }`}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
            </svg>
          </button>
        )}
      </div>
    </header>
  );
}
