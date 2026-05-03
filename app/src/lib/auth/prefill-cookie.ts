import type { NextResponse } from 'next/server';

export const AUTH_PREFILLED_EMAIL_COOKIE = 'auth-prefilled-email';

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/request-access',
    maxAge,
  };
}

export function setPrefilledEmailCookie(response: NextResponse, email: string) {
  response.cookies.set({
    name: AUTH_PREFILLED_EMAIL_COOKIE,
    value: email,
    ...cookieOptions(60 * 15),
  });
}

export function clearPrefilledEmailCookie(response: NextResponse) {
  response.cookies.set({
    name: AUTH_PREFILLED_EMAIL_COOKIE,
    value: '',
    ...cookieOptions(0),
  });
}
