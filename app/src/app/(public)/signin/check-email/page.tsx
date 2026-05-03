import Link from 'next/link';
import { SigninHeraldicHeader } from '@/components/SigninHeraldicHeader';

export default function CheckEmailPage() {
  return (
    <main className="min-h-screen bg-shield flex flex-col">
      <SigninHeraldicHeader />
      <div className="flex-1 flex items-center justify-center px-4 pb-12">
        <div className="max-w-md w-full mx-auto text-center">
          <div className="text-5xl mb-4">📬</div>
          <h2 className="text-2xl font-serif font-bold text-white mb-2">
            Check your email
          </h2>
          <p className="text-white/70 mb-6">
            We sent you a sign-in link. Click it to continue. The link expires in 15 minutes.
          </p>
          <Link href="/signin" className="text-amber-200/80 underline text-sm">
            ← Try a different email
          </Link>
        </div>
      </div>
    </main>
  );
}
