import { Resend } from 'resend';

export let resend: Resend | null = null;

// Initialize Resend client
if (!process.env.RESEND_API_KEY) {
  console.error('RESEND_API_KEY is missing');
} else if (!process.env.RESEND_FROM_EMAIL) {
  console.error('RESEND_FROM_EMAIL is missing');
} else {
  try {
    resend = new Resend(process.env.RESEND_API_KEY.trim());
    console.log('Resend client initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Resend client:', error);
  }
}

interface SendEmailParams {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendEmail({ to, subject, text, html }: SendEmailParams) {
  console.log('=== Email Send Attempt Start ===');
  console.log('Email function called with params:', { to, subject });

  if (!resend) {
    throw new Error('Resend client not initialized');
  }

  try {
    const payload = {
      from: process.env.RESEND_FROM_EMAIL!,
      to,
      subject,
      text,
      html: html || text,
    };

    console.log('Sending email with payload:', {
      ...payload,
      text: payload.text.substring(0, 50) + '...' // Log truncated content for brevity
    });

    const result = await resend.emails.send(payload);
    console.log('Email sent successfully:', result);
    return result;
  } catch (error: any) {
    console.error('Failed to send email:', error);
    throw error;
  }
}

interface Message {
  content: string;
  user: {
    username: string;
  };
  createdAt: Date;
}

export async function sendUnreadMessagesNotification({
  userEmail,
  userName,
  groupName,
  videoTitle,
  unreadCount,
  unreadMessages,
  groupUrl
}: {
  userEmail: string;
  userName: string;
  groupName: string;
  videoTitle: string;
  unreadCount: number;
  unreadMessages: Message[];
  groupUrl: string;
}) {
  console.log('Sending unread messages notification to:', userEmail);
  console.log('Notification details:', {
    groupName,
    videoTitle,
    unreadCount,
    messagesCount: unreadMessages.length
  });

  const subject = `💬 New messages in "${groupName}"`;

  const formatMessage = (message: Message) => `
    <div style="background: #f3f4f6; border-radius: 6px; padding: 12px; margin: 8px 0;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
        <strong style="color: #4b5563;">${message.user.username}</strong>
        <span style="color: #6b7280; font-size: 12px;">
          ${new Date(message.createdAt).toLocaleTimeString()}
        </span>
      </div>
      <p style="color: #374151; margin: 0;">${message.content}</p>
    </div>
  `;

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
            in <strong>${groupName}</strong>${videoTitle ? ` about <em>"${videoTitle}"</em>` : ''}.
          </p>

          <div style="margin: 24px 0;">
            <h3 style="color: #1f2937; font-size: 16px; margin-bottom: 12px;">Recent messages you missed:</h3>
            ${unreadMessages.map(formatMessage).join('')}
          </div>

          <div style="background: #f8fafc; border-radius: 6px; padding: 15px; margin: 20px 0; border-left: 4px solid #2563eb;">
            <p style="color: #4b5563; margin: 0;">
              Join the conversation and share your thoughts! The group is waiting to hear from you.
            </p>
          </div>

          <a href="${groupUrl}" 
             style="display: inline-block; background-color: #2563eb; color: white; 
                    padding: 12px 24px; text-decoration: none; border-radius: 6px;
                    font-weight: 500; margin: 20px 0;">
            Respond to Messages
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
    text: `Hey ${userName}! You have ${unreadCount} unread message${unreadCount === 1 ? '' : 's'} in "${groupName}"${videoTitle ? ` discussing "${videoTitle}"` : ''}. Here are some recent messages:\n\n${
      unreadMessages.map(m => `${m.user.username}: ${m.content}`).join('\n')
    }\n\nRespond to the discussion here: ${groupUrl}`,
    html,
  });
}