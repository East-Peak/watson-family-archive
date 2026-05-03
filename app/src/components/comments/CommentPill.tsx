'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { enterCommentMode, type CommentModeResult } from '@/lib/comments/commentMode';
import type { ClickResolution } from '@/lib/comments/captureClick';
import CommentComposer from './CommentComposer';

/**
 * Comment button — lives in the top nav bar (SiteHeader).
 * Click → enter comment mode (click anything on the page to anchor a comment)
 * Click again → exit comment mode
 * After click capture → open composer modal
 */
export default function CommentPill() {
  const [inCommentMode, setInCommentMode] = useState(false);
  const [composerData, setComposerData] = useState<ClickResolution | null>(null);
  const handleRef = useRef<CommentModeResult | null>(null);

  useEffect(() => {
    return () => {
      handleRef.current?.exit();
    };
  }, []);

  const handleCapture = useCallback((resolution: ClickResolution) => {
    setInCommentMode(false);
    handleRef.current = null;
    setComposerData(resolution);
  }, []);

  function handleClick() {
    if (inCommentMode) {
      handleRef.current?.exit();
      handleRef.current = null;
      setInCommentMode(false);
      return;
    }

    const handle = enterCommentMode(handleCapture);
    handleRef.current = handle;
    setInCommentMode(true);
  }

  function handleComposerClose() {
    setComposerData(null);
  }

  function handleComposerSubmitted() {
    setComposerData(null);
  }

  return (
    <>
      {inCommentMode && (
        <div
          className="fixed top-16 left-1/2 -translate-x-1/2 z-[9995] bg-shield/95 text-white text-sm font-medium px-4 py-2 rounded-xl shadow-lg"
          data-comment-chrome=""
        >
          Click anything to comment on it. Press Esc to cancel.
        </div>
      )}

      <button
        type="button"
        onClick={handleClick}
        aria-label={inCommentMode ? 'Cancel comment' : 'Leave a comment'}
        title={inCommentMode ? 'Cancel comment' : 'Leave a comment'}
        data-comment-chrome=""
        className={`flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-sm font-medium transition-colors lg:px-3 ${
          inCommentMode
            ? 'bg-white text-shield border-white hover:bg-white/90'
            : 'bg-white/15 text-white hover:bg-white/25 border-white/20'
        }`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
        <span className="hidden xl:inline">{inCommentMode ? 'Cancel' : 'Comment'}</span>
      </button>

      {composerData && (
        <CommentComposer
          entity={composerData.entity}
          selector={composerData.selector}
          url={typeof window !== 'undefined' ? window.location.pathname : ''}
          onClose={handleComposerClose}
          onSubmitted={handleComposerSubmitted}
        />
      )}
    </>
  );
}
