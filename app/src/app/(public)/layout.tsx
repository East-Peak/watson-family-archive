// Public-facing layout. Does NOT call auth() — keeps /signin and
// /request-access as static routes that can be prerendered.
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
