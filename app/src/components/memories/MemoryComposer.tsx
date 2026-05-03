'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';

interface MemoryComposerProps {
  personId: string;
  personName: string;
}

type SubmitState = 'idle' | 'submitting' | 'error';

export default function MemoryComposer({ personId, personName }: MemoryComposerProps) {
  const [body, setBody] = useState('');
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState('');
  const [where, setWhere] = useState('');
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const router = useRouter();
  const { showToast } = useToast();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;

    setSubmitState('submitting');

    try {
      const payload = {
        kind: 'memory' as const,
        body: body.trim(),
        url: `/person/${personId}`,
        entity: { type: 'person', id: personId },
        title: title.trim() || undefined,
        when: when.trim() || undefined,
        where: where.trim() || undefined,
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

      showToast({
        type: 'success',
        message: 'Memory shared — thanks!',
        link: { label: 'View my contributions', href: '/my-contributions' },
      });
      router.push(`/person/${personId}`);
    } catch {
      setSubmitState('error');
    }
  }

  return (
    <div className="min-h-full bg-cream">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Share a Memory of {personName}
        </h1>
        <p className="text-gray-500 text-sm mb-8">
          Tell the family something you remember. Photos, stories, anecdotes — anything that helps
          keep their memory alive.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="memory-title" className="block text-sm font-medium text-gray-700 mb-1">
              Title <span className="text-gray-400">(optional)</span>
            </label>
            <input
              id="memory-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Fishing at Sugar Creek"
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-shield focus:ring-1 focus:ring-shield"
            />
          </div>

          <div>
            <label htmlFor="memory-body" className="block text-sm font-medium text-gray-700 mb-1">
              Your memory
            </label>
            <textarea
              id="memory-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={`Tell us about ${personName}...`}
              rows={8}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-shield focus:ring-1 focus:ring-shield resize-y min-h-[200px]"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="memory-when" className="block text-sm font-medium text-gray-700 mb-1">
                When <span className="text-gray-400">(optional)</span>
              </label>
              <input
                id="memory-when"
                type="text"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
                placeholder="e.g., Summer 1965"
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-shield focus:ring-1 focus:ring-shield"
              />
            </div>
            <div>
              <label htmlFor="memory-where" className="block text-sm font-medium text-gray-700 mb-1">
                Where <span className="text-gray-400">(optional)</span>
              </label>
              <input
                id="memory-where"
                type="text"
                value={where}
                onChange={(e) => setWhere(e.target.value)}
                placeholder="e.g., Lake of the Ozarks"
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-shield focus:ring-1 focus:ring-shield"
              />
            </div>
          </div>

          {submitState === 'error' && (
            <p className="text-sm text-red-600">
              Couldn&apos;t save your memory. Please try again.
            </p>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={() => router.push(`/person/${personId}`)}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!body.trim() || submitState === 'submitting'}
              aria-label="Share memory"
              className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-shield text-white hover:bg-shield-deep disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitState === 'submitting' ? 'Sharing...' : 'Share Memory'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
