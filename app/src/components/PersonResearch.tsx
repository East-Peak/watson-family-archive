'use client';

/**
 * Research section component for person profile pages
 * Displays verified facts, sources, and external links
 */

import React from 'react';
import type { Biography, ParsedSource } from '@/types/person';

interface PersonResearchProps {
  biography: Biography | null;
  wikitreeId: string | null;
  findagraveId: string | null;
  familysearchTreeId: string | null;
  biographyMarkdown: string | null;
  personFullName: string;
  sources?: ParsedSource[];
}

export default function PersonResearch({
  biography,
  wikitreeId,
  findagraveId,
  familysearchTreeId,
  biographyMarkdown,
  personFullName,
  sources = [],
}: PersonResearchProps) {
  const hasResearchData =
    biography?.verifiedFacts?.length ||
    biography?.keySources?.length ||
    wikitreeId ||
    findagraveId ||
    familysearchTreeId ||
    biography?.externalLinks?.length ||
    biographyMarkdown ||
    sources.length > 0;

  if (!hasResearchData) return null;

  return (
    <section className="bg-white/80 backdrop-blur-md rounded-2xl border border-white p-6 shadow-xl hover:shadow-2xl transition-shadow relative overflow-hidden group/container">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-shield/20 via-shield/40 to-shield/20"></div>
      <h2 className="text-sm font-bold text-shield uppercase tracking-widest mb-6 mt-2 relative z-10">
        Research
      </h2>

      <div className="space-y-4 relative z-10">
        {sources.length > 0 &&
          (() => {
            const byType: Record<string, ParsedSource[]> = {};
            for (const s of sources) {
              const t = s.recordType || 'other';
              (byType[t] ??= []).push(s);
            }
            return (
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                <h3 className="text-gray-900 font-medium mb-3">
                  Source Records ({sources.length})
                </h3>
                <div className="flex flex-wrap gap-2 mb-3">
                  {Object.entries(byType)
                    .sort(([, a], [, b]) => b.length - a.length)
                    .map(([type, items]) => (
                      <span
                        key={type}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-white border border-gray-200 rounded-lg text-xs text-gray-700"
                      >
                        <span className="font-medium capitalize">{type}</span>
                        <span className="text-gray-400">({items.length})</span>
                      </span>
                    ))}
                </div>
                <div className="space-y-1.5">
                  {sources.slice(0, 8).map((s, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm">
                      {s.tier && (
                        <span
                          className={`w-5 h-5 rounded text-xs font-bold flex items-center justify-center shrink-0 ${
                            s.tier === 'A'
                              ? 'bg-green-100 text-green-700'
                              : s.tier === 'B'
                                ? 'bg-blue-100 text-blue-700'
                                : s.tier === 'C'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {s.tier}
                        </span>
                      )}
                      {s.url ? (
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 hover:text-indigo-800 truncate"
                        >
                          {s.collection || s.recordType}
                        </a>
                      ) : (
                        <span className="text-gray-600 truncate">
                          {s.collection || s.recordType}
                        </span>
                      )}
                      {s.year && (
                        <span className="text-gray-400 text-xs ml-auto shrink-0">
                          {s.year}
                        </span>
                      )}
                    </div>
                  ))}
                  {sources.length > 8 && (
                    <p className="text-xs text-gray-400 mt-1">
                      +{sources.length - 8} more
                    </p>
                  )}
                </div>
              </div>
            );
          })()}

        {/* Verified facts - collapsible */}
        {biography?.verifiedFacts && biography.verifiedFacts.length > 0 && (
          <details className="group">
            <summary className="flex items-center justify-between cursor-pointer p-4 bg-gray-50 rounded-xl border border-gray-200 hover:border-gray-300 transition-colors">
              <div className="flex items-center gap-3">
                <svg
                  className="w-5 h-5 text-emerald-600"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="text-gray-900 font-medium">
                  {biography.verifiedFacts.length} Verified Facts
                </span>
              </div>
              <svg
                className="w-5 h-5 text-gray-400 group-open:rotate-180 transition-transform"
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
            </summary>
            <div className="mt-2 p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-2">
              {biography.verifiedFacts.slice(0, 6).map((fact, idx) => (
                <p
                  key={idx}
                  className="text-gray-600 text-sm flex items-start gap-2"
                >
                  <span className="text-emerald-500 mt-0.5">•</span>
                  <span>{fact}</span>
                </p>
              ))}
            </div>
          </details>
        )}

        {/* Key sources - collapsible */}
        {biography?.keySources && biography.keySources.length > 0 && (
          <details className="group">
            <summary className="flex items-center justify-between cursor-pointer p-4 bg-gray-50 rounded-xl border border-gray-200 hover:border-gray-300 transition-colors">
              <div className="flex items-center gap-3">
                <svg
                  className="w-5 h-5 text-shield"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                  />
                </svg>
                <span className="text-gray-900 font-medium">
                  {biography.keySources.length} Sources
                </span>
              </div>
              <svg
                className="w-5 h-5 text-gray-400 group-open:rotate-180 transition-transform"
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
            </summary>
            <div className="mt-2 p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-2">
              {biography.keySources.map((source, idx) => (
                <p key={idx} className="text-gray-600 text-sm">
                  {idx + 1}. {source}
                </p>
              ))}
            </div>
          </details>
        )}

        {/* External links */}
        {(wikitreeId ||
          findagraveId ||
          familysearchTreeId ||
          biography?.externalLinks?.length) && (
          <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
            <h3 className="text-gray-900 font-medium mb-3">External Records</h3>
            <div className="flex flex-wrap gap-2">
              {wikitreeId && (
                <a
                  href={`https://www.wikitree.com/wiki/${wikitreeId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-100 hover:bg-green-200 border border-green-300 rounded-lg text-sm text-green-700 transition-colors"
                >
                  WikiTree
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
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                </a>
              )}
              {findagraveId && (
                <a
                  href={`https://www.findagrave.com/memorial/${findagraveId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-orange-100 hover:bg-orange-200 border border-orange-300 rounded-lg text-sm text-orange-700 transition-colors"
                >
                  Find A Grave
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
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                </a>
              )}
              {familysearchTreeId && (
                <a
                  href={`https://www.familysearch.org/tree/person/details/${familysearchTreeId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 rounded-lg text-sm text-emerald-700 transition-colors"
                >
                  FamilySearch
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
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                </a>
              )}
              {biography?.externalLinks?.map((link, idx) => (
                <a
                  key={idx}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-lg text-sm text-gray-700 transition-colors"
                >
                  {link.label}
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
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Download full research file */}
        {biographyMarkdown && (
          <button
            onClick={() => {
              // Generate download from Neo4j content
              const blob = new Blob([biographyMarkdown], {
                type: 'text/markdown',
              });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `${personFullName.replace(/[^a-zA-Z0-9]/g, '_')}_research.md`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }}
            className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-200 transition-colors group text-left"
          >
            <div className="flex items-center gap-3">
              <svg
                className="w-5 h-5 text-shield"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <div>
                <span className="text-gray-900 font-medium">
                  Full Research File
                </span>
                <p className="text-xs text-gray-500">
                  Download complete research notes
                </p>
              </div>
            </div>
            <svg
              className="w-5 h-5 text-shield group-hover:translate-y-0.5 transition-transform"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
          </button>
        )}
      </div>
    </section>
  );
}
