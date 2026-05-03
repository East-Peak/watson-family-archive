import { cookies } from 'next/headers';
import { AUTH_PREFILLED_EMAIL_COOKIE } from '@/lib/auth/prefill-cookie';
import { RequestAccessForm } from './RequestAccessForm';

export default async function RequestAccessPage() {
  const cookieStore = await cookies();
  const initialEmail = cookieStore.get(AUTH_PREFILLED_EMAIL_COOKIE)?.value ?? '';

  return <RequestAccessForm initialEmail={initialEmail} />;
}
