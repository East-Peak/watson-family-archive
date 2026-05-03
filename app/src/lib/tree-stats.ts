import fs from 'node:fs';
import path from 'node:path';

/**
 * Server-only helper that reads the source-of-truth markdown files and
 * returns live counts for the signin page's BY THE NUMBERS panel and the
 * tree tour caption. Computed at build time when the signin page is
 * pre-rendered — stats refresh when Stuart rebuilds the app.
 *
 * Never import this from a client component.
 */

export interface TreeStats {
  /** Total count of verified_nodes/*.md files. */
  people: number;
  /** Total count of records/*.md files. */
  records: number;
  /** Earliest birth year among verified/deep_verified ancestors. */
  earliestVerifiedYear: number | null;
}

// Next.js server components run with cwd = app/ in both dev and prod.
// data/ lives one level up at the repo root.
const DATA_DIR = path.resolve(process.cwd(), '..', 'data');

function countMarkdownFiles(subdir: string): number {
  const dir = path.join(DATA_DIR, subdir);
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter((f) => f.endsWith('.md')).length;
}

function findEarliestVerifiedYear(): number | null {
  const dir = path.join(DATA_DIR, 'verified_nodes');
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
  let earliest = Infinity;
  for (const file of files) {
    const content = fs.readFileSync(path.join(dir, file), 'utf-8');
    const fm = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fm) continue;
    const yaml = fm[1];
    // Only count rigorously-verified ancestors so we don't flex on thin evidence
    const status = yaml.match(/status:\s*(\w+)/);
    if (!status) continue;
    const s = status[1];
    if (s !== 'verified' && s !== 'deep_verified') continue;
    const birthYear = yaml.match(/birth:\s*\n\s+date:\s*['"]*(\d{4})/);
    if (!birthYear) continue;
    const y = parseInt(birthYear[1], 10);
    if (y > 1000 && y < earliest) earliest = y;
  }
  return earliest === Infinity ? null : earliest;
}

export function getTreeStats(): TreeStats {
  return {
    people: countMarkdownFiles('verified_nodes'),
    records: countMarkdownFiles('records'),
    earliestVerifiedYear: findEarliestVerifiedYear(),
  };
}
