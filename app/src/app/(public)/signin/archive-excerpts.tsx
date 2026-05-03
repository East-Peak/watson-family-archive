import type { ReactNode } from 'react';

/**
 * Featured research excerpts for the sign-in page.
 *
 * Each excerpt is a real Q&A from the project's research history,
 * typeset for the ArchiveCard component. They appear in two places:
 * - GREENBERRY_EXCERPT in the hero (unlabeled, reads as a quoted artifact)
 * - WILLIAM_WATSON_EXCERPT in the tour grid (labeled "Research assistant",
 *   reads as the AI feature card)
 *
 * Two distinct ancestors so the page never repeats itself, and two
 * distinct kinds of research operation: Greenberry resolves a date
 * conflict by source tier; William Watson narrates a 70-year evidence
 * gap and names the next research thread.
 */

export interface ArchiveExcerpt {
  question: string;
  answer: ReactNode;
  sources: string;
}

/**
 * Col. Nicholas Greenberry (c.1627–1697), Stuart's 10th great-grandfather,
 * 4th (Acting) Royal Governor of Maryland. Born in England, immigrated 1674
 * aboard the Constant Friendship. The 13-year discrepancy between his
 * tombstone inscription and a candidate Lincolnshire baptism record showcases
 * the assistant weighing sources by tier and naming a verdict.
 */
export const GREENBERRY_EXCERPT: ArchiveExcerpt = {
  question: 'When was Col. Nicholas Greenberry born?',
  answer: (
    <>
      The tombstone at St. Anne&rsquo;s, Annapolis reads{' '}
      <em>&ldquo;Aetatis Suae 70&rdquo;</em> with a death date of Dec 17, 1697 &mdash;
      putting his birth around 1627. A 1640 baptism record at Irnham, Lincolnshire
      matches the name but conflicts by 13 years and is unverified. Going with
      the tombstone.
    </>
  ),
  sources:
    'Tombstone (Find A Grave #12216842) · Irnham parish records (disputed)',
};

/**
 * William Watson (1865–1951), great-uncle in the Cheshire Watson line.
 * Born in Northwich, Cheshire to Peter Watson and Charlotte Blundell.
 * Last UK trace is the 1881 census at age 16 in his father's household;
 * resurfaces 70 years later as a death record in Berkeley, California.
 * Showcases the assistant narrating an evidence gap and naming the
 * next research thread, rather than just answering what is known.
 */
export const WILLIAM_WATSON_EXCERPT: ArchiveExcerpt = {
  question: 'When did William Watson leave England for California?',
  answer: (
    <>
      Last UK trace: the 1881 England Census at age 16, in his father Peter
      Watson&rsquo;s household at Castle Northwich, Cheshire. No marriage,
      no later UK census, no ship manifest yet found. He next surfaces in a
      Berkeley, California death record dated October 28, 1951 &mdash; a
      70-year window for the crossing. Open thread.
    </>
  ),
  sources:
    '1881 England Census (RG11/3522/64/22) · Ancestry death records · FamilySearch LRQM-ZFT',
};
