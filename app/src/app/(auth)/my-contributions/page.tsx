'use client';

import MyContributionsList from '@/components/contributions/MyContributionsList';
import { useMyContributions } from '@/hooks/useMyContributions';
import { useMe } from '@/components/MeProvider';

export default function MyContributionsPage() {
  const { items, loading, error, refetch } = useMyContributions();
  const { authIdentity } = useMe();

  return (
    <main className="min-h-full bg-parchment px-6 py-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-shield">
            Contribution Inbox
          </p>
          <h1 className="mt-3 font-serif text-4xl text-gray-900">My Contributions</h1>
          {authIdentity?.email && (
            <p className="text-sm text-gray-500 mt-1">Signed in as {authIdentity.email}</p>
          )}
          <p className="mt-3 max-w-2xl text-base leading-7 text-gray-600">
            Track every correction, note, memory, and bug report you&apos;ve sent to Stuart.
            Status updates here are live from the private contributions repo.
          </p>
        </div>

        <MyContributionsList
          items={items}
          loading={loading}
          error={error}
          onRetry={() => {
            void refetch();
          }}
        />
      </div>
    </main>
  );
}
