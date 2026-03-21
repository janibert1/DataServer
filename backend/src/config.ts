import dotenv from 'dotenv';
dotenv.config();

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optional(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

function optionalInt(key: string, defaultValue: number): number {
  const value = process.env[key];
  return value ? parseInt(value, 10) : defaultValue;
}

export const config = {
  nodeEnv: optional('NODE_ENV', 'development'),
  port: optionalInt('PORT', 4000),
  isDev: optional('NODE_ENV', 'development') !== 'production',

  frontendUrl: optional('FRONTEND_URL', 'http://localhost:5173'),
  cookieSecure: optional('COOKIE_SECURE', '') === 'true',

  database: {
    url: required('DATABASE_URL'),
  },

  redis: {
    url: optional('REDIS_URL', 'redis://localhost:6379'),
  },

  session: {
    secret: optional('SESSION_SECRET', 'dev-session-secret-change-me'),
    maxAgeMs: optionalInt('SESSION_MAX_AGE_MS', 86400000),
  },

  jwt: {
    secret: optional('JWT_SECRET', 'dev-jwt-secret-change-me'),
    downloadTokenExpirySeconds: optionalInt('DOWNLOAD_TOKEN_EXPIRY_SECONDS', 300),
  },

  google: {
    clientId: optional('GOOGLE_CLIENT_ID', ''),
    clientSecret: optional('GOOGLE_CLIENT_SECRET', ''),
    callbackUrl: optional('GOOGLE_CALLBACK_URL', 'http://localhost:4000/api/auth/google/callback'),
  },

  s3: {
    endpoint: optional('S3_ENDPOINT', 'http://localhost:9000'),
    publicUrl: optional('S3_PUBLIC_URL', ''),
    accessKey: optional('S3_ACCESS_KEY', 'minio_admin'),
    secretKey: optional('S3_SECRET_KEY', 'minio_secret_key'),
    bucket: optional('S3_BUCKET', 'dataserver-files'),
    region: optional('S3_REGION', 'us-east-1'),
    forcePathStyle: optional('S3_FORCE_PATH_STYLE', 'true') === 'true',
  },

  smtp: {
    host: optional('SMTP_HOST', 'localhost'),
    port: optionalInt('SMTP_PORT', 587),
    secure: optional('SMTP_SECURE', 'false') === 'true',
    user: optional('SMTP_USER', ''),
    pass: optional('SMTP_PASS', ''),
    from: optional('SMTP_FROM', 'DataServer <noreply@dataserver.app>'),
  },

  clamav: {
    host: optional('CLAMAV_HOST', 'localhost'),
    port: optionalInt('CLAMAV_PORT', 3310),
  },

  storage: {
    defaultQuotaBytes: BigInt(optional('DEFAULT_QUOTA_BYTES', '10737418240')),
    maxFileSizeBytes: BigInt(optional('MAX_FILE_SIZE_BYTES', '2147483648')),
  },

  rateLimit: {
    auth: {
      max: optionalInt('RATE_LIMIT_AUTH_MAX', 10),
      windowMs: optionalInt('RATE_LIMIT_AUTH_WINDOW_MS', 900000),
    },
    api: {
      max: optionalInt('RATE_LIMIT_API_MAX', 200),
      windowMs: optionalInt('RATE_LIMIT_API_WINDOW_MS', 60000),
    },
    upload: {
      max: optionalInt('RATE_LIMIT_UPLOAD_MAX', 20),
      windowMs: optionalInt('RATE_LIMIT_UPLOAD_WINDOW_MS', 3600000),
    },
  },
} as const;
