import { put } from '@vercel/blob';
import type { ContributionPhoto } from '@/lib/contributions/types';

const MAX_PHOTO_SIZE_BYTES = 4 * 1024 * 1024;

const EXTENSION_TO_MIME = new Map<string, string>([
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['png', 'image/png'],
  ['heic', 'image/heic'],
  ['heif', 'image/heif'],
]);

export class ContributionPhotoUploadError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ContributionPhotoUploadError';
    this.status = status;
  }
}

function getExtension(filename: string): string | null {
  const match = /\.([a-z0-9]+)$/i.exec(filename);
  return match ? match[1].toLowerCase() : null;
}

function sanitizePathSegment(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
}

export async function uploadContributionPhoto(args: {
  contributionId: string;
  entityId: string;
  file: File;
}): Promise<ContributionPhoto> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    throw new Error('uploadContributionPhoto: BLOB_READ_WRITE_TOKEN is not set');
  }

  if (args.file.size > MAX_PHOTO_SIZE_BYTES) {
    throw new ContributionPhotoUploadError('Photo must be 4 MB or smaller.', 413);
  }

  const extension = getExtension(args.file.name);
  if (!extension || !EXTENSION_TO_MIME.has(extension)) {
    throw new ContributionPhotoUploadError('Photo must be a JPG, PNG, or HEIC image.', 415);
  }

  const expectedMimeType = EXTENSION_TO_MIME.get(extension)!;
  const actualMimeType = args.file.type?.toLowerCase() || expectedMimeType;
  if (actualMimeType !== expectedMimeType) {
    throw new ContributionPhotoUploadError('Photo file type does not match its extension.', 415);
  }

  const pathname = `memories/${sanitizePathSegment(args.entityId) || 'person'}/${args.contributionId}.${extension}`;
  const blob = await put(pathname, args.file, {
    access: 'public',
    addRandomSuffix: false,
    contentType: expectedMimeType,
    token,
  });

  return {
    blobUrl: blob.url,
    pathname: blob.pathname,
    mimeType: blob.contentType || expectedMimeType,
    sizeBytes: args.file.size,
  };
}
