import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import session from 'express-session';
import RedisStore from 'connect-redis';
import cookieParser from 'cookie-parser';
import { passport, authenticateApiToken } from './middleware/auth';
import { redis } from './lib/redis';
import { config } from './config';
import { logger } from './lib/logger';
import { apiRateLimiter } from './middleware/rateLimiter';
import { router } from './routes';

export function createApp() {
  const app = express();

  // Trust Cloudflare / reverse proxy — required for correct IP logging and
  // secure cookies when sitting behind cloudflared or any other proxy.
  app.set('trust proxy', 1);

  // ─── Security headers ───────────────────────────────────────
  app.use(
    helmet({
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:', '*.googleapis.com', '*.gstatic.com'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'", 'blob:'],
          frameSrc: ["'self'"],
        },
      },
    })
  );

  // ─── CORS ────────────────────────────────────────────────────
  // FRONTEND_URL can be a comma-separated list -- lets the Expo dev server
  // (react-native-web, a different origin/port than the deployed SPA) talk
  // to this same backend during mobile-app development, without opening
  // CORS up wide. Single-origin deployments are unaffected either way.
  const allowedOrigins = config.frontendUrl.split(',').map((o) => o.trim()).filter(Boolean);
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`Origin ${origin} not allowed by CORS`));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
    })
  );

  // ─── Body parsing ────────────────────────────────────────────
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());
  app.use(compression());

  // ─── Logging ─────────────────────────────────────────────────
  if (config.isDev) {
    app.use(morgan('dev'));
  } else {
    app.use(
      morgan('combined', {
        stream: { write: (msg) => logger.info(msg.trim()) },
      })
    );
  }

  // ─── Sessions ────────────────────────────────────────────────
  const redisStore = new RedisStore({
    client: redis as any,
    prefix: 'sess:',
  });

  app.use(
    session({
      store: redisStore,
      secret: config.session.secret,
      resave: false,
      saveUninitialized: false,
      name: 'ds.sid',
      cookie: {
        httpOnly: true,
        secure: config.cookieSecure,
        // 'none' requires Secure, so this can only ever be 'none' when
        // cookieSecure is already true -- otherwise browsers just drop the
        // cookie outright, so 'lax' stays the (best-effort, same-origin-only)
        // fallback for a plain-HTTP deployment. Any real deployment of this
        // app's web build (react-native-web) or a native app's web-mode dev
        // server is, by definition, a different origin than the API -- 'lax'
        // cookies are simply never sent on cross-site fetch()/XHR at all
        // (only top-level navigations), so 'lax' here silently breaks every
        // API call for any such client while looking like a normal 401.
        // CORS's origin allowlist (see below) is what actually gates who's
        // trusted, same as before -- this only changes whether an already-
        // allowed cross-origin client's cookie gets sent.
        sameSite: config.cookieSecure ? 'none' : 'lax',
        maxAge: config.session.maxAgeMs,
      },
    })
  );

  // ─── Passport ────────────────────────────────────────────────
  app.use(passport.initialize());
  app.use(passport.session());
  app.use(authenticateApiToken);

  // ─── Rate limiting ───────────────────────────────────────────
  app.use('/api', apiRateLimiter);

  // ─── Trust proxy ────────────────────────────────────────────
  app.set('trust proxy', 1);

  // ─── Health check ────────────────────────────────────────────
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ─── Routes ──────────────────────────────────────────────────
  app.use('/api', router);

  // ─── 404 handler ────────────────────────────────────────────
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found.' });
  });

  // ─── Error handler ───────────────────────────────────────────
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error('Unhandled error', { error: err.message, stack: err.stack });

    if (err.code === 'EBADCSRFTOKEN') {
      res.status(403).json({ error: 'Invalid CSRF token.' });
      return;
    }

    if (err.type === 'entity.too.large') {
      res.status(413).json({ error: 'Request too large.' });
      return;
    }

    const status = err.status ?? err.statusCode ?? 500;
    const message =
      config.isDev ? err.message : status < 500 ? err.message : 'Internal server error.';

    res.status(status).json({ error: message });
  });

  return app;
}
