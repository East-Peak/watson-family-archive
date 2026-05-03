import { randomBytes } from 'node:crypto';
import matter from 'gray-matter';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { sendAdminNotification } from '@/lib/auth/email';
import {
  ContributionPhotoUploadError,
  uploadContributionPhoto,
} from '@/lib/contributions/blob-uploader';
import { ConcurrencyExhaustedError, CONTRIBUTIONS_TARGET } from '@/lib/contributions/github-writer';
import { appendToContributionIndex } from '@/lib/contributions/store';
import {
  CONTRIBUTION_KINDS,
  type ContributionPhoto,
  type ContributionFrontmatter,
  type ContributionIndexEntry,
  type CreateContributionInput,
} from '@/lib/contributions/types';
import { checkRateLimit, contributionLimiter } from '@/lib/contributions/rate-limit';
import { hashEmail, log } from '@/lib/logger';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' };
const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';
const CONTRIBUTION_KIND_SET = new Set<string>(CONTRIBUTION_KINDS);

function privateJson(body: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...NO_STORE_HEADERS,
      ...(init?.headers ?? {}),
    },
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isFileLike(value: FormDataEntryValue | null): value is File {
  return typeof value === 'object'
    && value !== null
    && 'name' in value
    && 'size' in value
    && 'type' in value;
}

function generateContributionId(): string {
  const bytes = randomBytes(5);
  let bits = 0;
  let value = 0;
  let out = '';

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  return out;
}

function parseContributionBody(value: unknown): CreateContributionInput | null {
  if (!isPlainObject(value)) {
    return null;
  }

  const body = typeof value.body === 'string' ? value.body.trim() : '';
  const url = typeof value.url === 'string' ? value.url.trim() : '';
  const kind = typeof value.kind === 'string' ? value.kind : '';

  if (!body || !url || !CONTRIBUTION_KIND_SET.has(kind)) {
    return null;
  }

  if (
    !isOptionalString(value.selector)
    || !isOptionalString(value.quotedText)
    || !isOptionalString(value.viewport)
    || !isOptionalString(value.title)
    || !isOptionalString(value.when)
    || !isOptionalString(value.where)
  ) {
    return null;
  }

  if (value.entity !== undefined) {
    if (!isPlainObject(value.entity)) {
      return null;
    }
    if (typeof value.entity.type !== 'string' || typeof value.entity.id !== 'string') {
      return null;
    }
  }

  if (value.routeContext !== undefined && !isPlainObject(value.routeContext)) {
    return null;
  }

  return {
    kind: kind as CreateContributionInput['kind'],
    body,
    url,
    selector: value.selector?.trim() || undefined,
    entity: value.entity
      ? {
          type: (value.entity.type as string).trim(),
          id: (value.entity.id as string).trim(),
        }
      : undefined,
    routeContext: value.routeContext,
    quotedText: value.quotedText?.trim() || undefined,
    viewport: value.viewport?.trim() || undefined,
    title: value.title?.trim() || undefined,
    when: value.when?.trim() || undefined,
    where: value.where?.trim() || undefined,
  };
}

