import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import crypto from 'crypto';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { passport, hashPassword, verifyPassword, requireAuth, requireVerifiedEmail } from '../middleware/auth';
import { authRateLimiter } from '../middleware/rateLimiter';
import { prisma } from '../lib/prisma';
import { config } from '../config';
import { logger } from '../lib/logger';
import { auditFromRequest } from '../services/auditService';
import { validateInvitationCode, consumeInvitationCode } from '../services/invitationService';
import { notifySecurityChange, notifyInvitationAccepted } from '../services/notificationService';
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendSecurityAlertEmail,
} from '../lib/mailer';
import { AuditAction, AuthProvider, UserStatus, InvitationType } from '@prisma/client';

export const authRouter = Router();

// ─── Register ────────────────────────────────────────────────

authRouter.post(
  '/register',
  authRateLimiter,
  [
    body('invitationCode').trim().notEmpty().withMessage('Invitation code is required.'),
    body('displayName').trim().isLength({ min: 2, max: 100 }).withMessage('Display name must be 2-100 characters.'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email required.'),
    body('password')
      .isLength({ min: 8 })
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('Password must be at least 8 characters with uppercase, lowercase, and number.'),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const { invitationCode, displayName, email, password } = req.body;

    // Validate invitation code
    const validation = await validateInvitationCode(invitationCode, InvitationType.PLATFORM);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const invitation = validation.invitation!;

    // Check email restriction
    if (invitation.email && invitation.email !== email.toLowerCase()) {
      res.status(400).json({ error: 'This invitation is restricted to a specific email address.' });
      return;
    }

    // Check email not taken
    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const passwordHash = await hashPassword(password);
    const verifyToken = crypto.randomBytes(32).toString('hex');
    const verifyExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        displayName: displayName.trim(),
        passwordHash,
        emailVerifyToken: verifyToken,
        emailVerifyExpiry: verifyExpiry,
        status: UserStatus.PENDING_VERIFICATION,
        authProvider: AuthProvider.LOCAL,
        storageQuotaBytes: config.storage.defaultQuotaBytes,
      },
    });

    await consumeInvitationCode(invitationCode, user.id);
    await auditFromRequest(req, AuditAction.USER_REGISTERED, { entityType: 'User', entityId: user.id });

    // Notify invitation creator
    if (invitation.creatorId) {
      await notifyInvitationAccepted(invitation.creatorId, displayName);
    }

    const verificationUrl = `${config.frontendUrl}/verify-email?token=${verifyToken}`;
    await sendVerificationEmail(email, displayName, verificationUrl).catch((e) =>
      logger.error('Failed to send verification email', { error: e.message })
    );

    res.status(201).json({
      message: 'Account created. Please check your email to verify your address.',
      userId: user.id,
    });
  }
);

// ─── Login ───────────────────────────────────────────────────

authRouter.post(
  '/login',
  authRateLimiter,
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ],
  (req: Request, res: Response, next: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    passport.authenticate('local', async (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) {
        await auditFromRequest(req, AuditAction.USER_LOGIN_FAILED, {
          details: { email: req.body.email },
        });
        res.status(401).json({ error: info?.message ?? 'Invalid credentials.' });
        return;
      }

      // Check 2FA
      if (user.twoFactorEnabled) {
        const { totpCode } = req.body;
        if (!totpCode) {
          res.status(200).json({ requiresTwoFactor: true });
          return;
        }
        const valid = speakeasy.totp.verify({
          secret: user.twoFactorSecret,
          encoding: 'base32',
          token: totpCode,
          window: 2,
        });
        if (!valid) {
          res.status(401).json({ error: 'Invalid two-factor code.' });
          return;
        }
      }

      req.logIn(user, async (loginErr) => {
        if (loginErr) return next(loginErr);

        const ip = req.headers['x-forwarded-for']?.toString().split(',')[0] ?? req.socket?.remoteAddress ?? '';

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date(), lastLoginIp: ip },
        });

        await auditFromRequest(req, AuditAction.USER_LOGIN, {
          entityType: 'User',
          entityId: user.id,
        });

        res.json({
          user: {
            id: user.id,
            email: user.email,
            displayName: user.displayName,
            role: user.role,
            emailVerified: user.emailVerified,
            avatarUrl: user.avatarUrl,
            storageQuotaBytes: user.storageQuotaBytes?.toString(),
            storageUsedBytes: user.storageUsedBytes?.toString(),
            twoFactorEnabled: user.twoFactorEnabled,
          },
        });
      });
    })(req, res, next);
  }
);

// ─── Logout ──────────────────────────────────────────────────

authRouter.post('/logout', requireAuth, async (req: Request, res: Response) => {
  const user = req.user as any;
  await auditFromRequest(req, AuditAction.USER_LOGOUT, { entityType: 'User', entityId: user?.id });
  req.logout(() => {
    req.session.destroy(() => {
      res.clearCookie('ds.sid');
      res.json({ message: 'Logged out successfully.' });
    });
  });
});

