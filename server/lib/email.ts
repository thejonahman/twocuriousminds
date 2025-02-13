import { Resend } from 'resend';

export let resend: Resend | null = null;

// Initialize Resend client
if (!process.env.RESEND_API_KEY) {
  console.error('RESEND_API_KEY is missing');
} else if (!process.env.RESEND_FROM_EMAIL) {
  console.error('RESEND_FROM_EMAIL is missing');
} else {
  try {
    console.log('[Email Service] Initializing with configuration:', {
      hasApiKey: !!process.env.RESEND_API_KEY,
      fromEmail: process.env.RESEND_FROM_EMAIL.trim(),
    });
    resend = new Resend(process.env.RESEND_API_KEY.trim());
    console.log('[Email Service] Initialized successfully');
  } catch (error) {
    console.error('[Email Service] Failed to initialize:', error);
  }
}

interface SendEmailParams {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendEmail({ to, subject, text, html }: SendEmailParams) {
  console.log('[Email Service] Sending email:', { to, subject });

  if (!resend) {
    console.error('[Email Service] Not initialized - missing configuration');
    throw new Error('Email service not initialized');
  }

  try {
    const payload = {
      from: process.env.RESEND_FROM_EMAIL!,
      to,
      subject,
      text,
      html: html || text,
    };

    console.log('[Email Service] Sending with payload:', {
      ...payload,
      text: payload.text.substring(0, 100) + '...' // Log truncated content
    });

    const result = await resend.emails.send(payload);
    console.log('[Email Service] Sent successfully:', result);
    return result;
  } catch (error: any) {
    console.error('[Email Service] Send failed:', {
      error,
      name: error.name,
      message: error.message,
      details: error.response?.body || error.stack
    });
    throw error;
  }
}

interface Message {
  id: number;
  content: string;
  user: {
    username: string;
  };
  createdAt: Date | null;
  updatedAt: Date | null;
  groupId: number;
  userId: number;
}

interface GroupEngagement {
  totalMembers: number;
  activeMembers: number;
  recentMessages: number;
  topContributors: Array<{
    username: string;
    messageCount: number;
  }>;
}

export async function sendUnreadMessagesNotification({
  userEmail,
  userName,
  groupName,
  videoTitle,
  unreadCount,
  unreadMessages,
  groupUrl,
  groupEngagement,
  reminderCount = 0
}: {
  userEmail: string;
  userName: string;
  groupName: string;
  videoTitle: string;
  unreadCount: number;
  unreadMessages: Message[];
  groupUrl: string;
  groupEngagement?: GroupEngagement;
  reminderCount?: number;
}) {
  // Don't send more than 3 reminders
  if (reminderCount >= 3) {
    console.log('[Notification Service] Skipping notification - max reminders reached:', {
      email: userEmail,
      groupName,
      reminderCount
    });
    return;
  }

  console.log('[Notification Service] Preparing notification:', {
    to: userEmail,
    groupName,
    videoTitle,
    unreadCount,
    messagesPreview: unreadMessages.map(m => ({
      from: m.user.username,
      preview: m.content.substring(0, 50)
    }))
  });

  const subject = `💬 New activity in "${groupName}" discussion`;

  const formatMessage = (message: Message) => `
    <div style="background: #f3f4f6; border-radius: 6px; padding: 12px; margin: 8px 0;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
        <strong style="color: #4b5563;">${message.user.username}</strong>
        <span style="color: #6b7280; font-size: 12px;">
          ${message.createdAt ? new Date(message.createdAt).toLocaleTimeString() : 'Just now'}
        </span>
      </div>
      <p style="color: #374151; margin: 0;">${message.content}</p>
    </div>
  `;

  // Generate engagement section if data is available
  const engagementSection = groupEngagement ? `
    <div style="background: #f0f9ff; border-radius: 6px; padding: 15px; margin: 20px 0; border-left: 4px solid #0ea5e9;">
      <h3 style="color: #0369a1; margin-top: 0; font-size: 16px;">Group Activity</h3>
      <ul style="color: #334155; margin: 10px 0; padding-left: 20px;">
        <li>${groupEngagement.activeMembers} out of ${groupEngagement.totalMembers} members active today</li>
        <li>${groupEngagement.recentMessages} messages in the last 24 hours</li>
        ${groupEngagement.topContributors.length > 0 ? `
          <li>Top contributors: ${groupEngagement.topContributors
            .map(c => `${c.username} (${c.messageCount} messages)`)
            .join(', ')}</li>
        ` : ''}
      </ul>
    </div>
  ` : '';

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
            The discussion is active! You have <strong>${unreadCount} new message${unreadCount === 1 ? '' : 's'}</strong> 
            in <strong>${groupName}</strong>${videoTitle ? ` about <em>"${videoTitle}"</em>` : ''}.
          </p>

          ${engagementSection}

          <div style="margin: 24px 0;">
            <h3 style="color: #1f2937; font-size: 16px; margin-bottom: 12px;">Recent messages you missed:</h3>
            ${unreadMessages.map(formatMessage).join('')}
          </div>

          <div style="background: #f8fafc; border-radius: 6px; padding: 15px; margin: 20px 0; border-left: 4px solid #2563eb;">
            <p style="color: #4b5563; margin: 0;">
              ${unreadMessages.some(m => m.content.includes('?')) 
                ? "There are questions waiting for your input! Join the conversation and share your thoughts."
                : "Join the conversation and share your perspective! The group is waiting to hear from you."}
            </p>
          </div>

          <a href="${groupUrl}" 
             style="display: inline-block; background-color: #2563eb; color: white; 
                    padding: 12px 24px; text-decoration: none; border-radius: 6px;
                    font-weight: 500; margin: 20px 0;">
            Respond to Discussion
          </a>

          <p style="color: #6b7280; font-size: 14px; margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
            You're receiving this because you're a member of the discussion group. 
            You can manage your notification preferences in your account settings.
          </p>
        </div>
      </body>
    </html>
  `;

  try {
    const result = await sendEmail({
      to: userEmail,
      subject,
      text: `Hey ${userName}! You have ${unreadCount} unread message${unreadCount === 1 ? '' : 's'} in "${groupName}"${videoTitle ? ` discussing "${videoTitle}"` : ''}.
${groupEngagement ? `
Group Activity:
- ${groupEngagement.activeMembers}/${groupEngagement.totalMembers} members active today
- ${groupEngagement.recentMessages} messages in the last 24 hours
${groupEngagement.topContributors.length > 0 ? `- Top contributors: ${groupEngagement.topContributors.map(c => `${c.username} (${c.messageCount})`).join(', ')}` : ''}
` : ''}

Recent messages:
${unreadMessages.map(m => `${m.user.username}: ${m.content}`).join('\n')}

Respond to the discussion here: ${groupUrl}`,
      html,
    });

    console.log('[Notification Service] Sent successfully:', {
      to: userEmail,
      messageCount: unreadMessages.length,
      result
    });

    return result;
  } catch (error) {
    console.error('[Notification Service] Failed to send:', error);
    throw error;
  }
}