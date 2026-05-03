'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface RequestAccessFormProps {
  initialEmail?: string;
}

export function RequestAccessForm({ initialEmail = '' }: RequestAccessFormProps) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState(initialEmail);
  const [relationship, setRelationship] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch('/api/auth/clear-prefilled-email', { method: 'POST' }).catch(() => {
      // Best effort only — stale prefill is annoying, not fatal.
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/request-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, relationship, message }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error || 'Something went wrong. Please try again.');
        setIsSubmitting(false);
        return;
      }
      router.push('/request-access/sent');
    } catch {
      setError('Network error. Please try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-shield py-12">
      <div className="max-w-md w-full mx-auto p-8">
        <h1 className="text-2xl font-serif font-bold text-white mb-2">
          Request access
        </h1>
        <p className="text-white/70 mb-4">
          The Watson Family Tree is a private project for family and a few interested friends.
          Tell us a bit about yourself and Stuart will be in touch.
        </p>
        <p className="text-white/50 text-sm mb-8">
          Already have access? Double-check your email for typos and{' '}
          <Link href="/signin" className="text-white underline">
            try again
          </Link>
          .
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="text-sm text-white/80 mb-1 block">Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-white/50"
            />
          </label>

          <label className="block">
            <span className="text-sm text-white/80 mb-1 block">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-white/50"
            />
          </label>

          <label className="block">
            <span className="text-sm text-white/80 mb-1 block">
              How do you know the family? <span className="text-white/40">(optional)</span>
            </span>
            <input
              type="text"
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
              placeholder="e.g., Christine's sister, or 'I saw this on Stuart's portfolio'"
              className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-white/50"
            />
          </label>

          <label className="block">
            <span className="text-sm text-white/80 mb-1 block">
              Anything else? <span className="text-white/40">(optional)</span>
            </span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-white/50"
            />
          </label>

          {error && (
            <div className="text-red-300 text-sm">{error}</div>
          )}

          <button
            type="submit"
            disabled={isSubmitting || !name.trim() || !email.trim()}
            className="w-full px-4 py-3 rounded-lg bg-white text-shield font-semibold hover:bg-white/90 disabled:opacity-50 transition-colors"
          >
            {isSubmitting ? 'Sending...' : 'Request access'}
          </button>
        </form>
      </div>
    </main>
  );
}
