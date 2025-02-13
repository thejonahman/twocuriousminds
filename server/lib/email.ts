import { Resend } from 'resend';

export let resend: Resend | null = null;

console.log('Email module initialization starting...');
console.log('Environment variables available:', Object.keys(process.env).join(', '));
console.log('RESEND_API_KEY status:', process.env.RESEND_API_KEY ? `Present (length: ${process.env.RESEND_API_KEY.length})` : 'Missing');
console.log('RESEND_FROM_EMAIL status:', process.env.RESEND_FROM_EMAIL ? `Present (${process.env.RESEND_FROM_EMAIL})` : 'Missing');

// Validate environment variables
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

if (process.env.RESEND_API_KEY) {
  try {
    console.log('Initializing Resend with API key');
    resend = new Resend(process.env.RESEND_API_KEY);
    console.log('Resend client created successfully');
    // Test if the client is properly initialized
    if (resend && resend.emails) {
      console.log('Resend client appears to be properly initialized');
    } else {
      console.error('Resend client created but emails property is missing');
    }
  } catch (error) {
    console.error('Error initializing Resend client:', error);
  }
} else {
  console.error('RESEND_API_KEY not found in environment variables - email sending will be disabled');
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
  console.log('Resend client status:', resend ? 'Initialized' : 'Not initialized');
  console.log('RESEND client properties:', resend ? Object.keys(resend) : 'No client');
  console.log('RESEND_API_KEY status:', process.env.RESEND_API_KEY ? 'Present' : 'Missing');
  console.log('RESEND_FROM_EMAIL:', process.env.RESEND_FROM_EMAIL);

  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    console.error('Missing required environment variables');
    throw new Error('Email configuration missing');
  }

  if (!resend) {
    throw new Error('Resend API key not configured');
  }

  try {
    console.log('=== Preparing Email ===');
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log('From:', process.env.RESEND_FROM_EMAIL);
    console.log('Text length:', text?.length);
    console.log('HTML length:', html?.length);
    console.log('Resend client state:', {
      initialized: !!resend,
      hasEmailsMethod: resend?.emails ? 'yes' : 'no',
      apiKeyLength: process.env.RESEND_API_KEY?.length || 0
    });

    if (!to || !to.includes('@')) {
      throw new Error('Invalid recipient email address');
    }

    if (!process.env.RESEND_FROM_EMAIL || !process.env.RESEND_FROM_EMAIL.includes('@')) {
      throw new Error('Invalid sender email address');
    }

    const payload = {
      from: process.env.RESEND_FROM_EMAIL,
      to,
      subject,
      text,
      html: html || text,
    };
    console.log('Email payload:', payload);

    if (!resend?.emails?.send) {
      throw new Error('Resend client is not properly initialized');
    }

    console.log('=== Attempting to Send Email ===');
    console.log('Resend API Key:', process.env.RESEND_API_KEY ? 'Present' : 'Missing');
    console.log('From Email:', process.env.RESEND_FROM_EMAIL);
    console.log('To Email:', payload.to);
    console.log('Subject:', payload.subject);

    const result = await resend.emails.send(payload);
    console.log('=== Email Sent Successfully ===');
    console.log('Resend API response:', result);
    return result;
  } catch (error: any) {
    console.error('=== Email Send Error ===');
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack,
      response: error.response?.data || error.response,
      code: error.code,
      status: error.status,
      statusCode: error.statusCode,
      validationErrors: error.validationErrors,
      originalError: error.originalError
    });
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