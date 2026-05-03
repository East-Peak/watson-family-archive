import type { ReactNode } from 'react';

export interface ArchiveCardProps {
  /** The question being asked of the research assistant. */
  question: string;
  /** The answer — ReactNode so callers can include inline elements like <em>. */
  answer: ReactNode;
  /** The sources line, displayed beneath a hairline divider. */
  sources: string;
  /** Optional eyebrow label, e.g. "research assistant". Hidden when omitted. */
  label?: string;
  /** Visual density: 'hero' (larger, hero column) or 'tour' (smaller, tour grid). */
  variant?: 'hero' | 'tour';
}

/**
 * A typeset research excerpt card. Used twice on the sign-in page:
 * - In the hero, beneath the sign-in form, unlabeled (reads as a quoted excerpt)
 * - In the tour grid, labeled "research assistant" (reads as the AI feature)
 *
 * Pure presentational. No client interactivity. Safe in server components.
 */
export function ArchiveCard({
  question,
  answer,
  sources,
  label,
  variant = 'hero',
}: ArchiveCardProps) {
  const isHero = variant === 'hero';

  return (
    <div
      className={`bg-white/[0.04] border border-white/10 rounded-lg backdrop-blur-sm ${
        isHero ? 'p-6' : 'p-5'
      }`}
    >
      {label && (
        <p className="text-[10px] uppercase tracking-[0.18em] text-amber-200/70 mb-3 font-medium">
          {label}
        </p>
      )}

      <p
        className={`font-serif text-white/95 mb-3 leading-snug ${
          isHero ? 'text-base' : 'text-sm'
        }`}
      >
        <span className="text-white/35 font-sans mr-1">Q.</span>
        {question}
      </p>

      <p
        className={`text-white/70 leading-relaxed ${
          isHero ? 'text-sm' : 'text-[13px]'
        }`}
      >
        <span className="text-white/35 font-sans mr-1">A.</span>
        {answer}
      </p>

      <p
        className={`mt-4 pt-3 border-t border-white/10 italic text-white/45 ${
          isHero ? 'text-xs' : 'text-[11px]'
        }`}
      >
        {sources}
      </p>
    </div>
  );
}
