export type AllowlistRole = 'admin' | 'family';

export interface AllowlistEntry {
  email: string;
  role: AllowlistRole;
  addedAt: string; // ISO date
  note?: string;
}

const VALID_ROLES: readonly AllowlistRole[] = ['admin', 'family'];

export class AuthMisconfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthMisconfiguredError';
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateAllowlistEntry(value: unknown, index: number): AllowlistEntry {
  if (!isPlainObject(value)) {
    throw new AuthMisconfiguredError(`AUTH_ALLOWLIST_JSON entry ${index} is not an object`);
  }

  const email = typeof value.email === 'string' ? value.email.trim().toLowerCase() : '';
  const role = value.role;
  const addedAt = typeof value.addedAt === 'string' ? value.addedAt.trim() : '';
  const note = typeof value.note === 'string' ? value.note : undefined;

  if (!email) {
    throw new AuthMisconfiguredError(`AUTH_ALLOWLIST_JSON entry ${index} is missing email`);
  }
  if (!VALID_ROLES.includes(role as AllowlistRole)) {
    throw new AuthMisconfiguredError(`AUTH_ALLOWLIST_JSON entry ${index} has invalid role`);
  }
  if (!addedAt) {
    throw new AuthMisconfiguredError(`AUTH_ALLOWLIST_JSON entry ${index} is missing addedAt`);
  }

  return Object.freeze({
    email,
    role: role as AllowlistRole,
    addedAt,
    ...(note ? { note } : {}),
  });
}

export function parseAllowlistJson(raw: string): readonly AllowlistEntry[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AuthMisconfiguredError('AUTH_ALLOWLIST_JSON is not valid JSON');
  }

  if (!Array.isArray(parsed)) {
    throw new AuthMisconfiguredError('AUTH_ALLOWLIST_JSON must be a JSON array');
  }

  const entries = parsed.map((entry, index) => validateAllowlistEntry(entry, index));
  if (entries.length === 0) {
    throw new AuthMisconfiguredError('AUTH_ALLOWLIST_JSON must contain at least one entry');
  }

  return Object.freeze(entries);
}

export function loadAllowlistFromEnv(env: NodeJS.ProcessEnv = process.env): readonly AllowlistEntry[] {
  const raw = env.AUTH_ALLOWLIST_JSON;

  if (!raw?.trim()) {
    if (env.NODE_ENV === 'production') {
      throw new AuthMisconfiguredError('AUTH_ALLOWLIST_JSON is unset in production');
    }
    console.warn('AUTH_ALLOWLIST_JSON is unset; using an empty allowlist outside production.');
    return Object.freeze([]);
  }

  try {
    return parseAllowlistJson(raw);
  } catch (error) {
    if (env.NODE_ENV === 'production') {
      throw error;
    }
    const message = error instanceof Error ? error.message : 'unknown allowlist parse error';
    console.warn(`${message}; using an empty allowlist outside production.`);
    return Object.freeze([]);
  }
}

let cachedAllowlist: readonly AllowlistEntry[] | null = null;
let cachedAllowlistMap: ReadonlyMap<string, AllowlistEntry> | null = null;

export function getAllowlist(): readonly AllowlistEntry[] {
  if (cachedAllowlist === null) {
    cachedAllowlist = loadAllowlistFromEnv();
    cachedAllowlistMap = new Map(cachedAllowlist.map((entry) => [entry.email, entry] as const));
  }
  return cachedAllowlist;
}

export function findAllowlistEntry(email: string): AllowlistEntry | undefined {
  getAllowlist();
  return cachedAllowlistMap!.get(email.trim().toLowerCase());
}

export function isAllowed(email: string): boolean {
  return findAllowlistEntry(email) !== undefined;
}
