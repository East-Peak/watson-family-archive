import Link from 'next/link';
import Image from 'next/image';
import { SigninHeraldicHeader } from '@/components/SigninHeraldicHeader';

const TOUR_ITEMS = [
  {
    src: '/images/landing/tree-screenshot.png',
    alt: 'Family tree visualization',
    caption: '2,000+ ancestors across 12 generations',
  },
  {
    src: '/images/landing/globe-screenshot.png',
    alt: 'Globe view with migration patterns',
    caption: 'Four centuries of migration arcs',
  },
  {
    src: '/images/landing/ai-sidebar-screenshot.png',
    alt: 'AI research assistant',
    caption: 'AI research grounded in family records',
  },
];

export default function RequestSentPage() {
  return (
    <main className="min-h-screen bg-shield">
      <SigninHeraldicHeader />
      <div className="max-w-4xl mx-auto px-6 pb-12">
        {/* Confirmation */}
        <div className="max-w-md mx-auto text-center mb-16">
          <div className="text-5xl mb-4">✓</div>
          <h2 className="text-2xl font-serif font-bold text-white mb-2">
            Thanks!
          </h2>
          <p className="text-white/70 mb-6">
            Stuart has been notified of your request and will be in touch.
            We&apos;ll email you when you&apos;re approved. Usually within a day or two.
          </p>
          <Link
            href="/signin"
            className="inline-block px-6 py-3 rounded-lg bg-white text-shield font-semibold hover:bg-white/90"
          >
            Back to sign in
          </Link>
        </div>

        {/* Tour content — same screenshots as /signin so portfolio visitors get value */}
        <section className="pt-8 border-t border-white/10">
          <h2 className="text-2xl font-serif font-bold text-white mb-2">
            While you wait
          </h2>
          <p className="text-white/60 mb-6">
            Here&apos;s a brief look at the project.
          </p>
          <div className="grid gap-6 md:grid-cols-3">
            {TOUR_ITEMS.map((item) => (
              <figure key={item.src} className="bg-white/5 border border-white/10 rounded-lg overflow-hidden">
                <div className="aspect-video relative bg-black/20">
                  <Image
                    src={item.src}
                    alt={item.alt}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, 33vw"
                  />
                </div>
                <figcaption className="p-3 text-sm text-white/70">
                  {item.caption}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
