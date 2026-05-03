import matter from 'gray-matter';
import {
  CONTRIBUTIONS_TARGET,
  ConcurrencyExhaustedError,
  readTextFile,
  writeAtomicCommit,
  type WriteTarget,
} from '@/lib/contributions/github-writer';
import type {
  ContributionFrontmatter,
  ContributionIndexEntry,
  ContributionRecord,
  ContributionsIndexFile,
} from '@/lib/contributions/types';

const CONTRIBUTIONS_INDEX_PATH = 'contributions-index.json';

function normalizeIsoString(value: unknown, fallback: string): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return fallback;
}

export function createEmptyContributionIndex(now = new Date().toISOString()): ContributionsIndexFile {
  return {
    schemaVersion: 1,
    rebuiltAt: now,
    items: [],
  };
}

export async function fetchIndexJson(
  target: WriteTarget = CONTRIBUTIONS_TARGET
): Promise<ContributionsIndexFile> {
  const raw = await readTextFile({ path: CONTRIBUTIONS_INDEX_PATH, target });
  if (!raw) {
    return createEmptyContributionIndex();
  }

  const parsed = JSON.parse(raw) as Partial<ContributionsIndexFile>;
  if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.items)) {
    throw new Error('contributions-store: invalid contributions-index.json');
  }

  return {
    schemaVersion: 1,
    rebuiltAt: typeof parsed.rebuiltAt === 'string' ? parsed.rebuiltAt : new Date().toISOString(),
    items: parsed.items as ContributionIndexEntry[],
  };
}

export async function fetchContributionMarkdown(
  path: string,
  target: WriteTarget = CONTRIBUTIONS_TARGET
): Promise<string | null> {
  return readTextFile({ path, target });
}

export async function appendToContributionIndex(args: {
  newEntry: ContributionIndexEntry;
  markdownPath: string;
  markdownContent: string;
  commitMessage: string;
  target?: WriteTarget;
  maxRetries?: number;
}): Promise<{ commitSha: string }> {
  const target = args.target ?? CONTRIBUTIONS_TARGET;
  const maxRetries = args.maxRetries ?? 3;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const currentIndex = await fetchIndexJson(target);
    const nextIndex: ContributionsIndexFile = {
      schemaVersion: 1,
      rebuiltAt: new Date().toISOString(),
      items: [
        ...currentIndex.items.filter((item) => item.id !== args.newEntry.id),
        args.newEntry,
      ],
    };

    try {
      return await writeAtomicCommit({
        target,
        changes: [
          { path: args.markdownPath, content: args.markdownContent },
          { path: CONTRIBUTIONS_INDEX_PATH, content: `${JSON.stringify(nextIndex, null, 2)}\n` },
        ],
        commitMessage: args.commitMessage,
        maxRetries: 1,
      });
    } catch (error) {
      if (error instanceof ConcurrencyExhaustedError && attempt < maxRetries - 1) {
        continue;
      }

      throw error;
    }
  }

  throw new ConcurrencyExhaustedError('contributions-store: failed to append after retries');
}

export async function listContributionsBySubmitterEmailHash(
  submitterEmailHash: string,
  target: WriteTarget = CONTRIBUTIONS_TARGET
): Promise<ContributionRecord[]> {
  const index = await fetchIndexJson(target);
  const matchingItems = index.items.filter((item) => item.submitterEmailHash === submitterEmailHash);

  const records = await Promise.all(matchingItems.map(async (item) => {
    const raw = await fetchContributionMarkdown(item.path, target);
    if (!raw) {
      return null;
    }

    const parsed = matter(raw);
    const frontmatter = parsed.data as ContributionFrontmatter;
    const submittedAt = normalizeIsoString(frontmatter.submittedAt, item.submittedAt);
    const statusUpdatedAt = normalizeIsoString(frontmatter.statusUpdatedAt, item.statusUpdatedAt);

    return {
      ...frontmatter,
      id: typeof frontmatter.id === 'string' ? frontmatter.id : item.id,
      kind: frontmatter.kind ?? item.kind,
      submittedAt,
      status: frontmatter.status ?? item.status,
      statusUpdatedAt,
      path: item.path,
      body: parsed.content.trim(),
    } satisfies ContributionRecord;
  }));

  return records
    .filter((record): record is ContributionRecord => record !== null)
    .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt));
}
