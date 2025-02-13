import { Resend } from 'resend';

let resend: Resend | null = null;

if (process.env.RESEND_API_KEY) {
  resend = new Resend(process.env.RESEND_API_KEY);
}

interface SendEmailParams {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendEmail({ to, subject, text, html }: SendEmailParams) {
  if (!resend) {
    console.warn('Resend API key not configured, skipping email send');
    return;
  }

  try {
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
      to,
      subject,
      text,
      html: html || text,
    });
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
}

export async function sendUnreadMessagesNotification({
  userEmail,
  userName,
  groupName,
  videoTitle,
  unreadCount,
  groupUrl
}: {
  userEmail: string;
  userName: string;
  groupName: string;
  videoTitle: string;
  unreadCount: number;
  groupUrl: string;
}) {
  const subject = `💬 New messages in "${groupName}"`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${subject}</title>
      </head>
      <body style="font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 20px; background-color: #f9fafb;">
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <h2 style="color: #111827; margin-top: 0;">Hey ${userName}! 👋</h2>

          <p style="color: #374151; font-size: 16px; line-height: 1.5;">
            The discussion is heating up! You have <strong>${unreadCount} new message${unreadCount === 1 ? '' : 's'}</strong> 
            in <strong>${groupName}</strong> about <em>"${videoTitle}"</em>.
          </p>

          <div style="background: #f3f4f6; border-radius: 6px; padding: 15px; margin: 20px 0;">
            <p style="color: #4b5563; margin: 0;">
              Don't miss out on the conversation! Join the discussion and share your thoughts.
            </p>
          </div>

          <a href="${groupUrl}" 
             style="display: inline-block; background-color: #2563eb; color: white; 
                    padding: 12px 24px; text-decoration: none; border-radius: 6px;
                    font-weight: 500; margin: 20px 0;">
            Join the Discussion
          </a>

          <p style="color: #6b7280; font-size: 14px; margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
            You're receiving this because you're a member of the discussion group. 
            You can manage your notification preferences in your account settings.
          </p>
        </div>
      </body>
    </html>
  `;

  await sendEmail({
    to: userEmail,
    subject,
    text: `Hey ${userName}! You have ${unreadCount} unread message${unreadCount === 1 ? '' : 's'} in "${groupName}" discussing "${videoTitle}". Join the discussion here: ${groupUrl}`,
    html,
  });
}