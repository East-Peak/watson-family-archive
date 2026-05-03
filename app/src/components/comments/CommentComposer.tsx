'use client';

import { useEffect, useCallback, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import type { ContributionEntity, ContributionKind } from '@/lib/contributions/types';
import { getRouteContextSnapshot } from '@/lib/comments/routeContextStore';
import { useToast } from '@/components/ui/Toast';
import AnchorBadge from './AnchorBadge';

interface CommentComposerProps {
  entity: ContributionEntity | null;
  selector: string;
  url: string;
  onClose: () => void;
  onSubmitted: () => void;
}

const KIND_OPTIONS: { kind: ContributionKind; label: string; description: string }[] = [
  { kind: 'error', label: 'Flag an issue', description: 'Something is wrong or inaccurate' },
  { kind: 'knowledge', label: 'Add knowledge', description: 'Share what you know' },
  { kind: 'question', label: 'Ask a question', description: 'Ask Stuart to look into something' },
];

type SubmitState = 'idle' | 'submitting' | 'success' | 'error';

export default function CommentComposer({
  entity,
  selector,
  url,
  onClose,
  onSubmitted,
}: CommentComposerProps) {
  const [kind, setKind] = useState<ContributionKind>('error');
  const [body, setBody] = useState('');
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [mounted, setMounted] = useState(false);
  const { showToast } = useToast();

  const routeContext = getRouteContextSnapshot();

  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [handleEscape]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;

    setSubmitState('submitting');

    try {
      const payload = {
        kind,
        body: body.trim(),
        url,
        selector,
        entity: entity ?? undefined,
        routeContext: routeContext ?? undefined,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
      };

      const res = await fetch('/api/contributions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        setSubmitState('error');
        return;
      }

      setSubmitState('success');
      showToast({
        type: 'success',
        message: 'Sent — thanks!',
        link: { label: 'View my contributions', href: '/my-contributions' },
      });
      onSubmitted();
    } catch {
      setSubmitState('error');
    }
  }

  const headerText = entity
    ? `Comment on ${entity.id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}`
    : `Comment on ${url}`;

  if (!mounted) {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] overflow-y-auto bg-black/40"
      data-comment-chrome=""
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex min-h-full items-start justify-center px-4 py-24 md:px-6 md:py-20">
        <form
          onSubmit={handleSubmit}
          role="dialog"
          aria-modal="true"
          aria-label={headerText}
          className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
          data-comment-chrome=""
        >
          <div className="border-b border-gray-100 px-6 pb-3 pt-5">
            <h2 className="truncate text-lg font-semibold text-gray-900">{headerText}</h2>
            <AnchorBadge entity={entity} url={url} routeContext={routeContext} />
          </div>

          <div className="flex flex-wrap gap-2 px-6 pt-4">
            {KIND_OPTIONS.map((opt) => (
              <button
                key={opt.kind}
                type="button"
                onClick={() => setKind(opt.kind)}
                title={opt.description}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                  kind === opt.kind
                    ? 'border-shield bg-shield text-white'
                    : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-400'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="px-6 pt-4">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="What did you notice?"
              rows={4}
              className="min-h-[100px] w-full max-h-[300px] resize-y rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-shield focus:ring-1 focus:ring-shield"
              autoFocus
            />
          </div>

          {submitState === 'error' && (
            <div className="px-6 pt-2 text-sm text-red-600">
              Couldn&apos;t save your comment. Please try again.
            </div>
          )}

          <div className="flex justify-end gap-3 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!body.trim() || submitState === 'submitting'}
              aria-label="Submit"
              className="rounded-xl bg-shield px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-shield-deep disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitState === 'submitting' ? 'Sending...' : 'Submit'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
