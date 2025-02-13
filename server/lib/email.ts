import { Resend } from 'resend';

let resend: Resend | null = null;

console.log('Checking for RESEND_API_KEY:', process.env.RESEND_API_KEY ? 'Found key' : 'No key found');
if (process.env.RESEND_API_KEY) {
  console.log('Initializing Resend with API key');
  resend = new Resend(process.env.RESEND_API_KEY);
  console.log('Resend client initialized');
} else {
  console.warn('RESEND_API_KEY not found in environment variables');
}

interface SendEmailParams {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendEmail({ to, subject, text, html }: SendEmailParams) {
  console.log('Email function called with params:', { to, subject });
  console.log('Resend client status:', resend ? 'Initialized' : 'Not initialized');
  console.log('RESEND_API_KEY status:', process.env.RESEND_API_KEY ? 'Present' : 'Missing');
  
  if (!resend) {
    console.warn('Resend API key not configured, skipping email send');
    return;
  }

  try {
    console.log(`Attempting to send email to ${to}`);
    console.log('Email subject:', subject);
    console.log('Using from address:', process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev');

    if (!resend.emails) {
      console.error('Resend client emails property is undefined');
      throw new Error('Invalid Resend client configuration');
    }

    const result = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
      to,
      subject,
      text,
      html: html || text,
    }).catch(error => {
      console.error('Resend API error:', error);
      throw error;
    });

    console.log('Email sent successfully:', result);
    return result;
  } catch (error) {
    console.error('Error sending email:', error);
    // Log more details about the error
    if (error instanceof Error) {
      console.error('Error name:', error.name);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
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
            in <strong>${groupName}</strong> about <em>"${videoTitle}"</em>.
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
    text: `Hey ${userName}! You have ${unreadCount} unread message${unreadCount === 1 ? '' : 's'} in "${groupName}" discussing "${videoTitle}". Here are some recent messages:\n\n${
      unreadMessages.map(m => `${m.user.username}: ${m.content}`).join('\n')
    }\n\nRespond to the discussion here: ${groupUrl}`,
    html,
  });
}