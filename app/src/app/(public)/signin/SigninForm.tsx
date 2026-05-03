'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signIn } from 'next-auth/react';

/**
 * Client-side sign-in form. Extracted from signin/page.tsx so the page
 * itself can be an async server component that reads tree stats at build
 * time. Only the interactive form is an island.
 */
export function SigninForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/prepare-signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (typeof body.redirectTo === 'string') {
          router.push(body.redirectTo);
          return;
        }
        setError(body.error || 'Something went wrong. Please try again.');
        setIsSubmitting(false);
        return;
      }

      if (body.allowed) {
        await signIn('resend', {
          email: email.trim(),
          redirectTo: '/',
        });
        setIsSubmitting(false);
        return;
      }

      router.push(body.redirectTo || '/request-access');
    } catch {
      setError('Network error. Please try again.');
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
  };

  return (
    <div className="bg-white/5 border border-white/10 rounded-lg p-6 backdrop-blur-sm">
      <h2 className="text-xl font-serif font-bold text-white mb-4">Sign in</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="text-sm text-white/80 mb-1 block">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="email"
            className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-white/50"
          />
        </label>

        <button
          type="submit"
          disabled={isSubmitting || !email.trim()}
          className="w-full px-4 py-3 rounded-lg bg-white text-shield font-semibold hover:bg-white/90 disabled:opacity-50 transition-colors"
        >
          {isSubmitting ? 'Sending link...' : 'Sign in'}
        </button>

        {error && (
          <div className="text-sm text-red-300" role="alert">
            {error}
          </div>
        )}
      </form>

      <p className="mt-4 text-sm text-white/60 text-center">
        Don&apos;t have access yet?{' '}
        <Link href="/request-access" className="text-white underline">
          Request it →
        </Link>
      </p>
    </div>
  );
}
