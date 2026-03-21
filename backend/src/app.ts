import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import session from 'express-session';
import RedisStore from 'connect-redis';
import cookieParser from 'cookie-parser';
import { passport } from './middleware/auth';
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
  app.use(
    cors({
      origin: config.frontendUrl,
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
        sameSite: config.cookieSecure ? 'strict' : 'lax',
        maxAge: config.session.maxAgeMs,
      },
    })
  );

  // ─── Passport ────────────────────────────────────────────────
  app.use(passport.initialize());
  app.use(passport.session());

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
