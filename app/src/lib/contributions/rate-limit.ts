import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

export interface RateLimitResult {
  success: boolean;
  limit?: number;
  remaining?: number;
  reset?: number;
}

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

type LimiterLike = Ratelimit | { limit: (id: string) => Promise<RateLimitResult> };

function buildLimiter(requests: number, window: `${number} ${'s' | 'm' | 'h' | 'd'}`, prefix: string): LimiterLike {
  const redis = getRedis();
  if (!redis) {
    // Local dev fallback: always allow.
    return { limit: async () => ({ success: true }) };
  }
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(requests, window),
    prefix,
  });
}

export const requestAccessLimiter = buildLimiter(3, '1 h', 'ratelimit:request-access');
export const magicLinkLimiter = buildLimiter(5, '1 h', 'ratelimit:magic-link');
export const contributionLimiter = buildLimiter(50, '1 d', 'ratelimit:contribution');
export const memoryLimiter = buildLimiter(10, '1 d', 'ratelimit:memory');
export const correctionLimiter = buildLimiter(50, '1 d', 'ratelimit:correction');
export const generalFeedbackLimiter = buildLimiter(20, '1 d', 'ratelimit:general');

export async function checkRateLimit(limiter: LimiterLike, identifier: string): Promise<RateLimitResult> {
  return limiter.limit(identifier);
}
