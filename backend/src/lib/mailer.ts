import nodemailer from 'nodemailer';
import { config } from '../config';
import { logger } from './logger';

const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: config.smtp.secure,
  auth: config.smtp.user
    ? { user: config.smtp.user, pass: config.smtp.pass }
    : undefined,
});

function baseTemplate(content: string, preheader = '') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>DataServer</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; margin: 0; padding: 0; }
    .container { max-width: 560px; margin: 40px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .header { background: #1e3a8a; padding: 32px 40px; text-align: center; }
    .header h1 { color: #fff; margin: 0; font-size: 24px; letter-spacing: -0.5px; }
    .header p { color: #93c5fd; margin: 4px 0 0; font-size: 14px; }
    .body { padding: 40px; color: #374151; }
    .body h2 { margin-top: 0; font-size: 20px; color: #111827; }
    .body p { line-height: 1.6; margin: 0 0 16px; }
    .btn { display: inline-block; background: #2563eb; color: #fff !important; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 15px; margin: 8px 0 24px; }
    .code { background: #f1f5f9; border: 2px dashed #cbd5e1; border-radius: 8px; padding: 16px 24px; text-align: center; font-size: 28px; letter-spacing: 4px; font-family: monospace; color: #1e3a8a; font-weight: 700; margin: 16px 0 24px; }
    .footer { padding: 24px 40px; border-top: 1px solid #f1f5f9; text-align: center; color: #9ca3af; font-size: 13px; }
    .warning { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px 16px; color: #dc2626; font-size: 14px; margin: 16px 0; }
  </style>
</head>
<body>
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;">${preheader}</div>` : ''}
  <div class="container">
    <div class="header">
      <h1>DataServer</h1>
      <p>Secure Cloud Storage</p>
    </div>
    <div class="body">${content}</div>
    <div class="footer">
      <p>DataServer &mdash; Secure, invitation-only cloud storage.</p>
      <p>If you did not request this, please ignore this email or contact support.</p>
    </div>
  </div>
</body>
</html>`;
}

async function send(to: string, subject: string, html: string): Promise<void> {
  try {
    await transporter.sendMail({ from: config.smtp.from, to, subject, html });
    logger.info('Email sent', { to, subject });
  } catch (error) {
    logger.error('Failed to send email', { to, subject, error });
    throw error;
  }
}

export async function sendVerificationEmail(
  to: string,
  displayName: string,
  verificationUrl: string
): Promise<void> {
  const html = baseTemplate(
    `<h2>Verify your email address</h2>
     <p>Hi ${displayName},</p>
     <p>Welcome to DataServer! Please verify your email address to activate your account.</p>
     <a href="${verificationUrl}" class="btn">Verify Email Address</a>
     <p>This link expires in 24 hours.</p>
     <p style="color:#6b7280;font-size:13px;">Or copy this URL: <code>${verificationUrl}</code></p>`,
    'Verify your DataServer email address'
  );
  await send(to, 'Verify your DataServer account', html);
}

export async function sendPasswordResetEmail(
  to: string,
  displayName: string,
  resetUrl: string
): Promise<void> {
  const html = baseTemplate(
    `<h2>Reset your password</h2>
     <p>Hi ${displayName},</p>
     <p>We received a request to reset your DataServer password. Click the button below to create a new password.</p>
     <a href="${resetUrl}" class="btn">Reset Password</a>
     <p>This link expires in 1 hour.</p>
     <div class="warning">If you did not request a password reset, please ignore this email and consider changing your password as a precaution.</div>`,
    'Reset your DataServer password'
  );
  await send(to, 'Reset your DataServer password', html);
}

export async function sendPlatformInvitationEmail(
  to: string,
  invitationCode: string,
  inviterName: string,
  note: string | null,
  registrationUrl: string
): Promise<void> {
  const html = baseTemplate(
    `<h2>You've been invited to DataServer</h2>
     <p>${inviterName} has invited you to join DataServer, a secure invitation-only cloud storage platform.</p>
     ${note ? `<p><em>"${note}"</em></p>` : ''}
     <p>Your invitation code:</p>
     <div class="code">${invitationCode}</div>
     <p>Or click the button below to register directly:</p>
     <a href="${registrationUrl}" class="btn">Accept Invitation &amp; Register</a>
     <p style="color:#6b7280;font-size:13px;">This code is for your use only. Do not share it with others.</p>`,
    `You've been invited to join DataServer`
  );
  await send(to, `${inviterName} invited you to DataServer`, html);
}

export async function sendFolderSharedEmail(
  to: string,
  recipientName: string,
  sharerName: string,
  folderName: string,
  permission: string,
  folderUrl: string
): Promise<void> {
  const html = baseTemplate(
    `<h2>A folder has been shared with you</h2>
     <p>Hi ${recipientName},</p>
     <p><strong>${sharerName}</strong> has shared the folder <strong>"${folderName}"</strong> with you.</p>
     <p>Your access level: <strong>${permission}</strong></p>
     <a href="${folderUrl}" class="btn">Open Shared Folder</a>`,
    `${sharerName} shared "${folderName}" with you`
  );
  await send(to, `${sharerName} shared "${folderName}" with you`, html);
}

export async function sendSecurityAlertEmail(
  to: string,
  displayName: string,
  alertTitle: string,
  alertDetail: string
): Promise<void> {
  const html = baseTemplate(
    `<h2>Security Alert</h2>
     <p>Hi ${displayName},</p>
     <div class="warning"><strong>${alertTitle}</strong><br/>${alertDetail}</div>
     <p>If this was you, no action is needed. If not, please immediately change your password and review your account security.</p>
     <a href="${config.frontendUrl}/drive/security" class="btn">Review Security Settings</a>`,
    `Security alert for your DataServer account`
  );
  await send(to, `Security Alert: ${alertTitle}`, html);
}

export async function sendStorageWarningEmail(
  to: string,
  displayName: string,
  usedPercent: number
): Promise<void> {
  const html = baseTemplate(
    `<h2>Storage Almost Full</h2>
     <p>Hi ${displayName},</p>
     <p>Your DataServer storage is <strong>${usedPercent}% full</strong>. Consider deleting unused files or emptying the trash to free up space.</p>
     <a href="${config.frontendUrl}/drive/settings" class="btn">Manage Storage</a>`,
    `Your storage is ${usedPercent}% full`
  );
  await send(to, 'DataServer: Storage Almost Full', html);
}
