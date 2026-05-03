'use client';

import React, { useState, useCallback } from 'react';

type EditorState = 'idle' | 'generating' | 'reviewing' | 'saving' | 'saved';

interface BioDraftEditorProps {
  personId: string;
  personName: string;
  existingBio?: string;
  onBioSaved?: () => void;
}

export default function BioDraftEditor({ personId, personName, existingBio, onBioSaved }: BioDraftEditorProps) {
  const [state, setState] = useState<EditorState>('idle');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    setState('generating');
    setError(null);

    try {
      const res = await fetch(`/api/person/${personId}/generate-bio`, {
        method: 'POST',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to generate biography');
      }

      const data = await res.json();
      setDraft(data.draft);
      setState('reviewing');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate biography');
      setState('idle');
    }
  }, [personId]);

  const handleSave = useCallback(async () => {
    setState('saving');
    setError(null);

    try {
      const res = await fetch(`/api/person/${personId}/biography`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ biography: draft }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save biography');
      }

      setState('saved');
      onBioSaved?.();

      // Reset after 3 seconds
      setTimeout(() => setState('idle'), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save biography');
      setState('reviewing');
    }
  }, [personId, draft, onBioSaved]);

  const handleDiscard = useCallback(() => {
    setDraft('');
    setState('idle');
    setError(null);
  }, []);

  return (
    <div className="mt-4">
      {/* Error Display */}
      {error && (
        <div className="mb-3 px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Idle State */}
      {state === 'idle' && (
        <button
          onClick={handleGenerate}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            existingBio
              ? 'border border-gray-200 text-gray-500 hover:text-shield hover:border-shield/30'
              : 'bg-shield text-white hover:bg-shield/90'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          {existingBio ? 'Regenerate Biography' : 'Generate Biography'}
        </button>
      )}

      {/* Generating State */}
      {state === 'generating' && (
        <div className="flex items-center gap-3 px-4 py-3 bg-shield/5 border border-shield/10 rounded-xl">
          <div className="flex gap-1">
            <span className="w-2 h-2 bg-shield rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-2 h-2 bg-shield rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-2 h-2 bg-shield rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
          <span className="text-sm text-shield/70">
            Generating biography draft for {personName}...
          </span>
        </div>
      )}

      {/* Reviewing State */}
      {state === 'reviewing' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg">
            <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span className="text-xs text-amber-700 font-medium">AI-generated draft — review before saving</span>
          </div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={12}
            className="w-full px-4 py-3 bg-cream border border-gray-200 rounded-xl text-gray-700 font-serif leading-relaxed focus:outline-none focus:border-shield focus:ring-1 focus:ring-shield resize-y"
          />
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-oak text-white rounded-lg text-sm font-medium hover:bg-oak-dark transition-colors"
            >
              Save to Profile
            </button>
            <button
              onClick={handleDiscard}
              className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {/* Saving State */}
      {state === 'saving' && (
        <div className="flex items-center gap-3 px-4 py-3 bg-oak/5 border border-oak/10 rounded-xl">
          <div className="flex gap-1">
            <span className="w-2 h-2 bg-oak rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-2 h-2 bg-oak rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-2 h-2 bg-oak rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
          <span className="text-sm text-oak/70">Saving biography...</span>
        </div>
      )}

      {/* Saved State */}
      {state === 'saved' && (
        <div className="flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 rounded-lg animate-in fade-in duration-300">
          <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-sm text-green-700 font-medium">Biography saved successfully</span>
        </div>
      )}
    </div>
  );
}
