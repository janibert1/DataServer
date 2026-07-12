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

## Agent Testing Loop (Builder ↔ Tester Handoff)

On 2026-07-11, Jan ran two Claude agents against this app concurrently and unsupervised for several hours: a **builder** (this kind of agent — shell/SSH access to klipperender3, deploys fixes) and a **tester** (browser/computer-use access to the live site at data.jdries.nl, no shell access, can't deploy anything). They found and fixed a real batch of bugs this way (zip-download deadlock, video container corruption, DB pool exhaustion, several preview gaps — see git log around `be254ea`..`c03bd00` for the full trail). If Jan asks for another round of this, or you find yourself paired with a similar tester agent, here's the mechanism that made it work:

**The mailbox:** a plain folder in DataServer itself (an `_Agent-Handoff` folder in the account's My Drive, not a special feature — any shared folder works) that both agents can read/write via the normal Files API. Neither agent has direct access to the other's environment; markdown files dropped in this folder are the only communication channel.

**Protocol:**
- Each agent writes a numbered markdown file: `reply_from_builder_N.md` / `reply_from_tester_N.md`, one per turn, incrementing — never edit or delete a previous reply, always add the next number.
- Each reply should state clearly: what was read/tested since the last reply, what changed as a result (fixed / confirmed working / confirmed not-a-bug / still open), and what's expected from the other side next.
- Poll for new files by listing the folder (`GET /api/files?folderId=<id>`) and looking for anything that isn't your own `reply_from_<you>` prefix — skip your own files rather than tracking a mutable "seen" list, it's simpler and avoids races.
- Upload via `POST /api/files/upload/` (note the trailing slash — the bare `/api/files/upload` 301-redirects and multipart bodies don't survive that) with the file under the multipart field name `files` (not `file` — the route is `uploadMiddleware.array('files', 20)`), plus a `folderId` field.
- Download a reply via `GET /api/files/:id/download` (returns a short-lived signed URL) then fetch that URL directly.
- Auth is a normal DataServer API bearer token for whatever account owns the handoff folder — get one via the login endpoint or an existing session token; nothing special about it.

**Escalating to Jan:** the builder is the one with a PushNotification/AskUserQuestion channel to Jan; the tester doesn't have one. Route any real product decision (scope questions, tradeoffs, "should this behave differently") through the builder rather than having the tester guess or the builder guess on the tester's behalf.

**Reasonable cadence:** treat ~1 hour with no new file from either side as worth checking in on — the tester in this run was itself on a scheduled ~30-min job, not a continuously running process, so gaps are normal and not automatically a stall.

**What actually worked well:** the tester doing byte-level verification instead of trusting `canPlayType`/error events alone was what actually cracked the video bug (two rounds of wrong theories — CSP, signing, test-tool limitation — got ruled out by direct evidence, not guesswork) — control tests (loading a known-good external file to isolate "my tool is broken" from "the app is broken") were the single most useful technique either side used.
