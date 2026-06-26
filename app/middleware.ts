import { NextResponse } from 'next/server';

// Public read-only viewer: every page and API route is public, so the edge
// middleware is a no-op. The original enforced Auth.js sessions on API routes;
// that whole auth subsystem is pruned from the public export, so there is
// nothing to gate here.
export default function middleware() {
  return NextResponse.next();
}

export const config = {
  matcher: [],
};
