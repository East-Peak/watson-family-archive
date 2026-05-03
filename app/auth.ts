import NextAuth, { type NextAuthConfig } from 'next-auth';
import Resend from 'next-auth/providers/resend';
import { Resend as ResendClient } from 'resend';
import { UnstorageAdapter } from '@auth/unstorage-adapter';
import { createStorage } from 'unstorage';
import memoryDriver from 'unstorage/drivers/memory';
import upstashDriver from 'unstorage/drivers/upstash';
import { AuthMisconfiguredError, findAllowlistEntry } from '@/lib/auth/allowlist';
import { magicLinkLimiter, checkRateLimit } from '@/lib/contributions/rate-limit';
import { log, hashEmail } from '@/lib/logger';

// Auth.js v5 email providers require an adapter to store verification
// tokens (one-time magic link tokens, time-limited). JWT session strategy
// avoids an adapter for SESSIONS but not for verification tokens.
//
// Production: Upstash Redis (shared, survives cold starts).
// Local dev fallback: in-memory (fine for single-process).
const hasUpstash = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN;
const storage = createStorage({
  driver: hasUpstash
    ? upstashDriver({
        url: process.env.UPSTASH_REDIS_REST_URL!,
        token: process.env.UPSTASH_REDIS_REST_TOKEN!,
      })
    : memoryDriver(),
});

export const authConfig: NextAuthConfig = {
  adapter: UnstorageAdapter(storage),
  providers: [
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY,
      from: process.env.AUTH_EMAIL_FROM,
      async sendVerificationRequest({ identifier, url }) {
        const emailHash = hashEmail(identifier);
        log.info('auth.signin_attempt', { emailHash, provider: 'resend' });

        const rate = await checkRateLimit(magicLinkLimiter, identifier);
        if (!rate.success) {
          log.warn('auth.rate_limit_hit', { emailHash });
          throw new Error('Too many sign-in attempts. Please try again later.');
        }

        const apiKey = process.env.AUTH_RESEND_KEY;
        const from = process.env.AUTH_EMAIL_FROM;
        if (!apiKey) {
          log.error('auth.email_failed', { emailHash, reason: 'AUTH_RESEND_KEY not set' });
          throw new Error('Email provider misconfigured.');
        }
        if (!from) {
          log.error('auth.email_failed', { emailHash, reason: 'AUTH_EMAIL_FROM not set' });
          throw new Error('Email provider misconfigured.');
        }

        const client = new ResendClient(apiKey);
        const response = await client.emails.send({
          from,
          to: identifier,
          subject: 'Sign in to Watson Family Tree',
          text: `Sign in to Watson Family Tree\n\nClick this link to sign in:\n${url}\n\nThis link expires in 15 minutes.`,
          html: `<p>Sign in to Watson Family Tree</p><p><a href="${url}">Click here to sign in</a></p><p>This link expires in 15 minutes.</p>`,
        });

        if (response.error) {
          log.error('auth.email_failed', { emailHash, reason: response.error.message });
          throw new Error('Failed to send sign-in email.');
        }

        log.info('auth.email_sent', { emailHash, messageId: response.data?.id });
      },
    }),
  ],
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/signin',
    verifyRequest: '/signin/check-email',
    error: '/signin/error',
  },
  callbacks: {
    async signIn({ user }) {
      const email = user?.email;
      if (!email) {
        log.warn('auth.signin_missing_email', { provider: 'resend' });
        return false;
      }
      const normalizedEmail = email.trim().toLowerCase();
      const emailHash = hashEmail(normalizedEmail);
      try {
        const entry = findAllowlistEntry(normalizedEmail);
        if (entry) {
          log.info('auth.allowlist_hit', { emailHash, role: entry.role });
          return true;
        }
        log.warn('auth.allowlist_miss', { emailHash });
        return false;
      } catch (error) {
        if (error instanceof AuthMisconfiguredError) {
          log.error('auth.allowlist_misconfigured', { emailHash, reason: error.message });
          return '/signin/error?reason=auth-misconfigured';
        }
        throw error;
      }
    },
    async jwt({ token, user, trigger }) {
      try {
        // On sign-in, seed the token from the allowlist
        if (trigger === 'signIn' && user?.email) {
          const entry = findAllowlistEntry(user.email);
          if (entry) {
            token.email = entry.email;
            token.role = entry.role;
            log.info('auth.session_created', { emailHash: hashEmail(entry.email), role: entry.role });
          }
          return token;
        }
        // On subsequent requests, re-read from allowlist so role changes propagate
        if (token.email) {
          const entry = findAllowlistEntry(token.email as string);
          if (entry) {
            token.role = entry.role;
          }
        }
        return token;
      } catch (error) {
        if (error instanceof AuthMisconfiguredError) {
          // Swallow: Auth.js treats thrown jwt as "clear session" → silent 401.
          // Keep existing tokens intact so valid sessions survive the misconfig window
          // while signIn / prepare-signin surface the explicit error page.
          const emailHash = token.email ? hashEmail(token.email as string) : undefined;
          log.error('auth.jwt_misconfigured', {
            ...(emailHash ? { emailHash } : {}),
            reason: error.message,
          });
          return token;
        }
        throw error;
      }
    },
    async session({ session, token }) {
      if (session.user && token.email) {
        session.user.email = token.email as string;
        session.user.role = (token.role as 'admin' | 'family') || 'family';
      }
      return session;
    },
  },
};

export const { handlers, signIn, signOut, auth } = NextAuth(authConfig);
