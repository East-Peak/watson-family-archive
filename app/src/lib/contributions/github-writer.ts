import { Octokit } from '@octokit/rest';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export interface WriteTarget {
  owner: string;
  repo: string;
  branch: string;
}

export interface WriteContributionArgs {
  path: string;
  content: string;
  commitMessage: string;
  target?: WriteTarget;
}

export interface WriteContributionResult {
  commitSha?: string;
  localPath?: string;
}

export interface ReadTextFileArgs {
  path: string;
  target?: WriteTarget;
}

export interface FileChange {
  path: string;
  content: string;
  mode?: '100644' | '100755';
}

export interface AtomicCommitArgs {
  target?: WriteTarget;
  changes: FileChange[];
  deletions?: string[];
  commitMessage: string;
  maxRetries?: number;
}

export class GitHubWriterConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitHubWriterConfigurationError';
  }
}

export class ConcurrencyExhaustedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConcurrencyExhaustedError';
  }
}

const DEFAULT_OWNER = process.env.GITHUB_CONTRIBUTION_REPO_OWNER
  ?? process.env.GITHUB_REPO_OWNER
  ?? '';
const DEFAULT_REPO = process.env.GITHUB_CONTRIBUTION_REPO_NAME
  ?? process.env.GITHUB_REPO_NAME
  ?? '';
const DEFAULT_BRANCH = process.env.GITHUB_CONTRIBUTION_BRANCH ?? 'main';

export const CONTRIBUTIONS_TARGET: WriteTarget = Object.freeze({
  owner: DEFAULT_OWNER,
  repo: DEFAULT_REPO,
  branch: DEFAULT_BRANCH,
});

export const ACCESS_REQUESTS_PRIVATE_TARGET: WriteTarget = Object.freeze({
  owner: DEFAULT_OWNER,
  repo: DEFAULT_REPO,
  branch: DEFAULT_BRANCH,
});

function resolveTarget(target?: WriteTarget): WriteTarget {
  return target ?? CONTRIBUTIONS_TARGET;
}

function getToken(): string | undefined {
  return process.env.GITHUB_CONTRIBUTION_TOKEN;
}

function hasGitHubConfig(target: WriteTarget): boolean {
  return Boolean(getToken() && target.owner && target.repo);
}

function createOctokit(): Octokit {
  const token = getToken();
  if (!token) {
    throw new GitHubWriterConfigurationError(
      'github-writer: missing GITHUB_CONTRIBUTION_TOKEN'
    );
  }
  return new Octokit({ auth: token });
}

function isConflictStatus(error: unknown): boolean {
  const status = typeof error === 'object' && error !== null && 'status' in error
    ? (error as { status?: number }).status
    : undefined;
  return status === 409 || status === 422;
}

export async function writeContributionMarkdown(
  args: WriteContributionArgs
): Promise<WriteContributionResult> {
  const target = resolveTarget(args.target);

  if (hasGitHubConfig(target)) {
    return writeViaGitHub(args, target);
  }

  if (process.env.VERCEL === '1') {
    console.warn(
      'github-writer: GITHUB_CONTRIBUTION_TOKEN not set on Vercel — contribution writes will be lost to tmpfs. Set the env var in Vercel project settings.'
    );
  }

  return writeViaFilesystem(args);
}

export async function readTextFile(
  args: ReadTextFileArgs
): Promise<string | null> {
  const target = resolveTarget(args.target);

  if (hasGitHubConfig(target)) {
    return readViaGitHub(args.path, target);
  }

  return readViaFilesystem(args.path);
}

