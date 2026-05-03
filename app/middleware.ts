import { NextResponse, type NextRequest } from 'next/server';

// Public archive: no auth gating. Anyone can view.
export default function middleware(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [],
};
