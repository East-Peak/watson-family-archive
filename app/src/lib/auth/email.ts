import { Resend } from 'resend';

export interface AdminNotificationArgs {
  subject: string;
  body: string;
}

export async function sendAdminNotification(args: AdminNotificationArgs): Promise<void> {
  const apiKey = process.env.AUTH_RESEND_KEY;
  const from = process.env.AUTH_EMAIL_FROM;
  const to = process.env.ADMIN_NOTIFY_EMAIL;

  if (!apiKey) throw new Error('sendAdminNotification: AUTH_RESEND_KEY is not set');
  if (!from) throw new Error('sendAdminNotification: AUTH_EMAIL_FROM is not set');
  if (!to) throw new Error('sendAdminNotification: ADMIN_NOTIFY_EMAIL is not set');

  const resend = new Resend(apiKey);
  await resend.emails.send({
    from,
    to,
    subject: args.subject,
    text: args.body,
  });
}
