import { NextResponse } from 'next/server';
import { clearPrefilledEmailCookie } from '@/lib/auth/prefill-cookie';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' };

export async function POST() {
  const response = NextResponse.json(
    { cleared: true },
    { headers: NO_STORE_HEADERS },
  );
  clearPrefilledEmailCookie(response);
  return response;
}