// ─── Current user ────────────────────────────────────────────

authRouter.get('/me', requireAuth, (req: Request, res: Response) => {
  const user = req.user as any;
  res.json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      emailVerified: user.emailVerified,
      avatarUrl: user.avatarUrl,
      storageQuotaBytes: user.storageQuotaBytes?.toString(),
      storageUsedBytes: user.storageUsedBytes?.toString(),
      twoFactorEnabled: user.twoFactorEnabled,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    },
  });
});

// ─── Google OAuth ────────────────────────────────────────────

authRouter.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

authRouter.get(
  '/google/callback',
  (req: Request, res: Response, next: any) => {
    passport.authenticate('google', async (err: any, user: any, info: any) => {
      if (err) return next(err);

      if (!user) {
        if (info?.message === 'GOOGLE_NEW_USER') {
          // Redirect to registration with Google profile info stored in session
          const profile = info.googleProfile;
          (req.session as any).pendingGoogleProfile = profile;
          return res.redirect(`${config.frontendUrl}/register?googlePending=true`);
        }
        return res.redirect(`${config.frontendUrl}/login?error=google_failed`);
      }

      req.logIn(user, async (loginErr) => {
        if (loginErr) return next(loginErr);
        await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
        await auditFromRequest(req, AuditAction.USER_LOGIN, { entityType: 'User', entityId: user.id });
        res.redirect(`${config.frontendUrl}/drive`);
      });
    })(req, res, next);
  }
);

// Register Google user with invitation code
authRouter.post(
  '/google/complete-registration',
  authRateLimiter,
  [body('invitationCode').trim().notEmpty()],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const profile = (req.session as any).pendingGoogleProfile;
    if (!profile) {
      res.status(400).json({ error: 'No pending Google registration. Please try Google login again.' });
      return;
    }

    const { invitationCode } = req.body;
    const validation = await validateInvitationCode(invitationCode, InvitationType.PLATFORM);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const existing = await prisma.user.findUnique({ where: { email: profile.email } });
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const user = await prisma.user.create({
      data: {
        email: profile.email,
        displayName: profile.displayName,
        googleId: profile.id,
        avatarUrl: profile.avatarUrl,
        emailVerified: true,
        status: UserStatus.ACTIVE,
        authProvider: AuthProvider.GOOGLE,
        storageQuotaBytes: config.storage.defaultQuotaBytes,
      },
    });

    await consumeInvitationCode(invitationCode, user.id);
    delete (req.session as any).pendingGoogleProfile;

    req.logIn(user, async (loginErr) => {
      if (loginErr) {
        res.status(500).json({ error: 'Login failed after registration.' });
        return;
      }
      await auditFromRequest(req, AuditAction.USER_REGISTERED, { entityType: 'User', entityId: user.id });
      res.json({
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          role: user.role,
          emailVerified: user.emailVerified,
          avatarUrl: user.avatarUrl,
        },
      });
    });
  }
);

// ─── Email verification ──────────────────────────────────────

authRouter.post(
  '/verify-email',
  [body('token').trim().notEmpty()],
  async (req: Request, res: Response) => {
    const { token } = req.body;

    const user = await prisma.user.findFirst({
      where: {
        emailVerifyToken: token,
        emailVerifyExpiry: { gt: new Date() },
      },
    });

    if (!user) {
      res.status(400).json({ error: 'Invalid or expired verification token.' });
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        status: UserStatus.ACTIVE,
        emailVerifyToken: null,
        emailVerifyExpiry: null,
      },
    });

    await auditFromRequest(req, AuditAction.EMAIL_VERIFIED, { entityType: 'User', entityId: user.id });
    res.json({ message: 'Email verified successfully. You can now log in.' });
  }
);

authRouter.post('/resend-verification', authRateLimiter, requireAuth, async (req: Request, res: Response) => {
  const user = req.user as any;
  if (user.emailVerified) {
    res.status(400).json({ error: 'Email already verified.' });
    return;
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerifyToken: token, emailVerifyExpiry: expiry },
  });

  const url = `${config.frontendUrl}/verify-email?token=${token}`;
  await sendVerificationEmail(user.email, user.displayName, url);
  res.json({ message: 'Verification email resent.' });
});

// ─── Password reset ──────────────────────────────────────────

authRouter.post(
  '/forgot-password',
  authRateLimiter,
  [body('email').isEmail().normalizeEmail()],
  async (req: Request, res: Response) => {
    const { email } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });

    // Always respond the same way to prevent user enumeration
    if (user && user.authProvider === AuthProvider.LOCAL) {
      const token = crypto.randomBytes(32).toString('hex');
      const expiry = new Date(Date.now() + 60 * 60 * 1000);

      await prisma.passwordReset.create({
        data: { userId: user.id, token, expiresAt: expiry },
      });

      const resetUrl = `${config.frontendUrl}/reset-password?token=${token}`;
      await sendPasswordResetEmail(user.email, user.displayName, resetUrl).catch(() => {});

      await auditFromRequest(req, AuditAction.PASSWORD_RESET_REQUESTED, {
        entityType: 'User',
        entityId: user.id,
      });
    }

    res.json({ message: 'If an account exists for that email, a reset link has been sent.' });
  }
);

