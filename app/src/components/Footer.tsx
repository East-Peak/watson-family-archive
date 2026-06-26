'use client';

import Link from 'next/link';
import { useChat } from '@/components/ChatProvider';
import { siteConfig } from '@/lib/siteConfig';

interface FooterProps {
  stats?: {
    totalIndividuals: number;
    earliestBirth: number;
    latestBirth: number;
  };
  className?: string;
}

// Public read-only viewer chrome: the Activity feed link and the
// leave-a-comment trigger are removed (their subsystems are pruned).
export default function Footer({ stats, className = '' }: FooterProps) {
  const { openSearch } = useChat();

  return (
    <footer className={`bg-shield text-white py-12 px-6 ${className}`}>
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-center md:text-left">
            <div className="flex items-center gap-2 justify-center md:justify-start mb-2">
              <span className="font-serif text-lg">{siteConfig.title}</span>
            </div>
            {stats && (
              <p className="text-white/70 text-sm">
                {stats.totalIndividuals.toLocaleString()} individuals spanning{' '}
                {stats.earliestBirth} to {stats.latestBirth}
              </p>
            )}
          </div>
          <nav className="flex items-center gap-6 text-sm">
            <Link
              href="/tree"
              className="text-white/70 hover:text-white transition-colors"
            >
              Tree
            </Link>
            <Link
              href="/globe"
              className="text-white/70 hover:text-white transition-colors"
            >
              Globe
            </Link>
            <Link
              href="/timeline"
              className="text-white/70 hover:text-white transition-colors"
            >
              Timeline
            </Link>
            <button
              onClick={openSearch}
              className="text-white/70 hover:text-white transition-colors"
            >
              Search
            </button>
          </nav>
        </div>
        <div className="mt-8 pt-8 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-white/50 text-xs">{siteConfig.tagline}</p>
          <div className="flex items-center gap-4 text-xs">
            <a
              href="mailto:stuart@eastpeak.cc"
              className="text-white/50 hover:text-white transition-colors flex items-center gap-1.5"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
              Get in touch
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
