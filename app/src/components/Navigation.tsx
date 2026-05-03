'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useChat } from '@/components/ChatProvider';
import { siteConfig } from '@/lib/siteConfig';
import ViewerBadge from '@/components/ViewerBadge';

interface NavigationProps {
  variant?: 'default' | 'transparent' | 'dark';
  showBackButton?: boolean;
  backHref?: string;
  backLabel?: string;
  rightContent?: React.ReactNode;
}

export default function Navigation({
  variant = 'default',
  showBackButton = false,
  backHref = '/',
  backLabel = 'Home',
  rightContent,
}: NavigationProps) {
  const pathname = usePathname();
  const { openSearch } = useChat();

  const isActive = (path: string) => pathname === path;

  const bgClass = {
    default: 'bg-shield',
    transparent: 'bg-shield/80 backdrop-blur-lg',
    dark: 'bg-black/90 backdrop-blur-lg',
  }[variant];

  const navLinks = [
    { href: '/tree', label: 'Tree' },
    { href: '/globe', label: 'Globe' },
    { href: '/timeline', label: 'Timeline' },
    { href: '/activity', label: 'Activity' },
  ];

  return (
    <header className={`${bgClass} text-white sticky top-0 z-50 border-b border-white/10`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
        {/* Left: Logo or Back Button */}
        {showBackButton ? (
          <Link
            href={backHref}
            className="flex items-center gap-2 text-white/70 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span className="hidden sm:inline">{backLabel}</span>
          </Link>
        ) : (
          <Link href="/" className="flex items-center gap-3 hover:opacity-90 transition-opacity">
            <div className="hidden sm:block">
              <h1 className="font-serif text-lg font-semibold leading-tight">{siteConfig.title}</h1>
            </div>
          </Link>
        )}

        {/* Center: Nav Links (desktop) */}
        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive(link.href)
                  ? 'bg-white/15 text-white'
                  : 'text-white/70 hover:text-white hover:bg-white/10'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Right: Custom content + Search */}
        <div className="flex items-center gap-2">
          {rightContent}
          <ViewerBadge />
          <button
            onClick={openSearch}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span className="hidden sm:inline">Search</span>
            <kbd className="hidden sm:inline ml-1 px-1.5 py-0.5 text-[10px] bg-white/10 rounded text-white/50">⌘K</kbd>
          </button>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <MobileMenu navLinks={navLinks} currentPath={pathname} />
          </div>
        </div>
      </div>
    </header>
  );
}

function MobileMenu({ navLinks, currentPath }: { navLinks: { href: string; label: string }[]; currentPath: string }) {
  return (
    <div className="relative group">
      <button className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Dropdown */}
      <div className="absolute right-0 top-full mt-2 w-48 bg-shield rounded-lg shadow-xl border border-white/10 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
        <div className="py-2">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`block px-4 py-2 text-sm ${
                currentPath === link.href
                  ? 'bg-white/15 text-white'
                  : 'text-white/70 hover:text-white hover:bg-white/10'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
