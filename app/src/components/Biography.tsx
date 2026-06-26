'use client';

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface BiographyProps {
  markdown: string;
}

export default function Biography({ markdown }: BiographyProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Remove the header section (everything before first ---) for cleaner display
  const cleanedMarkdown = markdown
    .replace(/^#.*?\n/m, '') // Remove title
    .replace(/^>.*?\n/gm, '') // Remove blockquote metadata
    .replace(/^---\n/m, ''); // Remove first separator

  // Get a preview (first ~500 chars or until ## section)
  const getPreview = () => {
    const lines = cleanedMarkdown.split('\n');
    let preview = '';
    let charCount = 0;

    for (const line of lines) {
      if (line.startsWith('## ') && charCount > 200) break;
      preview += line + '\n';
      charCount += line.length;
      if (charCount > 600) break;
    }
    return preview.trim();
  };

  const preview = getPreview();
  const hasMore = cleanedMarkdown.length > preview.length;

  return (
    <section>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-sm font-semibold text-cyan-400 uppercase tracking-wider">
          Full Biography
        </h2>
        {hasMore && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors flex items-center gap-1"
          >
            {isExpanded ? 'Show less' : 'Read full story'}
            <svg
              className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
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
        )}
      </div>

      <div
        className="prose prose-invert prose-lg max-w-none
        prose-headings:text-white prose-headings:font-semibold
        prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-4 prose-h2:text-cyan-400
        prose-h3:text-lg prose-h3:mt-6 prose-h3:mb-3
        prose-p:text-gray-300 prose-p:leading-relaxed
        prose-a:text-cyan-400 prose-a:no-underline hover:prose-a:underline
        prose-strong:text-white prose-strong:font-semibold
        prose-ul:text-gray-300 prose-ol:text-gray-300
        prose-li:marker:text-cyan-500
        prose-table:border-collapse prose-table:w-full
        prose-th:bg-gray-800/50 prose-th:text-gray-300 prose-th:font-semibold prose-th:px-4 prose-th:py-2 prose-th:text-left prose-th:border prose-th:border-gray-700
        prose-td:px-4 prose-td:py-2 prose-td:text-gray-400 prose-td:border prose-td:border-gray-700
        prose-blockquote:border-l-cyan-500 prose-blockquote:bg-gray-900/50 prose-blockquote:rounded-r-lg prose-blockquote:py-2 prose-blockquote:px-4 prose-blockquote:not-italic prose-blockquote:text-gray-400
        prose-code:bg-gray-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-cyan-300 prose-code:before:content-none prose-code:after:content-none
        prose-pre:bg-gray-900 prose-pre:border prose-pre:border-gray-700 prose-pre:rounded-xl
        prose-hr:border-gray-700
      "
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            // Custom link handler for internal links
            a: ({ href, children, ...props }) => {
              // Convert .md links to app routes if they're internal
              const isInternal =
                href?.endsWith('.md') && !href.startsWith('http');
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
                  <svg
                    className="w-3 h-3 opacity-50"
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
              );
            },
            // Style checkboxes in task lists
            input: ({ type, checked, ...props }) => {
              if (type === 'checkbox') {
                return (
                  <span
                    className={`inline-flex items-center justify-center w-5 h-5 mr-2 rounded border ${
                      checked
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                        : 'bg-gray-800 border-gray-600'
                    }`}
                  >
                    {checked && (
                      <svg
                        className="w-3 h-3"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </span>
                );
              }
              return <input type={type} {...props} />;
            },
          }}
        >
          {isExpanded ? cleanedMarkdown : preview}
        </ReactMarkdown>

        {!isExpanded && hasMore && (
          <div className="relative -mt-16 pt-16 bg-gradient-to-t from-gray-950 to-transparent">
            <button
              onClick={() => setIsExpanded(true)}
              className="w-full py-3 text-center text-cyan-400 hover:text-cyan-300 transition-colors font-medium"
            >
              Continue reading...
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
