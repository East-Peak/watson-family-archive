import { MeProvider } from '@/components/MeProvider';
import AppShell from '@/components/AppShell';

// Public read-only viewer: no auth gate. The original required an Auth.js
// session and turned anonymous visitors away; the public export renders every
// page for anonymous viewers, so there is no session and the viewer identity
// is always null.
export default function PublicViewerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MeProvider authIdentity={null}>
      <AppShell>{children}</AppShell>
    </MeProvider>
  );
}
