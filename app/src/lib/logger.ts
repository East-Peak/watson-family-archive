import { createHash } from 'node:crypto';

// Lowercased so matching is case-insensitive. Add freely — better to over-redact
// than to leak. The Codex round 1 review specifically called out the gaps in
// the original short list (only password/apiKey/token/magicLinkUrl/secret/sessionToken).
const SECRET_FIELDS = new Set([
  'password',
  'apikey',
  'api_key',
  'token',
  'magiclinkurl',
  'magic_link_url',
  'secret',
  'sessiontoken',
  'session_token',
  'authorization',
  'cookie',
  'set-cookie',
  'setcookie',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'idtoken',
  'id_token',
  'verificationtoken',
  'verification_token',
  'csrftoken',
  'csrf_token',
  'clientsecret',
  'client_secret',
  'privatekey',
  'private_key',
  // Email is also PII — never log raw email addresses; use hashEmail() instead.
  'email',
]);

export function hashEmail(email: string): string {
  const salt = process.env.AUTH_SECRET || 'dev';
  const normalized = email.trim().toLowerCase();
  return createHash('sha256').update(`${salt}:${normalized}`).digest('hex').slice(0, 16);
}

function isSecretKey(key: string): boolean {
  return SECRET_FIELDS.has(key.toLowerCase().replace(/[-_]/g, ''));
}

function sanitize(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (seen.has(value as object)) return '[Circular]';
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item, seen));
  }

  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (isSecretKey(key)) continue;
    out[key] = sanitize(v, seen);
  }
  return out;
}

// Top-level wrapper that drops secret KEYS entirely (matches the test contract
// for top-level keys) and recursively drops them inside nested objects/arrays.
function sanitizeTop(data: Record<string, unknown>): Record<string, unknown> {
  const seen = new WeakSet<object>();
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (isSecretKey(key)) continue;
    out[key] = sanitize(value, seen);
  }
  return out;
}

function write(level: 'info' | 'warn' | 'error', event: string, data: Record<string, unknown>) {
  let payload: string;
  try {
    payload = JSON.stringify({
      level,
      event,
      ts: new Date().toISOString(),
      ...sanitizeTop(data),
    });
  } catch (err) {
    // Last-resort guard so a logging bug never crashes a request handler.
    payload = JSON.stringify({
      level: 'error',
      event: 'logger.serialize_failed',
      ts: new Date().toISOString(),
      originalEvent: event,
      reason: err instanceof Error ? err.message : String(err),
    });
  }
  if (level === 'error') console.error(payload);
  else if (level === 'warn') console.warn(payload);
  else console.log(payload);
}

export const log = {
  info: (event: string, data: Record<string, unknown> = {}) => write('info', event, data),
  warn: (event: string, data: Record<string, unknown> = {}) => write('warn', event, data),
  error: (event: string, data: Record<string, unknown> = {}) => write('error', event, data),
};