function parseJsonStringField(value: FormDataEntryValue | null): Record<string, unknown> | undefined | null {
  if (value === null) return undefined;
  if (typeof value !== 'string') return null;

  try {
    const parsed = JSON.parse(value) as unknown;
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function parseContributionRequest(request: NextRequest): Promise<{
  input: CreateContributionInput | null;
  photo?: File;
  parseError?: 'invalid_json' | 'invalid_payload';
}> {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    const entity = parseJsonStringField(formData.get('entity'));
    const routeContext = parseJsonStringField(formData.get('routeContext'));
    if (entity === null || routeContext === null) {
      return { input: null, parseError: 'invalid_payload' };
    }

    const payload: Record<string, unknown> = {
      kind: formData.get('kind'),
      body: formData.get('body'),
      url: formData.get('url'),
      selector: formData.get('selector') ?? undefined,
      quotedText: formData.get('quotedText') ?? undefined,
      viewport: formData.get('viewport') ?? undefined,
      title: formData.get('title') ?? undefined,
      when: formData.get('when') ?? undefined,
      where: formData.get('where') ?? undefined,
      ...(entity ? { entity } : {}),
      ...(routeContext ? { routeContext } : {}),
    };

    const photoField = formData.get('photo');
    return {
      input: parseContributionBody(payload),
      photo: isFileLike(photoField) && photoField.size > 0 ? photoField : undefined,
    };
  }

  try {
    const payload = await request.json();
    return { input: parseContributionBody(payload) };
  } catch {
    return { input: null, parseError: 'invalid_json' };
  }
}

function buildContributionMarkdown(args: {
  id: string;
  input: CreateContributionInput;
  email: string;
  displayName?: string;
  submittedAt: string;
  photo?: ContributionPhoto;
}): string {
  const frontmatter: ContributionFrontmatter = {
    id: args.id,
    kind: args.input.kind,
    submittedBy: {
      email: args.email,
      ...(args.displayName ? { displayName: args.displayName } : {}),
    },
    submittedAt: args.submittedAt,
    url: args.input.url,
    ...(args.input.entity ? { entity: args.input.entity } : {}),
    ...(args.input.selector ? { selector: args.input.selector } : {}),
    ...(args.input.entity?.id ? { anchorAttribute: args.input.entity.id } : {}),
    ...(args.input.routeContext ? { routeContext: args.input.routeContext } : {}),
    ...(args.input.quotedText ? { quotedText: args.input.quotedText } : {}),
    ...(args.input.viewport ? { viewport: args.input.viewport } : {}),
    ...(args.input.title ? { title: args.input.title } : {}),
    ...(args.input.when ? { when: args.input.when } : {}),
    ...(args.input.where ? { where: args.input.where } : {}),
    ...(args.photo ? { photo: args.photo } : {}),
    status: 'open',
    statusUpdatedAt: args.submittedAt,
    resolution: {
      note: '',
      incorporatedInCommit: '',
      editorNote: '',
      rejectedReason: '',
    },
  };

  return matter.stringify(args.input.body, frontmatter);
}

function buildIndexEntry(args: {
  id: string;
  path: string;
  input: CreateContributionInput;
  emailHash: string;
  submittedAt: string;
}): ContributionIndexEntry {
  return {
    id: args.id,
    path: args.path,
    kind: args.input.kind,
    submitterEmailHash: args.emailHash,
    submittedAt: args.submittedAt,
    status: 'open',
    statusUpdatedAt: args.submittedAt,
    ...(args.input.entity?.type ? { entityType: args.input.entity.type } : {}),
    ...(args.input.entity?.id ? { entityId: args.input.entity.id } : {}),
  };
}

function buildRepoLink(path: string): string {
  return `https://github.com/${CONTRIBUTIONS_TARGET.owner}/${CONTRIBUTIONS_TARGET.repo}/blob/${CONTRIBUTIONS_TARGET.branch}/${path}`;
}

export async function POST(request: NextRequest) {
  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) {
    return privateJson({ error: 'Authentication required' }, { status: 401 });
  }

  const emailHash = hashEmail(email);
  let contributionId: string | undefined;
  let parsedBody: CreateContributionInput | null = null;

  try {
    const parsedRequest = await parseContributionRequest(request);
    if (parsedRequest.parseError === 'invalid_json') {
      log.warn('contribution.validation_failed', { emailHash, reason: 'invalid_json' });
      return privateJson({ error: 'Invalid JSON body' }, { status: 400 });
    }
    parsedBody = parsedRequest.input;
    if (!parsedBody) {
      log.warn('contribution.validation_failed', { emailHash, reason: 'invalid_payload' });
      return privateJson({ error: 'Invalid contribution payload' }, { status: 400 });
    }

    if (parsedBody.kind === 'memory' && (!parsedBody.entity || parsedBody.entity.type !== 'person')) {
      log.warn('contribution.validation_failed', { emailHash, reason: 'memory_missing_person_entity' });
      return privateJson({ error: 'Memory submissions must target a person.' }, { status: 400 });
    }

    if (parsedRequest.photo && parsedBody.kind !== 'memory') {
      log.warn('contribution.validation_failed', { emailHash, reason: 'photo_requires_memory_kind' });
      return privateJson({ error: 'Photos are only supported for memory submissions.' }, { status: 400 });
    }

    const rate = await checkRateLimit(contributionLimiter, emailHash);
    if (!rate.success) {
      log.warn('contribution.rate_limit_hit', { emailHash, endpoint: 'contributions' });
      return privateJson(
        { error: 'Too many contributions. Please try again later.' },
        { status: 429 }
      );
    }

    contributionId = generateContributionId();
    const submittedAt = new Date().toISOString();
    const path = `contributions/${submittedAt.slice(0, 10)}_${contributionId}.md`;
    const photo = parsedRequest.photo
      ? await uploadContributionPhoto({
          contributionId,
          entityId: parsedBody.entity?.id || 'person',
          file: parsedRequest.photo,
        })
      : undefined;
    const markdownContent = buildContributionMarkdown({
      id: contributionId,
      input: parsedBody,
      email,
      displayName: typeof session?.user?.name === 'string' ? session.user.name : undefined,
      submittedAt,
      photo,
    });

    await appendToContributionIndex({
      newEntry: buildIndexEntry({
        id: contributionId,
        path,
        input: parsedBody,
        emailHash,
        submittedAt,
      }),
      markdownPath: path,
      markdownContent,
      commitMessage: `contribution: ${contributionId}`,
    });

    try {
      await sendAdminNotification({
        subject: `[contribution] ${contributionId}`,
        body: [
          `Contribution ID: ${contributionId}`,
          `Kind: ${parsedBody.kind}`,
          `File: ${buildRepoLink(path)}`,
          `Page: ${parsedBody.url}`,
          ...(photo ? [`Photo: ${photo.blobUrl}`] : []),
        ].join('\n'),
      });
    } catch (error) {
      log.warn('contribution.notification_failed', {
        emailHash,
        id: contributionId,
        kind: parsedBody.kind,
        reason: error instanceof Error ? error.message : 'unknown',
      });
    }

    log.info('contribution.submitted', {
      emailHash,
      id: contributionId,
      kind: parsedBody.kind,
    });

    return privateJson({ ok: true, id: contributionId });
  } catch (error) {
    if (error instanceof ContributionPhotoUploadError) {
      log.warn('contribution.photo_upload_failed', {
        emailHash,
        ...(contributionId ? { id: contributionId } : {}),
        ...(parsedBody ? { kind: parsedBody.kind } : {}),
        reason: error.message,
        status: error.status,
      });
      return privateJson({ error: error.message }, { status: error.status });
    }

    if (error instanceof ConcurrencyExhaustedError) {
      log.warn('contribution.write_conflict', {
        emailHash,
        ...(contributionId ? { id: contributionId } : {}),
        ...(parsedBody ? { kind: parsedBody.kind } : {}),
      });
      return privateJson(
        { error: 'Could not save your contribution right now. Please retry.' },
        { status: 503 }
      );
    }

    log.error('contribution.submit_failed', {
      emailHash,
      ...(contributionId ? { id: contributionId } : {}),
      ...(parsedBody ? { kind: parsedBody.kind } : {}),
      reason: error instanceof Error ? error.message : 'unknown',
    });
    return privateJson({ error: 'Failed to save contribution' }, { status: 500 });
  }
}
