'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useChat } from '@/components/ChatProvider';
import BottomSheet from '@/components/mobile/BottomSheet';

const PRIMARY_ITEMS = [
  {
    href: '/',
    label: 'Home',
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 11.25L12 4l9 7.25M5.25 10.5V20h13.5v-9.5" />
      </svg>
    ),
  },
];

const MORE_ITEMS = [
  { href: '/activity', label: 'Activity' },
  { href: '/timeline', label: 'Timeline', note: 'Mobile preview' },
  { href: '/tree', label: 'Tree', note: 'Mobile navigator' },
  { href: '/globe', label: 'Globe', note: 'Mobile preview' },
  { href: '/explorer', label: 'Data Explorer', note: 'Desktop recommended' },
];

export default function MobileBottomNav() {
  const pathname = usePathname();
  const { isSidebarOpen, toggleSidebar } = useChat();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const isMoreActive = pathname !== '/';

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 md:hidden"
        style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))' }}
        aria-label="Mobile navigation"
        data-comment-chrome=""
      >
        <div className="mx-auto max-w-md px-3">
          <div className="grid grid-cols-2 gap-3 rounded-[1.75rem] border border-shield/12 bg-white/96 px-3 py-3 shadow-[0_20px_45px_rgba(7,4,64,0.16)] backdrop-blur">
            {PRIMARY_ITEMS.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex min-h-[3.25rem] items-center justify-center gap-2 rounded-2xl px-3 py-2 text-sm font-semibold transition-colors ${
                    isActive
                      ? 'bg-shield text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]'
                      : 'bg-shield/4 text-shield/70 hover:bg-shield/8 hover:text-shield'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </Link>
              );
            })}

            <button
              type="button"
              aria-label="More"
              aria-expanded={isMoreOpen}
              aria-pressed={isMoreActive || isMoreOpen}
              onClick={() => setIsMoreOpen(true)}
              className={`flex min-h-[3.25rem] items-center justify-center gap-2 rounded-2xl px-3 py-2 text-sm font-semibold transition-colors ${
                isMoreActive || isMoreOpen
                  ? 'bg-shield text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]'
                  : 'bg-shield/4 text-shield/70 hover:bg-shield/8 hover:text-shield'
              }`}
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M4 12h16M4 17h16" />
              </svg>
              <span>More</span>
            </button>
          </div>
        </div>
      </nav>

      <BottomSheet open={isMoreOpen} onClose={() => setIsMoreOpen(false)} title="Explore More">
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => {
              setIsMoreOpen(false);
              toggleSidebar();
            }}
            className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition-colors ${
              isSidebarOpen
                ? 'border-shield/20 bg-shield/8 text-shield'
                : 'border-gray-200 text-shield hover:border-shield/25 hover:bg-shield/5'
            }`}
          >
            <span className="text-sm font-semibold">Ask AI</span>
            <span className="rounded-full bg-shield/8 px-2.5 py-1 text-xs font-medium text-shield/70">
              Assistant
            </span>
          </button>

          {MORE_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setIsMoreOpen(false)}
              className="flex items-center justify-between rounded-2xl border border-gray-200 px-4 py-3 transition-colors hover:border-shield/25 hover:bg-shield/5"
            >
              <span className="text-sm font-semibold text-shield">{item.label}</span>
              {item.note && (
                <span className="rounded-full bg-shield/8 px-2.5 py-1 text-xs font-medium text-shield/70">
                  {item.note}
                </span>
              )}
            </Link>
          ))}
        </div>
      </BottomSheet>
    </>
  );
}
