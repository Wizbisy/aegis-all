import { config } from '../config.js';
import { AppError, InfrastructureError } from './errors.js';
import { logger } from './logger.js';
import { createCircuitBreaker } from './circuitbreaker.js';

interface EmailMessage {
  subject: string;
  text: string;
  html: string;
}

/**
 * Builds a HTML email for OTP verification.
 */
function buildOtpEmail(email: string, otp: string, expiresAt: Date): EmailMessage {
  const diffMs = expiresAt.getTime() - Date.now();
  const diffMin = Math.max(1, Math.round(diffMs / 60000));
  const expiryText = expiresAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const brandColor = '#4f46e5';

  return {
    subject: `🔐 ${otp} is your Aegis verification code`,
    text: `Your Aegis verification code is ${otp}. It expires in ${diffMin} minutes (at ${expiryText}). If you did not request this, ignore this message.`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          .container { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.5; color: #1f2937; max-width: 500px; margin: 0 auto; padding: 40px 20px; }
          .card { background: #ffffff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
          .header { margin-bottom: 24px; }
          .logo { color: ${brandColor}; font-size: 24px; font-weight: 800; letter-spacing: -0.025em; }
          .title { font-size: 20px; font-weight: 700; color: #111827; margin: 0 0 12px; }
          .description { font-size: 14px; color: #4b5563; margin-bottom: 24px; }
          .otp-box { background: #f9fafb; border: 2px dashed ${brandColor}40; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0; }
          .otp-code { font-size: 32px; font-weight: 800; letter-spacing: 0.25em; color: ${brandColor}; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
          .footer { font-size: 12px; color: #9ca3af; margin-top: 32px; text-align: center; }
          .accent { color: ${brandColor}; font-weight: 500; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="card">
            <div class="header">
              <img src="https://raw.githubusercontent.com/Wizbisy/mintlify-docs/main/logo/light.svg" alt="AEGIS" width="140" style="display: block; max-width: 140px; height: auto; outline: none; border: none; text-decoration: none;" />
            </div>
            <h1 class="title">Verify your identity</h1>
            <p class="description">
              Use the verification code below to authorize your agent connection. 
              This code will expire in <span class="accent">${diffMin} minutes</span> (at ${expiryText}).
            </p>
            <div class="otp-box">
              <div class="otp-code">${otp}</div>
            </div>
            <p style="font-size: 13px; color: #6b7280; margin: 0;">
              Recipient: <strong>${email}</strong>
            </p>
          </div>
          <div class="footer">
            &copy; ${new Date().getFullYear()} Aegis. All rights reserved.<br>
            If you didn't request this, you can safely ignore this email.
          </div>
        </div>
      </body>
      </html>
    `,
  };
}


async function _sendEmail(to: string, message: EmailMessage) {
  if (!config.RESEND_API_KEY || !config.RESEND_FROM_EMAIL) {
    throw new AppError(503, 'Email delivery is not configured', 'EMAIL_NOT_CONFIGURED');
  }

  try {
    const response = await fetch(config.RESEND_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: config.RESEND_FROM_EMAIL,
        to: [to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Unknown provider error' }));
      logger.error({ status: response.status, errorData }, 'Resend API failure');
      
      throw new InfrastructureError(
        `Email provider error (${response.status}): ${errorData.message || 'Unknown failure'}`,
        'EMAIL_PROVIDER_ERROR'
      );
    }

    return { success: true };
  } catch (error) {
    if (error instanceof AppError) throw error;
    
    logger.error({ error, recipient: to }, 'Network failure during email delivery');
    throw new InfrastructureError('Failed to reach email service provider', 'EMAIL_SERVICE_UNREACHABLE');
  }
}

const protectedSendEmail = createCircuitBreaker(
  { name: 'email-delivery', threshold: 3, resetTimeoutMs: 60_000 },
  _sendEmail
);

/**
 * Sends an OTP verification email to the specified agent.
 */
export async function sendOtpEmail(email: string, otp: string, expiresAt: Date) {
  const message = buildOtpEmail(email, otp, expiresAt);
  await protectedSendEmail(email, message);
  
  return { delivered: true, provider: 'resend' as const };
}