authRouter.post(
  '/reset-password',
  authRateLimiter,
  [
    body('token').trim().notEmpty(),
    body('password')
      .isLength({ min: 8 })
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const { token, password } = req.body;

    const reset = await prisma.passwordReset.findFirst({
      where: { token, usedAt: null, expiresAt: { gt: new Date() } },
      include: { user: true },
    });

    if (!reset) {
      res.status(400).json({ error: 'Invalid or expired reset token.' });
      return;
    }

    const passwordHash = await hashPassword(password);

    await prisma.$transaction([
      prisma.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
      prisma.user.update({ where: { id: reset.userId }, data: { passwordHash } }),
    ]);

    await auditFromRequest(req, AuditAction.PASSWORD_CHANGED, {
      entityType: 'User',
      entityId: reset.userId,
    });

    await notifySecurityChange(
      reset.userId,
      'Password changed',
      'Your DataServer password was successfully reset.'
    );

    res.json({ message: 'Password reset successfully. You can now log in.' });
  }
);

authRouter.post(
  '/change-password',
  requireAuth,
  requireVerifiedEmail,
  [
    body('currentPassword').notEmpty(),
    body('newPassword')
      .isLength({ min: 8 })
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const user = req.user as any;
    const { currentPassword, newPassword } = req.body;

    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser?.passwordHash) {
      res.status(400).json({ error: 'Cannot change password for Google accounts.' });
      return;
    }

    const valid = await verifyPassword(dbUser.passwordHash, currentPassword);
    if (!valid) {
      res.status(401).json({ error: 'Current password is incorrect.' });
      return;
    }

    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

    await auditFromRequest(req, AuditAction.PASSWORD_CHANGED, {
      entityType: 'User',
      entityId: user.id,
    });

    await notifySecurityChange(user.id, 'Password changed', 'Your account password was changed.');

    await sendSecurityAlertEmail(
      dbUser.email,
      dbUser.displayName,
      'Password Changed',
      'Your DataServer password was just changed. If this was not you, please contact support immediately.'
    ).catch(() => {});

    res.json({ message: 'Password changed successfully.' });
  }
);

// ─── Two-Factor Authentication ───────────────────────────────

authRouter.get('/2fa/setup', requireAuth, requireVerifiedEmail, async (req: Request, res: Response) => {
  const user = req.user as any;

  const secret = speakeasy.generateSecret({
    name: `DataServer (${user.email})`,
    length: 20,
  });

  // Store temp secret in session
  (req.session as any).twoFactorSetupSecret = secret.base32;

  const qrDataUrl = await QRCode.toDataURL(secret.otpauth_url!);

  res.json({
    secret: secret.base32,
    qrCode: qrDataUrl,
  });
});

authRouter.post(
  '/2fa/verify',
  requireAuth,
  requireVerifiedEmail,
  [body('code').trim().isLength({ min: 6, max: 6 })],
  async (req: Request, res: Response) => {
    const user = req.user as any;
    const { code } = req.body;

    const secret = (req.session as any).twoFactorSetupSecret;
    if (!secret) {
      res.status(400).json({ error: 'No 2FA setup in progress. Call /2fa/setup first.' });
      return;
    }

    const valid = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token: code,
      window: 2,
    });

    if (!valid) {
      res.status(400).json({ error: 'Invalid verification code.' });
      return;
    }

    // Generate backup codes
    const backupCodes = Array.from({ length: 8 }, () =>
      crypto.randomBytes(4).toString('hex').toUpperCase()
    );

    await prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorEnabled: true,
        twoFactorSecret: secret,
        twoFactorBackupCodes: backupCodes,
      },
    });

    delete (req.session as any).twoFactorSetupSecret;

    await auditFromRequest(req, AuditAction.TWO_FACTOR_ENABLED, { entityType: 'User', entityId: user.id });
    await notifySecurityChange(user.id, 'Two-factor authentication enabled', 'TOTP 2FA has been enabled on your account.');

    res.json({
      message: 'Two-factor authentication enabled.',
      backupCodes,
    });
  }
);

authRouter.post(
  '/2fa/disable',
  requireAuth,
  [body('password').notEmpty()],
  async (req: Request, res: Response) => {
    const user = req.user as any;
    const { password } = req.body;

    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    if (dbUser.passwordHash) {
      const valid = await verifyPassword(dbUser.passwordHash, password);
      if (!valid) {
        res.status(401).json({ error: 'Incorrect password.' });
        return;
      }
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorBackupCodes: [] },
    });

    await auditFromRequest(req, AuditAction.TWO_FACTOR_DISABLED, { entityType: 'User', entityId: user.id });
    await notifySecurityChange(user.id, 'Two-factor authentication disabled', '2FA has been disabled on your account.');

    res.json({ message: 'Two-factor authentication disabled.' });
  }
);
