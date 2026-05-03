import Link from 'next/link';
import { SigninHeraldicHeader } from '@/components/SigninHeraldicHeader';

interface SigninErrorPageProps {
  searchParams?: Promise<{
    reason?: string;
  }>;
}

export default async function SigninErrorPage({ searchParams }: SigninErrorPageProps) {
  const params = await searchParams;
  const isAuthMisconfigured = params?.reason === 'auth-misconfigured';

  return (
    <main className="min-h-screen bg-shield flex flex-col">
      <SigninHeraldicHeader />
      <div className="flex-1 flex items-center justify-center px-4 pb-12">
        <div className="max-w-md w-full mx-auto text-center">
          <div className="text-5xl mb-4">⚠️</div>
          <h2 className="text-2xl font-serif font-bold text-white mb-2">
            Sign-in error
          </h2>
          <p className="text-white/70 mb-6">
            {isAuthMisconfigured
              ? 'Authentication is temporarily unavailable. Stuart needs to fix the allowlist configuration before sign-in can continue.'
              : 'The sign-in link expired or could not be verified. Please try again.'}
          </p>
          <Link
            href="/signin"
            className="inline-block px-6 py-3 rounded-lg bg-white text-shield font-semibold hover:bg-white/90"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