export async function writeAtomicCommit(args: AtomicCommitArgs): Promise<{ commitSha: string }> {
  const target = resolveTarget(args.target);
  const maxRetries = args.maxRetries ?? 3;

  if (!hasGitHubConfig(target)) {
    throw new GitHubWriterConfigurationError(
      'github-writer: atomic commits require GITHUB_CONTRIBUTION_TOKEN and a valid target'
    );
  }

  if (args.changes.length === 0 && (!args.deletions || args.deletions.length === 0)) {
    throw new Error('github-writer: writeAtomicCommit requires at least one change or deletion');
  }

  const octokit = createOctokit();

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const refResponse = await octokit.rest.git.getRef({
        owner: target.owner,
        repo: target.repo,
        ref: `heads/${target.branch}`,
      });
      const currentSha = refResponse.data.object.sha;

      const commitResponse = await octokit.rest.git.getCommit({
        owner: target.owner,
        repo: target.repo,
        commit_sha: currentSha,
      });
      const currentTreeSha = commitResponse.data.tree.sha;

      const blobEntries = await Promise.all(args.changes.map(async (change) => {
        const blob = await octokit.rest.git.createBlob({
          owner: target.owner,
          repo: target.repo,
          content: Buffer.from(change.content, 'utf-8').toString('base64'),
          encoding: 'base64',
        });

        return {
          path: change.path,
          mode: change.mode ?? '100644',
          type: 'blob' as const,
          sha: blob.data.sha,
        };
      }));

      const tree = await octokit.rest.git.createTree({
        owner: target.owner,
        repo: target.repo,
        base_tree: currentTreeSha,
        tree: [
          ...blobEntries,
          ...(args.deletions ?? []).map((path) => ({
            path,
            mode: '100644' as const,
            type: 'blob' as const,
            sha: null,
          })),
        ],
      });

      const commit = await octokit.rest.git.createCommit({
        owner: target.owner,
        repo: target.repo,
        message: args.commitMessage,
        tree: tree.data.sha,
        parents: [currentSha],
      });

      await octokit.rest.git.updateRef({
        owner: target.owner,
        repo: target.repo,
        ref: `heads/${target.branch}`,
        sha: commit.data.sha,
        force: false,
      });

      return { commitSha: commit.data.sha };
    } catch (error) {
      if (isConflictStatus(error) && attempt < maxRetries - 1) {
        continue;
      }

      if (isConflictStatus(error)) {
        throw new ConcurrencyExhaustedError(
          `github-writer: failed to update ${target.owner}/${target.repo}@${target.branch} after ${maxRetries} attempts`
        );
      }

      throw error;
    }
  }

  throw new ConcurrencyExhaustedError(
    `github-writer: failed to update ${target.owner}/${target.repo}@${target.branch} after ${maxRetries} attempts`
  );
}

async function writeViaGitHub(
  args: WriteContributionArgs,
  target: WriteTarget
): Promise<WriteContributionResult> {
  const octokit = createOctokit();
  const response = await octokit.rest.repos.createOrUpdateFileContents({
    owner: target.owner,
    repo: target.repo,
    path: args.path,
    message: args.commitMessage,
    content: Buffer.from(args.content).toString('base64'),
    branch: target.branch,
  });

  return { commitSha: response.data.commit?.sha };
}

async function writeViaFilesystem(
  args: WriteContributionArgs
): Promise<WriteContributionResult> {
  const fullPath = resolveLocalPath(args.path);

  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, args.content, 'utf-8');

  return { localPath: fullPath };
}

async function readViaGitHub(
  path: string,
  target: WriteTarget
): Promise<string | null> {
  const octokit = createOctokit();

  try {
    const response = await octokit.rest.repos.getContent({
      owner: target.owner,
      repo: target.repo,
      path,
      ref: target.branch,
    });

    if (Array.isArray(response.data) || response.data.type !== 'file') {
      throw new Error(`github-writer: expected file content at ${path}`);
    }

    if (!response.data.content) {
      return '';
    }

    if (response.data.encoding !== 'base64') {
      throw new Error(
        `github-writer: unsupported content encoding ${response.data.encoding ?? 'unknown'} for ${path}`
      );
    }

    return Buffer.from(response.data.content, 'base64').toString('utf-8');
  } catch (error) {
    const status = typeof error === 'object' && error !== null && 'status' in error
      ? (error as { status?: number }).status
      : undefined;

    if (status === 404) {
      return null;
    }

    throw error;
  }
}

async function readViaFilesystem(path: string): Promise<string | null> {
  try {
    return await readFile(resolveLocalPath(path), 'utf-8');
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error
      ? (error as { code?: string }).code
      : undefined;

    if (code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

function resolveLocalPath(path: string): string {
  const repoRoot = resolve(process.cwd(), '..');
  return resolve(repoRoot, path);
}
