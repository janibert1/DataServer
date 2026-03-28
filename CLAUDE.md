# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DataServer is a self-hosted cloud storage platform (private Google Drive alternative). Invitation-only, multi-user, with file versioning, virus scanning, folder sharing, and an admin panel.

## Architecture

```
nginx:80 (frontend container)
  ├─ /api/*            → Express backend:4000
  ├─ /dataserver-files/* → MinIO:9000 (presigned URL proxy)
  └─ /*                → React SPA

Backend depends on: PostgreSQL:5432 (Prisma), Redis:6379 (sessions + BullMQ), MinIO:9000, ClamAV:3310
```

Three apps in one repo (not a monorepo — no shared workspace):
- **`backend/`** — Express.js REST API (TypeScript, Prisma ORM, BullMQ workers)
- **`frontend/`** — React SPA (TypeScript, Vite, Tailwind, Zustand, React Query)
- **`app/`** — iOS/Android companion (Expo/React Native, NativeWind, Expo Router)

## Development Commands

### Backend (`cd backend`)
```bash
npm run dev            # tsx watch (hot reload on :4000)
npm run build          # tsc → dist/
npm run seed           # Create admin account from env vars
npx prisma db push     # Apply schema changes to DB
npx prisma generate    # Regenerate Prisma client after schema edits
npx prisma studio      # Visual DB browser
```

### Frontend (`cd frontend`)
```bash
npm run dev            # Vite dev server on :5173, proxies /api → :4000
npm run build          # tsc && vite build
npm run lint           # ESLint
```

### Mobile App (`cd app`)
```bash
npx expo start         # Expo dev server
npx expo run:ios       # iOS build
npx expo run:android   # Android build
```

### Docker (full stack)
```bash
docker compose up -d --build
docker compose exec backend npx prisma db push
docker compose exec backend node dist/seed.js
docker compose logs -f backend        # Tail backend logs
```

## Key Architectural Patterns

**Authentication:** Passport.js with local (Argon2id) + Google OAuth2 strategies. Sessions stored in Redis with HttpOnly/Secure/SameSite cookies. TOTP 2FA with backup codes.

**File flow:** Upload via multer → ClamAV virus scan (BullMQ worker) → stored in MinIO with S3 keys. Downloads use AWS v4 presigned URLs (5-min expiry) proxied through nginx so browsers never hit MinIO directly.

**S3 client split:** Two S3 clients exist in `backend/src/lib/s3.ts` — one uses `S3_ENDPOINT` (internal Docker network), the other uses `S3_PUBLIC_URL` for generating presigned URLs with the correct external hostname.

**Folder sharing:** 5 permission levels (VIEWER → OWNER). Permissions inherit down the folder tree. Share invitations can be email-restricted.

**Background workers** (BullMQ in `backend/src/workers/`): preview generation (sharp → WebP thumbnails), virus scanning (ClamAV), trash cleanup (30-day auto-delete), notifications (email + in-app).

**Frontend state:** Zustand for auth state (`frontend/src/store/authStore.ts`), React Query for server state. Axios instance in `frontend/src/lib/axios.ts` with base URL config.

**Frontend routing:** React Router v6 with route guards — `RequireAuth`, `RequireAdmin`, `GuestOnly` wrappers in `App.tsx`.

## Database

Prisma schema at `backend/prisma/schema.prisma`. Key models: User, File, Folder, FolderShare, Invitation, AuditLog, Notification, FileVersion, ContentFlag.

Key enums: `SharePermission` (VIEWER, DOWNLOADER, CONTRIBUTOR, EDITOR, OWNER), `UserStatus` (PENDING_VERIFICATION, ACTIVE, SUSPENDED, DELETED), `InvitationType` (PLATFORM, FOLDER_SHARE).

## Backend Route Organization

Routes in `backend/src/routes/`: auth, files, folders, account, admin, shared, invitations, notifications. Business logic extracted into services (`backend/src/services/`): audit, invitation, notification, quota, sharing.

## Environment

See `.env.example` for all required variables. Key groups: database (DATABASE_URL), Redis (REDIS_URL), S3 (S3_ENDPOINT, S3_PUBLIC_URL, S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET), auth (SESSION_SECRET, Google OAuth creds), email (SMTP_*), security (CLAMAV_HOST).

## TypeScript Config

- Backend: ES2022 target, CommonJS output, strict mode
- Frontend: ES2020 target, ESNext modules, path alias `@/*` → `src/*`
- Mobile: Expo-managed tsconfig

## nginx

Config at `frontend/nginx.conf`. Handles SPA fallback, API reverse proxy, MinIO presigned URL proxy (`/dataserver-files/`), gzip, cache headers, 2GB upload limit.
