import { Redis } from '@upstash/redis';

/**
 * Shared read-through cache for whole-graph Neo4j reads, backed by Upstash
 * Redis (the same store the rebuild lock uses).
 *
 * Why Redis and not Next's Data Cache: the heaviest reads (explorer ~3.2 MB,
 * records ~3.8 MB, globe ~3 MB) exceed Vercel's 2 MB per-item Data Cache limit,
 * which silently caches nothing. Upstash allows 10 MB/request, 100 MB/record.
 * A shared store also survives the frequent cold starts of a low-traffic app
 * and keeps serving cached reads while the free-tier AuraDB is paused/cold.
 *
 * Invalidation: every key is namespaced by a version counter. `revalidateGraph
 * Cache()` does a single INCR, so the next read on every instance computes a new
 * key prefix and misses → re-reads fresh data. Immediate and global. A per-key
 * TTL is the backstop if a flush is ever missed. (Redis persists across Vercel
 * deploys; that's fine — deploying doesn't change the data, only a rebuild does,
 * and the rebuild path flushes.)
 *
 * Safety: this is a data-layer cache. Route handlers and their auth middleware
 * still run per request; only the AuraDB round-trip is memoized. Only wrap
 * whole-tree reads that are identical for every user and rebuildable — never
 * anything per-user or per-request. On any Redis error or missing config the
 * wrapper falls back to a direct read, so caching can never break a route.
 */

/** Per-key TTL backstop (seconds). */
export const GRAPH_CACHE_TTL_SECONDS = 3600;

/** Redis key holding the cache version counter; bumped on every flush. */
const VERSION_KEY = 'graph:cache:version';

let redisSingleton: Redis | null | undefined;

function getRedis(): Redis | null {
  if (redisSingleton === undefined) {
    // Vercel's Upstash/KV marketplace integration injects KV_REST_API_* names;
    // fall back to those so a stock integration works without manual aliasing.
    const url =
      process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
    const token =
      process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
    redisSingleton = url && token ? new Redis({ url, token }) : null;
  }
  return redisSingleton;
}

async function currentVersion(redis: Redis): Promise<string> {
  const v = await redis.get<string | number>(VERSION_KEY);
  return v == null ? '0' : String(v);
}

function devWarn(message: string, error: unknown): void {
  if (process.env.NODE_ENV !== 'production') {
    console.warn(`[graphCache] ${message}`, error);
  }
}

/**
 * Wrap a Neo4j read so its result is cached in Redis, keyed by `keyParts` plus
 * the serialized call args (so one module-level wrapper safely serves every
 * parameter combination). Falls back to a direct read when Redis is unconfigured
 * or unavailable.
 */
export function cacheGraphRead<A extends unknown[], T>(
  fn: (...args: A) => Promise<T>,
  keyParts: string[],
  options?: { ttlSeconds?: number },
): (...args: A) => Promise<T> {
  const ttl = options?.ttlSeconds ?? GRAPH_CACHE_TTL_SECONDS;
  const prefix = keyParts.join(':');

  return async (...args: A): Promise<T> => {
    const redis = getRedis();
    if (!redis) return fn(...args);

    let key: string | null = null;
    try {
      const version = await currentVersion(redis);
      key = `graph:v${version}:${prefix}:${JSON.stringify(args)}`;
      // Values are wrapped so a present-but-empty result (e.g. []) is still a
      // hit, distinct from a missing key (null).
      const wrapped = await redis.get<{ v: T }>(key);
      if (wrapped != null) return wrapped.v;
    } catch (error) {
      devWarn('read failed; falling back to direct query', error);
      return fn(...args);
    }

    const value = await fn(...args);
    try {
      await redis.set(key, { v: value }, { ex: ttl });
    } catch (error) {
      devWarn('write failed; returning uncached value', error);
    }
    return value;
  };
}

/**
 * Flush every cached graph read at once by bumping the version counter. Call
 * after the graph is rebuilt. Immediate and global across instances. Exposed via
 * POST /api/admin/revalidate and called from the rebuild route's completion.
 */
export async function revalidateGraphCache(): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.incr(VERSION_KEY);
}
