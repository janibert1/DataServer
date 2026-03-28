import { Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { hash, verify } from '@node-rs/argon2';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { config } from '../config';
import { logger } from '../lib/logger';
import { UserStatus } from '@prisma/client';

// ─── Argon2 options ──────────────────────────────────────────

const ARGON2_OPTIONS = {
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
};

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return verify(hash, password, ARGON2_OPTIONS);
}

// ─── Passport local strategy ─────────────────────────────────

passport.use(
  new LocalStrategy({ usernameField: 'email', passReqToCallback: false }, async (email, password, done) => {
    try {
      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase().trim() },
      });

      if (!user || !user.passwordHash) {
        return done(null, false, { message: 'Invalid email or password.' });
      }

      if (user.status === UserStatus.DELETED) {
        return done(null, false, { message: 'Account not found.' });
      }

      if (user.status === UserStatus.SUSPENDED) {
        return done(null, false, { message: 'Account suspended. Please contact support.' });
      }

      const valid = await verifyPassword(user.passwordHash, password);
      if (!valid) {
        return done(null, false, { message: 'Invalid email or password.' });
      }

      return done(null, user);
    } catch (error) {
      logger.error('Local strategy error', { error });
      return done(error);
    }
  })
);

// ─── Passport Google strategy ────────────────────────────────

if (config.google.clientId && config.google.clientSecret) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: config.google.clientId,
        clientSecret: config.google.clientSecret,
        callbackURL: config.google.callbackUrl,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value?.toLowerCase();
          if (!email) {
            return done(null, false, { message: 'No email from Google.' });
          }

          let user = await prisma.user.findFirst({
            where: { OR: [{ googleId: profile.id }, { email }] },
          });

          if (user) {
            if (user.status === UserStatus.DELETED) {
              return done(null, false, { message: 'Account not found.' });
            }
            if (user.status === UserStatus.SUSPENDED) {
              return done(null, false, { message: 'Account suspended.' });
            }

            // Link Google if not already linked
            if (!user.googleId) {
              user = await prisma.user.update({
                where: { id: user.id },
                data: {
                  googleId: profile.id,
                  emailVerified: true,
                  avatarUrl: profile.photos?.[0]?.value ?? user.avatarUrl,
                },
              });
            }

            return done(null, user);
          }

          // New Google user — needs invitation code (handled in route)
          // Return profile info so route can handle invite check
          return done(null, false, {
            message: 'GOOGLE_NEW_USER',
            googleProfile: { id: profile.id, email, displayName: profile.displayName, avatarUrl: profile.photos?.[0]?.value },
          } as any);
        } catch (error) {
          logger.error('Google strategy error', { error });
          return done(error as Error);
        }
      }
    )
  );
}

// ─── Serialize / deserialize ─────────────────────────────────

passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        status: true,
        emailVerified: true,
        authProvider: true,
        avatarUrl: true,
        storageQuotaBytes: true,
        storageUsedBytes: true,
        twoFactorEnabled: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    if (!user || user.status === UserStatus.DELETED || user.status === UserStatus.SUSPENDED) {
      return done(null, false);
    }

    done(null, user);
  } catch (error) {
    done(error);
  }
});

// ─── API token auth ─────────────────────────────────────────

const USER_SELECT = {
  id: true,
  email: true,
  displayName: true,
  role: true,
  status: true,
  emailVerified: true,
  authProvider: true,
  avatarUrl: true,
  storageQuotaBytes: true,
  storageUsedBytes: true,
  twoFactorEnabled: true,
  lastLoginAt: true,
  createdAt: true,
};

export async function authenticateApiToken(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (req.user) return next();

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ds_')) return next();

  const token = authHeader.slice(7);
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  try {
    const apiToken = await prisma.apiToken.findUnique({
      where: { tokenHash },
      include: { user: { select: USER_SELECT } },
    });

    if (!apiToken || apiToken.revokedAt || (apiToken.expiresAt && apiToken.expiresAt < new Date())) {
      return next();
    }

    if (apiToken.user.status === UserStatus.DELETED || apiToken.user.status === UserStatus.SUSPENDED) {
      return next();
    }

    (req as any).user = apiToken.user;
    (req as any).apiTokenId = apiToken.id;

    // Fire-and-forget: update lastUsedAt
    prisma.apiToken.update({
      where: { id: apiToken.id },
      data: { lastUsedAt: new Date(), lastUsedIp: req.ip },
    }).catch(() => {});
  } catch (err) {
    logger.error('API token auth error', { error: (err as Error).message });
  }

  next();
}

// ─── Middleware ───────────────────────────────────────────────

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  const user = req.user as any;
  if (user.status === UserStatus.SUSPENDED) {
    res.status(403).json({ error: 'Account suspended.' });
    return;
  }
  next();
}

export function requireVerifiedEmail(req: Request, res: Response, next: NextFunction): void {
  const user = req.user as any;
  if (!user?.emailVerified) {
    res.status(403).json({ error: 'Email verification required.' });
    return;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = req.user as any;
  if (!user || user.role !== 'ADMIN') {
    res.status(403).json({ error: 'Admin access required.' });
    return;
  }
  next();
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  next();
}

export { passport };
