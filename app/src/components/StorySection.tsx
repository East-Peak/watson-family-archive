'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { composeStructuredStory } from '@/lib/composeStructuredStory';
import type { Individual, FamilyRelationships, Biography } from '@/types/person';

interface StorySectionProps {
  bioTier: string | null;
  narrativeBio: string | null;
  person: Individual;
  family: FamilyRelationships | null;
  biography: Biography | null;
}

/**
 * Story section with bio_tier-aware rendering:
 *
 * - hand_crafted / composed: Render biography markdown with ReactMarkdown
 * - structured_only: Compose a summary from structured data
 * - stub / null: Hide the Story section entirely
 */
export default function StorySection({
  bioTier,
  narrativeBio,
  person,
  family,
  biography,
}: StorySectionProps) {
  // stub tier: no Story section at all
  if (bioTier === 'stub') return null;

  // Determine rendering mode
  const isHandCraftedOrComposed = bioTier === 'hand_crafted' || bioTier === 'composed';
  const isStructuredOnly = bioTier === 'structured_only';

  // For hand_crafted/composed with actual bio content, render markdown
  if (isHandCraftedOrComposed && narrativeBio) {
    return (
      <section className="bg-white/80 backdrop-blur-md rounded-2xl border border-white p-8 shadow-xl hover:shadow-2xl transition-shadow relative overflow-hidden group">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-oak/20 via-oak/40 to-oak/20"></div>
        <div className="flex items-center gap-3 mb-6 relative z-10">
          <h2 className="text-sm font-bold text-shield uppercase tracking-widest">Story</h2>
          {bioTier === 'composed' && (
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
              AI-composed
            </span>
          )}
        </div>

        <div className="prose prose-gray max-w-none
          prose-headings:text-gray-900 prose-headings:font-semibold
          prose-h3:text-base prose-h3:mt-6 prose-h3:mb-3
          prose-p:text-gray-900 prose-p:leading-relaxed
          prose-a:text-shield prose-a:no-underline hover:prose-a:underline
          prose-strong:text-gray-900 prose-strong:font-semibold
          prose-ul:text-gray-900 prose-ol:text-gray-900
          prose-li:marker:text-gray-400
          prose-table:border-collapse prose-table:w-full
          prose-th:bg-gray-50 prose-th:text-gray-700 prose-th:font-semibold prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:text-sm prose-th:border prose-th:border-gray-200
          prose-td:px-3 prose-td:py-2 prose-td:text-gray-900 prose-td:text-sm prose-td:border prose-td:border-gray-200
          prose-blockquote:border-l-shield/30 prose-blockquote:bg-gray-50 prose-blockquote:rounded-r-lg prose-blockquote:py-2 prose-blockquote:px-4 prose-blockquote:not-italic prose-blockquote:text-gray-700
        ">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ href, children, ...props }) => {
                const isInternal = href?.endsWith('.md') && !href.startsWith('http');
                if (isInternal) {
                  return <span className="text-gray-500">{children}</span>;
                }
                return (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1"
                    {...props}
                  >
                    {children}
                    <svg className="w-3 h-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                );
              },
            }}
          >
            {narrativeBio}
          </ReactMarkdown>
        </div>
      </section>
    );
  }

  // For structured_only, compose summary from data
  if (isStructuredOnly) {
    const paragraphs = composeStructuredStory(
      {
        fullName: person.fullName,
        sex: person.sex,
        birthDate: person.birthDate,
        birthYear: person.birthYear,
        birthPlace: person.birthPlace,
        deathDate: person.deathDate,
        deathYear: person.deathYear,
        deathPlace: person.deathPlace,
        isLiving: person.isLiving,
      },
      family ? {
        father: family.father,
        mother: family.mother,
        spouses: family.spouses?.map(s => ({ name: s.name, marriageYear: s.marriageYear })),
        children: family.children,
      } : null,
      biography ? {
        occupations: biography.occupations,
        timelineHighlights: biography.timelineHighlights,
      } : null,
    );

    if (paragraphs.length === 0) return null;

    return (
      <section className="bg-white/80 backdrop-blur-md rounded-2xl border border-white p-8 shadow-xl hover:shadow-2xl transition-shadow relative overflow-hidden group">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-oak/20 via-oak/40 to-oak/20"></div>
        <h2 className="text-sm font-bold text-shield uppercase tracking-widest mb-6 relative z-10">Story</h2>
        <div className="space-y-4 text-gray-900 leading-relaxed relative z-10 font-serif text-lg">
          {paragraphs.map((paragraph, idx) => (
            <p key={idx}>{paragraph}</p>
          ))}
        </div>
      </section>
    );
  }

  // Fallback for null bioTier (pre-classification) — use old structured rendering
  // This ensures nothing breaks before classify_bios.mjs is run
  if (!bioTier) {
    const hasContent = narrativeBio || person.birthPlace || person.deathPlace;
    if (!hasContent) return null;

    // If there's a narrative bio, render it as markdown (fixes the raw asterisks problem)
    if (narrativeBio) {
      return (
        <section className="bg-white/80 backdrop-blur-md rounded-2xl border border-white p-8 shadow-xl hover:shadow-2xl transition-shadow relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-oak/20 via-oak/40 to-oak/20"></div>
          <h2 className="text-sm font-bold text-shield uppercase tracking-widest mb-6 relative z-10">Story</h2>
          <div className="prose prose-gray max-w-none relative z-10
            prose-p:text-gray-900 prose-p:leading-relaxed prose-p:font-serif prose-p:text-lg
            prose-strong:text-gray-900 prose-strong:font-semibold
            prose-a:text-shield
          ">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {narrativeBio}
            </ReactMarkdown>
          </div>
        </section>
      );
    }

    // Fall back to structured compose
    const paragraphs = composeStructuredStory(
      {
        fullName: person.fullName,
        sex: person.sex,
        birthDate: person.birthDate,
        birthYear: person.birthYear,
        birthPlace: person.birthPlace,
        deathDate: person.deathDate,
        deathYear: person.deathYear,
        deathPlace: person.deathPlace,
        isLiving: person.isLiving,
      },
      family ? {
        father: family.father,
        mother: family.mother,
        spouses: family.spouses?.map(s => ({ name: s.name, marriageYear: s.marriageYear })),
        children: family.children,
      } : null,
      biography ? {
        occupations: biography.occupations,
        timelineHighlights: biography.timelineHighlights,
      } : null,
    );

    if (paragraphs.length === 0) return null;

    return (
      <section className="bg-white/80 backdrop-blur-md rounded-2xl border border-white p-8 shadow-xl hover:shadow-2xl transition-shadow relative overflow-hidden group">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-oak/20 via-oak/40 to-oak/20"></div>
        <h2 className="text-sm font-bold text-shield uppercase tracking-widest mb-6 relative z-10">Story</h2>
        <div className="space-y-4 text-gray-900 leading-relaxed relative z-10 font-serif text-lg">
          {paragraphs.map((paragraph, idx) => (
            <p key={idx}>{paragraph}</p>
          ))}
        </div>
      </section>
    );
  }

  return null;
}
