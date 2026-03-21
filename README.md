# DataServer

A production-ready, **invitation-only** cloud storage platform built with security as a first-class concern. Think Google Drive — but self-hosted, private, and fully under your control.

![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.4-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Quick Start (Docker — Recommended)](#quick-start-docker--recommended)
- [Local Development Setup](#local-development-setup)
- [Environment Variables Reference](#environment-variables-reference)
- [First Login & Admin Setup](#first-login--admin-setup)
- [Invitation System](#invitation-system)
- [Permission Levels](#permission-levels)
- [Exposing to the Internet](#exposing-to-the-internet)
  - [Cloudflare Tunnel](#cloudflare-tunnel)
  - [Tailscale](#tailscale)
- [Security Overview](#security-overview)
- [Background Workers](#background-workers)
- [API Reference](#api-reference)
- [Project Structure](#project-structure)
- [Troubleshooting](#troubleshooting)

---

## Features

| Category | What's included |
|---|---|
| **Access control** | Invitation-only registration; admins issue platform codes; users share folders via invite links |
| **Authentication** | Email/password + Google OAuth2; email verification; optional TOTP 2FA; backup codes |
| **File management** | Upload (drag-and-drop or button), rename, move, trash, restore, permanent delete |
| **Folder sharing** | 5 granular permission levels; permission inheritance through folder tree |
| **File previews** | Images, PDFs, plain text, audio streaming, video streaming — all in-browser |
| **File versioning** | Previous versions retained and restorable |
| **Admin panel** | User management, quota control, invitation management, audit logs, content moderation, platform policy |
| **Security** | Argon2id passwords, signed download URLs, ClamAV virus scanning, MIME validation, rate limiting |
| **Quotas** | Per-user configurable storage quotas (default 10 GB, max file 2 GB) |
| **Notifications** | In-app + email notifications for shares, security events, storage warnings |
| **Audit logging** | Immutable log of every sensitive action with user, IP, and timestamp |
| **Background jobs** | Thumbnail generation, virus scanning, 30-day trash cleanup — all async via BullMQ |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              DataServer                                  │
│                                                                         │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────────┐  │
│  │   Frontend   │    │   Backend    │    │     Object Storage       │  │
│  │              │    │              │    │                          │  │
│  │  React 18    │───▶│  Express.js  │───▶│  MinIO (S3-compatible)  │  │
│  │  TypeScript  │    │  TypeScript  │    │  AES-256 encryption      │  │
│  │  Vite        │    │  Passport.js │    │  Pre-signed URLs         │  │
│  │  Tailwind    │    │  Prisma ORM  │    └──────────────────────────┘  │
│  │  TanStack Q  │    │              │                                   │
│  └──────────────┘    └──────┬───────┘    ┌──────────────────────────┐  │
│                             │            │     Background Workers   │  │
│  ┌──────────────┐           │            │                          │  │
│  │  PostgreSQL  │◀──────────┤            │  BullMQ + Redis          │  │
│  │  (Prisma)    │           │            │  • Preview generation     │  │
│  └──────────────┘           │            │  • ClamAV virus scan     │  │
│                             │            │  • 30-day trash cleanup  │  │
│  ┌──────────────┐           │            │  • Email notifications   │  │
│  │    Redis     │◀──────────┘            └──────────────────────────┘  │
│  │  Sessions    │                                                       │
│  │  BullMQ      │                                                       │
│  └──────────────┘                                                       │
└─────────────────────────────────────────────────────────────────────────┘
```

**Request flow:**
1. Browser hits the nginx frontend container on port 80/443
2. Static React app is served; API calls go to `/api/*`
3. nginx proxies `/api/*` → Express backend on port 4000
4. Backend reads/writes PostgreSQL via Prisma, uses Redis for sessions and job queues
5. Files are streamed directly to MinIO; download URLs are pre-signed (never expose raw keys)
6. Background workers handle thumbnail generation, virus scanning, and cleanup asynchronously

---

## Prerequisites

### For Docker deployment (recommended)

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows/Mac) or Docker Engine + Compose plugin (Linux)
- Git

### For local development

- Node.js 20 or later — [download](https://nodejs.org/)
- npm 10+
- Docker (for PostgreSQL, Redis, MinIO, ClamAV)
- Git

### Optional but recommended

- A **Google Cloud** project with OAuth 2.0 credentials (for Google login)
- An **SMTP email provider** (Gmail app password, Resend, Postmark, Mailgun, etc.)

---

## Quick Start (Docker — Recommended)

This is the fastest way to get a fully working instance running.

### Step 1 — Clone the repository

```bash
git clone https://github.com/janibert1/DataServer.git
cd DataServer
```

### Step 2 — Create your environment file

```bash
cp .env.example .env
```

Open `.env` in a text editor and fill in the **required** values (marked below in the [Environment Variables](#environment-variables-reference) section). At minimum you need:

```env
# Generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
SESSION_SECRET=your_64_char_random_hex_string_here
JWT_SECRET=another_64_char_random_hex_string_here

# Your first admin account
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=YourSecurePassword123!
ADMIN_DISPLAY_NAME=Admin
```

Everything else has working defaults for local use.

### Step 3 — Build and start all services

```bash
docker compose up -d --build
```

This starts:
- PostgreSQL 16
- Redis 7
- MinIO (object storage)
- ClamAV (virus scanner — takes 2–3 minutes to download virus definitions on first start)
- Express backend on port 4000
- React frontend on port 80

### Step 4 — Run database migrations

```bash
docker compose exec backend npx prisma migrate deploy
```

### Step 5 — Seed the database (creates admin + first invite code)

```bash
docker compose exec backend npm run seed
```

The seed script prints:
```
✅ Admin user created: admin@example.com
🎉 Initial invitation code: XXXX-XXXX-XXXX  (10 uses)
📋 Default storage policy created
```

**Save the invitation code** — you'll need it to register the first regular user account.

### Step 6 — Open the app

Visit [http://localhost](http://localhost) in your browser.

Log in with the admin credentials you set in `.env`.

---

## Local Development Setup

Use this when you want to make code changes and see them live.

### Step 1 — Start infrastructure only

```bash
docker compose up -d postgres redis minio clamav
```

### Step 2 — Set up the backend

```bash
cd backend
npm install
```

Copy and configure environment:

```bash
cp ../.env.example ../.env
# Edit .env — see Environment Variables section
```

Run migrations and seed:

```bash
npm run prisma:migrate:dev   # creates tables, generates Prisma client
npm run seed                 # creates admin user + first invite code
```

Start the dev server (hot-reload via tsx):

```bash
npm run dev
# Backend running at http://localhost:4000
```

### Step 3 — Set up the frontend

Open a new terminal:

```bash
cd frontend
npm install
npm run dev
# Frontend running at http://localhost:5173
# API calls proxy to http://localhost:4000 automatically (see vite.config.ts)
```

### Step 4 — Open the app

Visit [http://localhost:5173](http://localhost:5173).

---

## Environment Variables Reference

Copy `.env.example` to `.env` and fill in the values below. Lines marked **required** will prevent startup if missing.

### Core

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | | `production` | Set to `development` for local dev |
| `PORT` | | `4000` | Backend HTTP port |
| `SESSION_SECRET` | **Yes** | — | Random 64-byte hex string for session signing. Generate: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `JWT_SECRET` | **Yes** | — | Random 64-byte hex string for JWT tokens |

### Database

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | **Yes** | — | Full PostgreSQL connection string. Example: `postgresql://user:pass@localhost:5432/dataserver` |
| `POSTGRES_USER` | | `dataserver` | Used by the postgres Docker service |
| `POSTGRES_PASSWORD` | | `dataserver_secret` | Used by the postgres Docker service — change this! |
| `POSTGRES_DB` | | `dataserver` | Used by the postgres Docker service |

### Redis

| Variable | Required | Default | Description |
|---|---|---|---|
| `REDIS_URL` | **Yes** | — | Redis connection string. Example: `redis://:password@localhost:6379` |
| `REDIS_PASSWORD` | | `redis_secret` | Used by the Redis Docker service — change this! |

### Object Storage (MinIO / S3)

| Variable | Required | Default | Description |
|---|---|---|---|
| `S3_ENDPOINT` | **Yes** | — | MinIO URL. Docker: `http://minio:9000`. External S3: leave blank |
| `S3_REGION` | | `us-east-1` | AWS region (or any string for MinIO) |
| `S3_BUCKET` | | `dataserver` | Bucket name (created automatically on startup) |
| `S3_ACCESS_KEY` | **Yes** | — | MinIO root user or AWS access key |
| `S3_SECRET_KEY` | **Yes** | — | MinIO root password or AWS secret key |
| `MINIO_ROOT_USER` | | `minio_admin` | Used by the MinIO Docker service |
| `MINIO_ROOT_PASSWORD` | | `minio_secret_key` | Used by the MinIO Docker service — change this! |

### Authentication

| Variable | Required | Default | Description |
|---|---|---|---|
| `FRONTEND_URL` | **Yes** | — | Full URL of the frontend, e.g. `https://drive.example.com`. Used for CORS and email links |
| `GOOGLE_CLIENT_ID` | | — | From [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → OAuth 2.0 Client IDs |
| `GOOGLE_CLIENT_SECRET` | | — | Same as above |
| `GOOGLE_CALLBACK_URL` | | — | Must match exactly what you set in Google Console. Example: `https://drive.example.com/api/auth/google/callback` |

> **Google OAuth setup:**
> 1. Go to [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials
> 2. Create OAuth 2.0 Client ID → Web application
> 3. Add `http://localhost:5173` to Authorised JavaScript origins (dev)
> 4. Add `http://localhost:4000/api/auth/google/callback` to Authorised redirect URIs (dev)
> 5. For production, replace with your real domain

### Email (SMTP)

| Variable | Required | Default | Description |
|---|---|---|---|
| `SMTP_HOST` | | — | SMTP server hostname |
| `SMTP_PORT` | | `587` | SMTP port (587 for TLS, 465 for SSL) |
| `SMTP_USER` | | — | SMTP username / email address |
| `SMTP_PASS` | | — | SMTP password or app password |
| `SMTP_FROM` | | — | From address, e.g. `"DataServer" <noreply@example.com>` |

> **Gmail quick setup:**
> 1. Enable 2FA on your Google account
> 2. Go to myaccount.google.com → Security → App Passwords
> 3. Generate an app password for "Mail"
> 4. Use `smtp.gmail.com`, port `587`, your Gmail address, and the app password

> If SMTP is not configured, email sending is skipped silently (no crashes). Users just won't receive verification/reset emails.

### Admin Bootstrap

| Variable | Required | Default | Description |
|---|---|---|---|
| `ADMIN_EMAIL` | **Yes** | — | Email for the first admin account created by `npm run seed` |
| `ADMIN_PASSWORD` | **Yes** | — | Password for the first admin account |
| `ADMIN_DISPLAY_NAME` | | `Admin` | Display name for the first admin account |

### Storage Limits

| Variable | Required | Default | Description |
|---|---|---|---|
| `DEFAULT_QUOTA_BYTES` | | `10737418240` | Default user quota (10 GB) |
| `MAX_FILE_SIZE_BYTES` | | `2147483648` | Max upload size per file (2 GB) |

### ClamAV

| Variable | Required | Default | Description |
|---|---|---|---|
| `CLAMAV_HOST` | | `clamav` | ClamAV daemon hostname (Docker service name) |
| `CLAMAV_PORT` | | `3310` | ClamAV daemon port |

### Cloudflare Tunnel (optional)

| Variable | Required | Default | Description |
|---|---|---|---|
| `CLOUDFLARE_TUNNEL_TOKEN` | | — | Token from Cloudflare Zero Trust dashboard |

### Tailscale (optional)

| Variable | Required | Default | Description |
|---|---|---|---|
| `TAILSCALE_AUTHKEY` | | — | Auth key from tailscale.com/admin/settings/keys |

---

## First Login & Admin Setup

After running `npm run seed` (or `docker compose exec backend npm run seed`):

1. **Log in** at your app URL with the email/password you set in `.env`
2. **Get the invitation code** from the seed output — it's valid for 10 uses
3. **Register a test user** by logging out and visiting `/register`, entering the code
4. **Access the Admin Panel** by clicking your avatar → Admin Panel (top-right)

### Admin Panel sections

| Section | URL | What you can do |
|---|---|---|
| Users | `/admin/users` | Search users, suspend/restore, adjust quotas, change roles, delete |
| Invitations | `/admin/invitations` | Create platform invitations, view/revoke all codes |
| Audit Logs | `/admin/audit` | Browse all actions with filters (user, action type, date range), export CSV |
| Storage | `/admin/storage` | See total storage used, per-user breakdown, recalculate stats |
| Content Flags | `/admin/flags` | Review user-reported files, quarantine or dismiss |
| Platform Policy | `/admin/policy` | Set global defaults: quota, max file size, blocked extensions, etc. |

### Creating a new platform invitation

1. Go to Admin Panel → Invitations
2. Click **"Create invitation"**
3. Optionally restrict to a specific email, set max uses and expiry date
4. Share the generated `XXXX-XXXX-XXXX` code with the intended user
5. They visit `/register`, enter the code, and complete sign-up

---

## Invitation System

DataServer uses **two distinct types** of invitation codes:

### Platform Invitations

- **Created by:** Admins only
- **Purpose:** Allow a new person to create an account on the platform
- **Format:** `XXXX-XXXX-XXXX` (uppercase alphanumeric, no ambiguous characters like 0/O/1/I)
- **Options:** expiry date, max uses, target email restriction, optional note

### Folder-Share Invitations

- **Created by:** Any folder owner (for folders they own and have marked as shareable)
- **Purpose:** Grant an existing or new user access to a specific shared folder
- **Flow:**
  1. Owner opens the Share modal → generates an invite link with an expiry
  2. Recipient visits `/accept-invite?code=XXXX-XXXX-XXXX`
  3. If not logged in, they are redirected to login/register first
  4. On acceptance, the share is created and they land in the folder

---

## Permission Levels

Permissions apply per-folder and are inherited by all subfolders.

| Level | View files | Download | Upload | Edit / Rename / Move | Delete | Reshare |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Viewer** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Downloader** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Contributor** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Editor** | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Owner** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

**Inheritance:** If you share `/Documents` with someone as `Editor`, they automatically have `Editor` access to `/Documents/Reports` and all nested subfolders — unless you explicitly override it.

---

## Exposing to the Internet

By default the app runs on `localhost`. To access it remotely, use one of the options below.

### Cloudflare Tunnel

Best for: **public-facing deployment** with a custom domain.

**1. Install cloudflared on your server:**

```bash
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb
```

**2. Authenticate and create a tunnel:**

```bash
cloudflared tunnel login
cloudflared tunnel create dataserver
```

**3. Add your tunnel token to `.env`:**

In the Cloudflare Zero Trust dashboard → Networks → Tunnels → your tunnel → Install connector → copy the `--token` value.

```env
CLOUDFLARE_TUNNEL_TOKEN=eyJhIjoiMTIz...
```

**4. Configure the public hostname:**

In Cloudflare Zero Trust → Networks → Tunnels → Configure → Public Hostnames:

| Subdomain | Domain | Type | URL |
|---|---|---|---|
| `drive` | `yourdomain.com` | HTTP | `frontend:80` |

**5. Update `.env` with your domain:**

```env
FRONTEND_URL=https://drive.yourdomain.com
```

**6. Start:**

```bash
docker compose up -d --build
```

The `cloudflared` container in docker-compose.yml will connect automatically. Your app is live at `https://drive.yourdomain.com` with automatic HTTPS.

**7. Lock down direct port access (recommended):**

Edit `docker-compose.yml` — change the frontend `ports:` to `expose:` so nothing is reachable except through the tunnel:

```yaml
frontend:
  expose:
    - "80"   # was: ports: ["80:80"]
```

---

### Tailscale

Best for: **private team/homelab access** — no public exposure needed.

#### Option A — Install on host (simplest)

```bash
# On the server running Docker
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

Your server gets a stable Tailscale IP and hostname (e.g. `my-server.tail1234.ts.net`). Any device on your Tailnet can reach the app at:

```
http://my-server.tail1234.ts.net     # port 80 (frontend)
```

No other config needed.

#### Option B — Docker sidecar (already in docker-compose.yml)

**1. Generate a Tailscale auth key:**

Go to [tailscale.com/admin/settings/keys](https://login.tailscale.com/admin/settings/keys) → Generate auth key. Keep **Reusable** enabled if you want it to survive container restarts.

**2. Add to `.env`:**

```env
TAILSCALE_AUTHKEY=tskey-auth-xxxxxxxxxxxxx
```

**3. Update `FRONTEND_URL`:**

```env
FRONTEND_URL=https://dataserver.tail1234.ts.net
```

**4. Start:**

```bash
docker compose up -d --build
docker compose logs tailscale   # should show "Tailscale is up"
```

Your Tailscale node `dataserver` appears in [tailscale.com/admin/machines](https://login.tailscale.com/admin/machines) and is reachable from any device on your Tailnet.

#### Tailscale Funnel (public access via Tailscale)

If you want public internet access through Tailscale instead of Cloudflare:

```bash
sudo tailscale funnel 80
```

Or in `tailscale/serve.json`, add `"AllowFunnel": true` to the handler.

---

## Security Overview

| Mechanism | Implementation |
|---|---|
| **Password hashing** | Argon2id — memory: 65536 KB, iterations: 3, parallelism: 4 |
| **Session security** | HttpOnly + Secure + SameSite=Strict cookies; Redis-backed; DB-tracked for revocation |
| **Rate limiting** | 10 auth attempts per 15 min; 200 API calls per min per IP |
| **Brute-force protection** | Exponential backoff tracking in Redis |
| **Virus scanning** | Every uploaded file is scanned via ClamAV INSTREAM protocol before activation |
| **MIME validation** | `file-type` library reads file magic bytes — extension alone is not trusted |
| **Blocked extensions** | Configurable list (`.exe`, `.bat`, `.sh`, etc.) rejected at upload time |
| **Download URLs** | Time-limited pre-signed S3 URLs (5 min TTL) — raw storage keys never exposed |
| **Upload isolation** | Files never executed on the server; stored → scanned → activated |
| **Path traversal** | `sanitize-filename` applied to all user-provided file/folder names |
| **Audit logging** | Every login, upload, share, admin action logged with user ID, IP, user agent |
| **Email verification** | Required before accessing drive features |
| **2FA** | Optional TOTP (Google Authenticator, Authy, etc.) with backup codes |
| **Server-side encryption** | MinIO/S3 AES-256 SSE applied to all stored objects |
| **Trust proxy** | Configured for correct client IP logging behind Cloudflare/Tailscale |

### Recommended hardening for production

1. **Change all default passwords** in `.env` before first start — especially `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `MINIO_ROOT_PASSWORD`
2. **Use strong secrets** — `SESSION_SECRET` and `JWT_SECRET` must be 64+ random bytes
3. **Expose no ports directly** — route all traffic through Cloudflare Tunnel or Tailscale
4. **Set up SMTP** — without it, users cannot verify their email or reset passwords
5. **Monitor ClamAV startup** — `docker compose logs clamav` — wait for "Listening daemon" before testing uploads
6. **Back up your volumes** — `postgres_data`, `redis_data`, `minio_data` contain all your data

---

## Background Workers

DataServer runs four background workers via [BullMQ](https://bullmq.io/):

### Preview Worker
- **Trigger:** Immediately after a file is successfully uploaded
- **Action:** Uses `sharp` to generate a 400px-wide WebP thumbnail for image files
- **Result:** Thumbnail stored in MinIO at `thumbnails/<fileId>.webp`; file status set to `ACTIVE`

### Virus Scan Worker
- **Trigger:** Immediately after upload (alongside preview generation)
- **Action:** Streams file from MinIO to ClamAV via the INSTREAM TCP protocol
- **Result:** `isVirusScanned = true`; `virusScanResult = "CLEAN" | "INFECTED"`. Infected files are quarantined (status set to `DELETED`) and flagged for admin review

### Trash Cleanup Worker
- **Trigger:** Daily at 2:00 AM UTC (cron schedule)
- **Action:** Finds all files trashed more than 30 days ago; deletes them from MinIO and the database; decrements the owner's used storage quota
- **Also cleans up:** Expired password reset tokens and stale pending invitations

### Notification Worker
- **Trigger:** Any action that generates a notification (share, security event, storage warning)
- **Action:** Sends email via your configured SMTP provider using branded HTML templates
- **Types:** Email verification, password reset, folder share notification, storage warning (at 80% and 95% quota)

---

## API Reference

All endpoints are prefixed with `/api`. Authentication is via session cookie (set on login).

### Authentication

```
POST   /api/auth/register              Register with a platform invitation code
POST   /api/auth/login                 Email + password login
POST   /api/auth/logout                Destroy session
GET    /api/auth/me                    Get current authenticated user
GET    /api/auth/google                Initiate Google OAuth2 flow
GET    /api/auth/google/callback       Google OAuth2 callback
POST   /api/auth/google/complete-registration  Complete Google sign-up with invite code
POST   /api/auth/verify-email          Verify email with token from email link
POST   /api/auth/resend-verification   Resend verification email
POST   /api/auth/forgot-password       Request password reset email
POST   /api/auth/reset-password        Complete password reset with token
POST   /api/auth/change-password       Change password (requires current password)
GET    /api/auth/2fa/setup             Get TOTP secret and QR code
POST   /api/auth/2fa/verify            Confirm TOTP code to enable 2FA (returns backup codes)
POST   /api/auth/2fa/disable           Disable 2FA (requires current TOTP code)
```

### Files

```
GET    /api/files                      List files (query: search, folderId, sort, page)
GET    /api/files/recent               Files accessed/modified in last 7 days
GET    /api/files/starred              Starred files
GET    /api/files/trash                Trashed files
POST   /api/files/upload               Upload one or more files (multipart/form-data)
POST   /api/files/empty-trash          Permanently delete all trashed files
GET    /api/files/:id                  Get file metadata
GET    /api/files/:id/download         Get signed download URL
GET    /api/files/:id/preview          Get signed preview URL
GET    /api/files/:id/versions         List previous versions
PATCH  /api/files/:id                  Rename file
PUT    /api/files/:id/move             Move file to different folder
POST   /api/files/:id/trash            Move to trash
POST   /api/files/:id/restore          Restore from trash
DELETE /api/files/:id                  Permanently delete
POST   /api/files/:id/star             Toggle star
POST   /api/files/:id/flag             Report file to admins
```

### Folders

```
GET    /api/folders                    List folders (query: parentId, search, starred)
GET    /api/folders/starred            Starred folders
POST   /api/folders                    Create folder
GET    /api/folders/:id                Get folder metadata
GET    /api/folders/:id/contents       List folder contents (files + subfolders)
PATCH  /api/folders/:id                Rename folder
PUT    /api/folders/:id/move           Move folder
POST   /api/folders/:id/trash          Move to trash
POST   /api/folders/:id/restore        Restore from trash
POST   /api/folders/:id/star           Toggle star
GET    /api/folders/:id/share-info     Get current shares for folder
POST   /api/folders/:id/share          Add a user to folder (by email + permission)
PATCH  /api/folders/:id/share/:shareId Update a share's permission
DELETE /api/folders/:id/share/:shareId Revoke a share
PATCH  /api/folders/:id/shareable      Toggle whether folder can have share invitations
```

### Sharing

```
GET    /api/shared/with-me             Folders others have shared with me
GET    /api/shared/by-me               Folders I have shared with others
GET    /api/shared/folder/:id/contents Browse shared folder contents
```

### Invitations

```
GET    /api/invitations                List my created folder-share invitations
POST   /api/invitations                Create a folder-share invitation (owner only)
POST   /api/invitations/validate       Validate a code without consuming it
POST   /api/invitations/accept         Accept a folder-share invitation
DELETE /api/invitations/:id            Revoke an invitation I created
```

### Account

```
GET    /api/account/profile            Get profile (email, displayName, avatarUrl, etc.)
PATCH  /api/account/profile            Update display name / avatar URL
GET    /api/account/storage            Storage usage stats
GET    /api/account/sessions           Active sessions list
DELETE /api/account/sessions           Revoke all sessions except current
DELETE /api/account/sessions/:id       Revoke a specific session
GET    /api/account/security-events    Recent security audit events (logins, 2FA, etc.)
DELETE /api/account                    Delete account permanently
```

### Notifications

```
GET    /api/notifications              Get notifications (paginated)
PATCH  /api/notifications/:id/read     Mark notification as read
PATCH  /api/notifications/read-all     Mark all as read
```

### Admin (requires ADMIN role)

```
GET    /api/admin/users                List all users (search, filter by status/role)
PATCH  /api/admin/users/:id            Manage user: suspend | restore | delete | setQuota | setRole
GET    /api/admin/invitations          List all invitations (all types, all users)
POST   /api/admin/invitations          Create a platform invitation
DELETE /api/admin/invitations/:id      Revoke any invitation
GET    /api/admin/audit-logs           Browse audit log (filter by user, action, date)
GET    /api/admin/storage-stats        Platform-wide storage statistics
POST   /api/admin/storage-stats/recalculate  Recalculate all user storage totals
GET    /api/admin/flags                List content flags (filter by status)
PATCH  /api/admin/flags/:id            Review a flag (dismiss / quarantine)
GET    /api/admin/policy               Get platform policy
PATCH  /api/admin/policy               Update platform policy
```

---

## Project Structure

```
DataServer/
├── docker-compose.yml          # Orchestrates all services
├── .env.example                # Template for all environment variables
├── .gitignore
├── README.md
│
├── backend/
│   ├── Dockerfile              # Multi-stage production image
│   ├── package.json
│   ├── tsconfig.json
│   ├── prisma/
│   │   └── schema.prisma       # Full database schema
│   └── src/
│       ├── index.ts            # Entrypoint — starts server + workers
│       ├── app.ts              # Express app factory
│       ├── config.ts           # Centralised config with validation
│       ├── seed.ts             # Admin bootstrap script
│       ├── lib/
│       │   ├── prisma.ts       # Prisma client singleton
│       │   ├── redis.ts        # ioredis singleton
│       │   ├── s3.ts           # MinIO/S3 client + helper functions
│       │   ├── mailer.ts       # Nodemailer + HTML email templates
│       │   └── logger.ts       # Winston logger with daily rotation
│       ├── middleware/
│       │   ├── auth.ts         # Passport strategies, requireAuth guards
│       │   ├── rateLimiter.ts  # express-rate-limit configuration
│       │   └── upload.ts       # Multer config + file validation
│       ├── services/
│       │   ├── auditService.ts         # Audit log helpers
│       │   ├── invitationService.ts    # Code generation + validation
│       │   ├── sharingService.ts       # Permission checking + inheritance
│       │   ├── quotaService.ts         # Storage quota enforcement
│       │   └── notificationService.ts  # In-app notification creation
│       ├── routes/
│       │   ├── auth.ts         # All auth endpoints
│       │   ├── files.ts        # File CRUD + upload
│       │   ├── folders.ts      # Folder CRUD + sharing
│       │   ├── shared.ts       # Shared-with-me / shared-by-me
│       │   ├── invitations.ts  # Invitation management
│       │   ├── account.ts      # Profile, sessions, security events
│       │   ├── notifications.ts
│       │   └── admin.ts        # Admin-only routes
│       └── workers/
│           ├── index.ts             # startWorkers() / stopWorkers()
│           ├── queues.ts            # BullMQ Queue instances
│           ├── previewWorker.ts     # Sharp thumbnail generation
│           ├── virusScanWorker.ts   # ClamAV INSTREAM scanning
│           ├── trashCleanupWorker.ts # 30-day purge + token cleanup
│           ├── notificationWorker.ts # Email dispatch
│           └── scheduledJobs.ts     # Cron job registration
│
├── frontend/
│   ├── Dockerfile              # Build (Vite) + serve (nginx) stages
│   ├── nginx.conf              # SPA routing + caching + security headers
│   ├── package.json
│   ├── vite.config.ts          # Dev proxy to backend, production chunks
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   └── src/
│       ├── main.tsx            # React entrypoint + providers
│       ├── App.tsx             # Router + auth guards
│       ├── types/index.ts      # All TypeScript types and interfaces
│       ├── lib/
│       │   └── axios.ts        # Axios instance + error helper
│       ├── store/
│       │   ├── authStore.ts    # Zustand auth state
│       │   └── uploadStore.ts  # Zustand upload progress state
│       ├── hooks/
│       │   ├── useAuth.ts      # All auth mutations
│       │   ├── useFiles.ts     # File queries + mutations
│       │   └── useFolders.ts   # Folder queries + mutations + sharing
│       ├── components/
│       │   ├── common/         # LoadingSpinner, EmptyState, StorageBar, etc.
│       │   ├── files/          # FileGrid, FileList, FilePreviewModal, UploadDropzone
│       │   ├── folders/        # FolderBreadcrumb, CreateFolderModal
│       │   ├── sharing/        # ShareModal
│       │   └── layout/         # DriveLayout, AdminLayout
│       └── pages/
│           ├── auth/           # Login, Register, VerifyEmail, ForgotPw, ResetPw, AcceptInvite
│           ├── drive/          # MyDrive, Folder, SharedWith/By, Recent, Starred, Trash, Settings, Security
│           └── admin/          # Users, Invitations, Audit, Storage, Flags, Policy
│
└── tailscale/
    └── serve.json              # Tailscale Serve config (optional)
```

---

## Troubleshooting

### ClamAV takes a long time to start

This is normal on first run. ClamAV needs to download virus definition files (~300 MB). Check progress:

```bash
docker compose logs -f clamav
# Wait until you see: "Listening daemon: PID: ..."
```

Uploaded files will queue for scanning and won't become available until ClamAV is ready.

### Emails are not being sent

1. Check SMTP settings in `.env` are correct
2. Check backend logs: `docker compose logs backend`
3. If using Gmail, ensure you're using an **App Password**, not your regular Gmail password
4. Confirm `FRONTEND_URL` is set correctly (it's used to build links in emails)

### "Invalid invitation code" on registration

- Codes are case-sensitive — use the exact code printed by the seed script
- Codes expire after their set date, or after reaching max uses
- Platform codes can only be used for account creation, not for folder access

### Database migration errors

```bash
# Reset the database completely (WARNING: destroys all data)
docker compose down -v
docker compose up -d postgres
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npm run seed
```

### Can't connect to MinIO

Check MinIO is healthy:

```bash
docker compose ps minio
docker compose logs minio
```

Verify `S3_ACCESS_KEY` and `S3_SECRET_KEY` in `.env` match `MINIO_ROOT_USER` and `MINIO_ROOT_PASSWORD`.

### Sessions lost after restart

Sessions are stored in Redis. If Redis loses its data (no volume mounted, or data purged), all users are logged out. The `redis_data` volume in docker-compose.yml persists sessions across restarts.

### "upstream sent invalid header" from nginx

The backend is not running or not healthy. Check:

```bash
docker compose logs backend
docker compose ps
```

### Storage usage showing incorrectly

Recalculate from the Admin Panel → Storage → "Recalculate storage", or via API:

```bash
curl -X POST http://localhost:4000/api/admin/storage-stats/recalculate \
  -H "Cookie: ds.sid=your_session_cookie"
```

---

## License

Private — All rights reserved.
