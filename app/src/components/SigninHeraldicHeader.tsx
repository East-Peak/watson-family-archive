import Image from 'next/image';

/**
 * Branded header used across the secondary public pages (check-email, error,
 * request-access/sent). Renders the family heraldic watermark behind a large
 * "Watson Family Tree" title in a hero-gradient section that matches the
 * authenticated home page's visual treatment.
 *
 * /signin itself does NOT use this component — it inlines its own hero so it
 * can carry the two-column layout (narrative copy left, sign-in form right).
 */
export function SigninHeraldicHeader() {
  return (
    <section className="relative bg-hero-gradient overflow-hidden border-b border-shield/40 shadow-2xl">
      <div className="absolute inset-x-0 top-0 pointer-events-none flex justify-center opacity-25 mix-blend-screen">
        <div
          className="relative w-[560px] h-[560px] max-w-[95vw]"
          style={{
            maskImage: 'linear-gradient(to bottom, black 0%, black 42%, transparent 62%)',
            WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 42%, transparent 62%)',
          }}
        >
          <Image
            src="/images/tree_heraldry_watermark.png"
            alt=""
            aria-hidden="true"
            fill
            className="object-contain"
            priority
          />
        </div>
      </div>
      <div className="relative z-10 max-w-4xl mx-auto px-6 pt-16 pb-12 text-center">
        <h1 className="text-4xl md:text-5xl font-serif font-bold text-white text-glow">
          Watson Family Tree
        </h1>
      </div>
    </section>
  );
}
