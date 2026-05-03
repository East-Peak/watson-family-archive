import { MeProvider } from '@/components/MeProvider';
import AppShell from '@/components/AppShell';

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MeProvider authIdentity={null}>
      <AppShell>
        {children}
      </AppShell>
    </MeProvider>
  );
}
