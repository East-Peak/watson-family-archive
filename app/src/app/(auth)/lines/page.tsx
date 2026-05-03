'use client';

import Link from 'next/link';
import MotionWrapper from '@/components/ui/MotionWrapper';
import { useViewerLines } from '@/hooks/useViewerLines';
import { useMe, hasViewerPerson } from '@/components/MeProvider';

export default function LinesPage() {
  const { me } = useMe();
  const { lines, loading } = useViewerLines({ limit: 0, minCount: 1 });
  const isViewerSet = hasViewerPerson(me);

  if (loading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream">
      <MotionWrapper className="max-w-6xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="font-serif text-3xl text-shield">
            {isViewerSet ? 'Your Family Lines' : 'Family Lines'}
          </h1>
          <p className="text-gray-500 mt-1">Branches of your ancestry</p>
        </div>

        {!isViewerSet && lines.length > 0 && (
          <div className="mb-6 bg-amber-50/50 border border-amber-200/50 rounded-lg p-4 text-sm text-gray-600">
            Showing all family surnames. Set your identity in the viewer picker to see your direct lines.
          </div>
        )}

        {lines.length === 0 ? (
          <p className="text-gray-400 text-center py-12">
            No family lines found yet.{' '}
            <Link href="/" className="text-shield hover:underline">Back to home</Link>
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {lines.map((line) => (
              <Link
                key={line.surname}
                href={`/collection/surname-${line.surname.toLowerCase()}`}
                className="bg-white rounded-lg p-4 border border-gray-200 hover:shadow-sm hover:border-shield/30 transition-all text-center"
              >
                <h3 className="font-serif text-lg text-shield">{line.surname}</h3>
                <p className="text-sm text-gray-500 mt-1">
                  {line.count} {line.count === 1 ? 'ancestor' : 'ancestors'}
                </p>
                {(line.earliest || line.latest) && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {line.earliest && line.latest
                      ? `${line.earliest}\u2013${line.latest}`
                      : line.earliest || line.latest}
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}
      </MotionWrapper>
    </div>
  );
}
