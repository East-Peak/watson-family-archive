import Image from 'next/image';
import { SigninForm } from './SigninForm';
import { ArchiveCard } from './ArchiveCard';
import { GlobeCard } from './GlobeCard';
import { GREENBERRY_EXCERPT, WILLIAM_WATSON_EXCERPT } from './archive-excerpts';
import { getTreeStats } from '@/lib/tree-stats';

// Revalidate the page at most once an hour so the BY THE NUMBERS panel
// stays fresh without rebuilds. If Stuart ships new research data, the
// counts refresh within 60 minutes.
export const revalidate = 3600;

// Tour assets — globe and tree are real screenshots; the AI feature
// is represented by an ArchiveCard (typeset Q&A) instead of a screenshot.
const GLOBE_SCREENSHOT = {
  src: '/images/landing/globe.png',
  alt: 'Globe view with migration arcs from Europe to North America',
};

const TREE_SCREENSHOT = {
  src: '/images/landing/tree.png',
  alt: 'Family tree visualization showing several generations of ancestors',
};

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

export default async function SigninPage() {
  const stats = getTreeStats();

  const statsPanel = [
    { value: formatNumber(stats.people), label: 'people' },
    { value: formatNumber(stats.records), label: 'primary-source records' },
    {
      value: stats.earliestVerifiedYear?.toString() ?? '—',
      label: 'earliest verified ancestor',
    },
  ];

  // earliestVerifiedYear only counts status: verified | deep_verified nodes
  // (see tree-stats.ts). There are earlier nodes in the tree with thinner
  // evidence, but we only flex on the rigorously-verified floor.
  const treeCaption = stats.earliestVerifiedYear
    ? `${formatNumber(stats.people)} ancestors, verified back to ${stats.earliestVerifiedYear}`
    : `${formatNumber(stats.people)} ancestors across the centuries`;

  return (
    <main className="min-h-screen bg-shield">
      {/* Hero — gradient background with dramatic heraldic watermark.
          The asset has "FORTITER ET FIDELITER" on the banner at the bottom;
          we apply a linear-gradient mask to the image wrapper so the banner
          region fades smoothly into the background. The mask is sized to the
          image wrapper (not the hero section) so the fade-percentages are in
          image coordinates and stay stable across viewport sizes. */}
      <section className="relative bg-hero-gradient overflow-hidden border-b border-shield/40 shadow-2xl">
        <div className="absolute inset-x-0 top-0 pointer-events-none flex justify-center opacity-25 mix-blend-screen">
          <div
            className="relative w-[720px] h-[720px] max-w-[95vw]"
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

        <div className="relative z-10 max-w-6xl mx-auto px-6 pt-16 pb-20">
          {/* Two-row grid: row 1 holds the narrative + sign-in form;
              row 2 holds the stats card + archive excerpt. Splitting
              into explicit rows guarantees the second-row cards start
              at the same vertical position regardless of differing
              heights in the first row. */}
          <div className="grid gap-x-12 gap-y-6 md:grid-cols-2 items-start">
            {/* Row 1, col 1 — narrative */}
            <div>
              <h1 className="text-4xl md:text-5xl font-serif font-bold text-white text-glow mb-6 leading-tight">
                Watson Family Tree
              </h1>
              <p className="text-white/85 text-lg md:text-xl leading-relaxed mb-4">
                Seven generations. Twelve countries. Four centuries of marriages
                and migrations across the Atlantic.
              </p>
              <p className="text-white/60">
                The Watson family, reconstructed from census returns, vital
                records, military service files, ship manifests, church
                registers, probate records, and newspaper archives.
              </p>
            </div>

            {/* Row 1, col 2 — sign-in form (client island) */}
            <SigninForm />

            {/* Row 2, col 1 — by-the-numbers stats */}
            <div className="bg-white/5 border border-white/10 rounded-lg p-4">
              <p className="text-xs uppercase tracking-wider text-white/50 mb-3">
                By the numbers
              </p>
              <dl className="space-y-1.5 text-sm">
                {statsPanel.map((stat) => (
                  <div key={stat.label} className="flex items-baseline gap-3">
                    <dt className="font-serif text-lg text-white tabular-nums">
                      {stat.value}
                    </dt>
                    <dd className="text-white/60 text-xs uppercase tracking-wide">
                      {stat.label}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 pt-3 border-t border-white/10 text-xs text-white/50 leading-relaxed">
                Stored as git-versioned markdown. Queried as a graph.
              </p>
            </div>

            {/* Row 2, col 2 — Greenberry research excerpt */}
            <ArchiveCard
              question={GREENBERRY_EXCERPT.question}
              answer={GREENBERRY_EXCERPT.answer}
              sources={GREENBERRY_EXCERPT.sources}
            />
          </div>
        </div>
      </section>

      {/* How it's built — four craft pillars on a deeper indigo background.
          Sits visually below the hero (darker shade, inset top shadow)
          to create real hierarchy without leaving the indigo brand. */}
      <section className="bg-shield-deep-section">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <h2 className="text-2xl font-serif font-bold text-white mb-2">
            How it&apos;s built
          </h2>
          <p className="text-white/50 text-sm mb-8">
            Four choices that make this different from the typical hobby tree.
          </p>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <div className="bg-white/[0.07] border border-white/10 rounded-lg p-6 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]">
              <p className="text-xs uppercase tracking-wider text-amber-200/70 mb-3">
                Tiered evidence
              </p>
              <p className="text-sm text-white/75 leading-relaxed">
                Sources graded A through E, from government vital records down
                to unsourced tree data. Parent promotion requires corroborating
                Tier A&ndash;C records &mdash; thin-evidence ancestors stay in
                the research queue, not the verified tree.
              </p>
            </div>

            <div className="bg-white/[0.07] border border-white/10 rounded-lg p-6 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]">
              <p className="text-xs uppercase tracking-wider text-amber-200/70 mb-3">
                Records as first-class nodes
              </p>
              <p className="text-sm text-white/75 leading-relaxed">
                Every census return, vital record, military file, and ship
                manifest is its own structured entity with key facts extracted
                per participant. Queryable by person, date, or place &mdash;
                not just a freetext footnote.
              </p>
            </div>

            <div className="bg-white/[0.07] border border-white/10 rounded-lg p-6 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]">
              <p className="text-xs uppercase tracking-wider text-amber-200/70 mb-3">
                Reproducible from markdown
              </p>
              <p className="text-sm text-white/75 leading-relaxed">
                The Neo4j graph is derived from git-versioned markdown files.
                Delete it, run one command, get the same tree back. Validation
                runs before every rebuild &mdash; no broken state shipped.
              </p>
            </div>

            <div className="bg-white/[0.07] border border-white/10 rounded-lg p-6 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]">
              <p className="text-xs uppercase tracking-wider text-amber-200/70 mb-3">
                Reasons over the data
              </p>
              <p className="text-sm text-white/75 leading-relaxed">
                A research assistant that reads the graph directly. Asks
                questions of real people, places, and records &mdash; not
                freetext bios. Cites sources by tier and flags conflicts when
                the evidence disagrees.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Tour section — returns to base hero indigo with a soft radial
          vignette so the cards feel held by the section. */}
      <div className="bg-tour-section">
        <div className="max-w-6xl mx-auto px-6 py-16">
        <section className="mb-16">
          <h2 className="text-2xl font-serif font-bold text-white mb-6">Tour</h2>

          {/* Asymmetric grid: globe spans 2 columns and 2 rows on the left;
              tree and AI archive card stack in the right column.
              On mobile, everything stacks single-column. */}
          <div className="grid gap-6 md:grid-cols-3 md:grid-rows-2 md:auto-rows-fr">
            <GlobeCard
              src={GLOBE_SCREENSHOT.src}
              alt={GLOBE_SCREENSHOT.alt}
              caption="Globe view with migration arcs across four centuries"
            />

            <figure className="bg-white/5 border border-white/10 rounded-lg overflow-hidden flex flex-col min-h-[200px]">
              <div className="relative flex-1 bg-black/20">
                <Image
                  src={TREE_SCREENSHOT.src}
                  alt={TREE_SCREENSHOT.alt}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 33vw"
                />
              </div>
              <figcaption className="p-3 text-sm text-white/70 shrink-0">
                {treeCaption}
              </figcaption>
            </figure>

            <ArchiveCard
              variant="tour"
              label="Research assistant"
              question={WILLIAM_WATSON_EXCERPT.question}
              answer={WILLIAM_WATSON_EXCERPT.answer}
              sources={WILLIAM_WATSON_EXCERPT.sources}
            />
          </div>
        </section>
        </div>
      </div>

      {/* Footer — darkest indigo, fades into near-black for a real ending. */}
      <div className="bg-footer-fade">
        <div className="max-w-6xl mx-auto px-6 py-10">
          <footer className="hairline-top pt-10 text-center">
            <p className="text-white/40 text-sm">
              Built by{' '}
              <a href="https://eastpeak.cc" className="text-white/70 underline">
                Stuart Watson
              </a>
            </p>
          </footer>
        </div>
      </div>
    </main>
  );
}
