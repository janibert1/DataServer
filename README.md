# DataServer

A production-ready, **invitation-only** cloud storage platform — your own self-hosted Google Drive. Built with security as a first-class concern and designed for real-world self-hosting.

![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.4-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Installation](#installation)
  - [Option A — Interactive Installer (Recommended)](#option-a--interactive-installer-recommended)
  - [Option B — Manual Setup](#option-b--manual-setup)
- [Environment Variables Reference](#environment-variables-reference)
- [Access Modes](#access-modes)
  - [Local Network Only](#local-network-only)
  - [Tailscale (Private HTTPS)](#tailscale-private-https)
  - [Cloudflare Tunnel (Public HTTPS)](#cloudflare-tunnel-public-https)
- [Google OAuth Setup](#google-oauth-setup)
- [File Storage Location](#file-storage-location)
- [Storage Limits](#storage-limits)
- [First Login & Admin Setup](#first-login--admin-setup)
- [Invitation System](#invitation-system)
- [Permission Levels](#permission-levels)
- [Security Overview](#security-overview)
- [Background Workers](#background-workers)
- [Local Development Setup](#local-development-setup)
- [Updating](#updating)
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
| **Admin panel** | User management, quota control, invitation management, audit logs, content moderation |
| **Security** | Argon2id passwords, signed download URLs (never exposed), ClamAV virus scanning, MIME validation, rate limiting |
| **Quotas** | Per-user configurable storage quotas + optional total bucket quota |
| **Notifications** | In-app + email notifications for shares, security events, storage warnings |
| **Audit logging** | Immutable log of every sensitive action with user, IP, and timestamp |
| **Background jobs** | Thumbnail generation, virus scanning, 30-day trash cleanup — async via BullMQ |

---

## Architecture

```
Browser
   │
   ▼
Tailscale Funnel / Cloudflare Tunnel / LAN
   │
   ▼
nginx (frontend container :80)
   ├── /api/*          ──► Express backend :4000
   ├── /dataserver-files/* ──► MinIO :9000  (presigned URL proxy)
   └── /*              ──► React SPA (index.html)
                              │
                              ├── PostgreSQL (Prisma ORM)
                              ├── Redis (sessions + BullMQ queues)
                              ├── MinIO (S3-compatible object storage)
                              └── ClamAV (virus scanning)
```

**Key design decisions:**
- MinIO presigned URLs are routed **through nginx** — browsers never need direct MinIO access
- Session cookies are `HttpOnly; Secure; SameSite=Strict` when behind HTTPS
- `X-Forwarded-Proto: https` is hardcoded in nginx for correct secure cookie behaviour behind Tailscale/Cloudflare
- All file uploads pass through ClamAV before being confirmed

---

## Installation

### Option A — Interactive Installer (Recommended)

A single script that installs all dependencies, asks you questions via a TUI wizard, and configures everything automatically.

**What it installs/configures:**
- Docker + Docker Compose (if not already present)
- All system dependencies (git, curl, openssl)
- DataServer services (backend, frontend, PostgreSQL, Redis, MinIO, ClamAV)
- Your chosen access mode (local / Tailscale / Cloudflare / both)
- Storage location and limits
- Admin account, Google OAuth, SMTP (optional)

**Run on your Linux server:**

```bash
wget -qO install.sh https://raw.githubusercontent.com/janibert1/DataServer/master/install.sh
sudo bash install.sh
```

> The script must be downloaded first (not piped directly) because the TUI requires a TTY.

**Supported operating systems:** Ubuntu, Debian, CentOS, RHEL, Fedora, Arch Linux

The wizard will walk you through:
1. Install directory
2. Admin account credentials
3. File storage location (Docker volume or custom path/NAS/external drive)
4. Storage limits (total, per-user, max file size)
5. Access mode (local / Tailscale / Cloudflare Tunnel / both)
6. Google OAuth (optional)
7. SMTP email (optional)

At the end it builds, starts, initialises the database, seeds the admin account, sets the MinIO quota, and shows you your access URL.

---

### Option B — Manual Setup

#### Step 1 — Clone

```bash
git clone https://github.com/janibert1/DataServer.git
cd DataServer
```

#### Step 2 — Configure environment

```bash
cp .env.example .env
nano .env
```

At minimum set:

```env
SESSION_SECRET=<64-char random hex>   # openssl rand -hex 32
JWT_SECRET=<64-char random hex>       # openssl rand -hex 32
POSTGRES_PASSWORD=<strong password>
REDIS_PASSWORD=<strong password>
MINIO_ROOT_PASSWORD=<strong password>
S3_SECRET_KEY=<same as MINIO_ROOT_PASSWORD>
FRONTEND_URL=http://YOUR_SERVER_IP:3005
S3_PUBLIC_URL=http://YOUR_SERVER_IP:3005   # files proxied through nginx
COOKIE_SECURE=false                         # set true only behind HTTPS
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=YourSecurePassword123
```

#### Step 3 — Build and start

```bash
sudo docker compose up -d --build
```

#### Step 4 — Initialise database

```bash
sudo docker compose exec backend npx prisma db push
sudo docker compose exec backend node dist/seed.js
```

#### Step 5 — Open the app

Navigate to `http://YOUR_SERVER_IP:3005` and log in with your admin credentials.

---

## Environment Variables Reference

### Core

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `production` | Set to `development` for local dev |
| `PORT` | `4000` | Backend HTTP port |
| `FRONTEND_URL` | — | Full public URL of the app. Used for CORS, cookies, email links. E.g. `https://dataserver.tail1234.ts.net` |
| `COOKIE_SECURE` | `false` | Set `true` when running behind HTTPS (Tailscale/Cloudflare). Controls `Secure` and `SameSite=Strict` on session cookies. |

### Database

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | — | Full PostgreSQL connection string |
| `POSTGRES_USER` | `dataserver` | PostgreSQL user (Docker service) |
| `POSTGRES_PASSWORD` | — | PostgreSQL password — **change this** |
| `POSTGRES_DB` | `dataserver` | Database name |

### Redis

| Variable | Default | Description |
|---|---|---|
| `REDIS_URL` | — | Redis connection string, e.g. `redis://:password@redis:6379` |
| `REDIS_PASSWORD` | — | Redis password — **change this** |

### Object Storage (MinIO / S3)

| Variable | Default | Description |
|---|---|---|
| `S3_ENDPOINT` | `http://minio:9000` | Internal endpoint used by the backend to talk to MinIO. Keep as `http://minio:9000` in Docker. |
| `S3_PUBLIC_URL` | — | **Browser-accessible** base URL for presigned download/preview/upload URLs. Set to your public app URL (files are proxied through nginx). E.g. `https://dataserver.tail1234.ts.net` |
| `S3_ACCESS_KEY` | — | MinIO root user |
| `S3_SECRET_KEY` | — | MinIO root password |
| `S3_BUCKET` | `dataserver-files` | Bucket name (auto-created on startup) |
| `S3_REGION` | `us-east-1` | Region (any string for MinIO) |
| `S3_FORCE_PATH_STYLE` | `true` | Required for MinIO path-style URLs |
| `MINIO_ROOT_USER` | — | MinIO Docker service root user |
| `MINIO_ROOT_PASSWORD` | — | MinIO Docker service root password — **change this** |

> **How presigned URLs work in this setup:**
> Files are served through nginx (`/dataserver-files/*` → MinIO internally), so `S3_PUBLIC_URL` should be your app's public URL, not MinIO's port. This avoids mixed-content issues and keeps everything on one HTTPS endpoint.

### Session & JWT

| Variable | Default | Description |
|---|---|---|
| `SESSION_SECRET` | — | 64-byte hex string for session signing. Generate: `openssl rand -hex 32` |
| `JWT_SECRET` | — | 64-byte hex string for JWT tokens |
| `SESSION_MAX_AGE_MS` | `86400000` | Session lifetime in ms (default 24 hours) |

### Authentication

| Variable | Default | Description |
|---|---|---|
| `GOOGLE_CLIENT_ID` | — | Google OAuth client ID (optional) |
| `GOOGLE_CLIENT_SECRET` | — | Google OAuth client secret (optional) |
| `GOOGLE_CALLBACK_URL` | — | Must match Google Console exactly. E.g. `https://yourapp.com/api/auth/google/callback` |

### Email (SMTP)

| Variable | Default | Description |
|---|---|---|
| `SMTP_HOST` | `localhost` | SMTP server |
| `SMTP_PORT` | `587` | SMTP port (587 = TLS, 465 = SSL) |
| `SMTP_SECURE` | `false` | Set `true` for port 465 |
| `SMTP_USER` | — | SMTP username |
| `SMTP_PASS` | — | SMTP password or app password |
| `SMTP_FROM` | — | From address, e.g. `DataServer <noreply@example.com>` |

> If SMTP is not configured, email sending is silently skipped (no crashes). Users won't receive verification/reset emails.

### Storage Limits

| Variable | Default | Description |
|---|---|---|
| `DEFAULT_QUOTA_BYTES` | `10737418240` | Default per-user quota (10 GB) |
| `MAX_FILE_SIZE_BYTES` | `2147483648` | Max single file size (2 GB) |

### ClamAV

| Variable | Default | Description |
|---|---|---|
| `CLAMAV_HOST` | `clamav` | ClamAV daemon hostname |
| `CLAMAV_PORT` | `3310` | ClamAV daemon port |

### Access (Tailscale / Cloudflare)

| Variable | Description |
|---|---|
| `TAILSCALE_AUTHKEY` | Auth key from [login.tailscale.com/admin/settings/keys](https://login.tailscale.com/admin/settings/keys) — generate as **Reusable** |
| `CLOUDFLARE_TOKEN` | Tunnel token from Cloudflare Zero Trust → Tunnels |

### Admin Bootstrap

| Variable | Description |
|---|---|
| `ADMIN_EMAIL` | Email for the first admin account (created by seed script) |
| `ADMIN_PASSWORD` | Password for the first admin (min 8 chars, uppercase + number required) |
| `ADMIN_DISPLAY_NAME` | Display name for the admin |

---

## Access Modes

### Local Network Only

The app is accessible on your LAN via IP address. No internet exposure.

```env
FRONTEND_URL=http://192.168.1.x:3005
S3_PUBLIC_URL=http://192.168.1.x:3005
COOKIE_SECURE=false
```

In `docker-compose.yml` the frontend port maps to `3005:80` (or any free port).

---

### Tailscale (Private HTTPS)

Tailscale gives you a private `*.ts.net` HTTPS URL accessible from any of your devices, anywhere — without opening any firewall ports.

#### 1. Get a Tailscale auth key

Go to [login.tailscale.com/admin/settings/keys](https://login.tailscale.com/admin/settings/keys) → **Generate auth key** → check **Reusable**.

#### 2. Enable HTTPS certificates

[login.tailscale.com/admin/dns](https://login.tailscale.com/admin/dns) → scroll down → **Enable HTTPS Certificates** → Save.

#### 3. Enable Funnel in your ACL policy

[login.tailscale.com/admin/acls](https://login.tailscale.com/admin/acls) — add this top-level key:

```json
"nodeAttrs": [
  {
    "target": ["autogroup:member"],
    "attr":   ["funnel"]
  }
]
```

#### 4. Configure `.env`

Find your Tailscale hostname in [login.tailscale.com/admin/machines](https://login.tailscale.com/admin/machines). The **Docker container** registers separately as `dataserver.YOUR-TAILNET.ts.net` (based on the `hostname: dataserver` in docker-compose.yml).

```env
TAILSCALE_AUTHKEY=tskey-auth-xxxxx
FRONTEND_URL=https://dataserver.YOUR-TAILNET.ts.net
S3_PUBLIC_URL=https://dataserver.YOUR-TAILNET.ts.net
COOKIE_SECURE=true
GOOGLE_CALLBACK_URL=https://dataserver.YOUR-TAILNET.ts.net/api/auth/google/callback
```

#### 5. Update `tailscale/serve.json`

Replace the hostname with your actual `*.ts.net` address:

```json
{
  "TCP": { "443": { "HTTPS": true } },
  "Web": {
    "dataserver.YOUR-TAILNET.ts.net:443": {
      "Handlers": { "/": { "Proxy": "http://frontend:80" } }
    }
  },
  "AllowFunnel": {
    "dataserver.YOUR-TAILNET.ts.net:443": true
  }
}
```

#### 6. Start

```bash
sudo docker compose up -d
```

> **Tailscale Funnel vs Serve:**
> - **Serve** — accessible only to devices on your tailnet (private)
> - **Funnel** — publicly accessible to anyone with the URL (requires the ACL step above)

---

### Cloudflare Tunnel (Public HTTPS)

Best for: public deployment on your own domain with automatic HTTPS.

#### 1. Create a tunnel

Go to [dash.cloudflare.com](https://dash.cloudflare.com) → Zero Trust → Networks → Tunnels → **Create a tunnel** → Docker. Copy the tunnel token.

#### 2. Configure the public hostname

In the tunnel settings → **Public Hostname**:
- Domain: `files.yourdomain.com`
- Service Type: `HTTP`
- URL: `frontend:80`

#### 3. Configure `.env`

```env
CLOUDFLARE_TOKEN=your_tunnel_token_here
FRONTEND_URL=https://files.yourdomain.com
S3_PUBLIC_URL=https://files.yourdomain.com
COOKIE_SECURE=true
GOOGLE_CALLBACK_URL=https://files.yourdomain.com/api/auth/google/callback
```

#### 4. Start

```bash
sudo docker compose up -d
```

The `cloudflared` service in docker-compose connects to Cloudflare's network and routes traffic to `frontend:80` internally.

---

## Google OAuth Setup

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → **APIs & Services** → **Credentials**
2. Create project if needed
3. **OAuth consent screen** → External → fill in app name and email
4. **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID** → Web application
5. **Authorized redirect URIs** → add:
   ```
   https://your-app-url/api/auth/google/callback
   ```
6. Copy **Client ID** and **Client Secret** into `.env`

**Behaviour with invitation-only mode:**
- Existing users can link their Google account on first Google sign-in
- New Google users are prompted for a platform invitation code before their account is created

---

## File Storage Location

By default, files are stored in a Docker-managed volume (`minio_data`). The actual data lives at:

```
/var/lib/docker/volumes/dataserver_minio_data/_data
```

### Using a custom path (external drive, NAS, etc.)

Edit `docker-compose.yml` under the `minio` service:

```yaml
# Before (Docker volume):
volumes:
  - minio_data:/data

# After (custom path):
volumes:
  - /mnt/your-drive/dataserver:/data
```

**Steps:**

```bash
# Stop MinIO
sudo docker compose stop minio

# Copy existing data to new location
sudo cp -r /var/lib/docker/volumes/dataserver_minio_data/_data /mnt/your-drive/dataserver

# Edit docker-compose.yml (change the volume line)
nano docker-compose.yml

# Start MinIO
sudo docker compose up -d minio
```

Make sure:
- The target path exists and is writable by Docker
- If it's a network mount (NFS/SMB), it's in `/etc/fstab` so it mounts before Docker starts

You can also browse files via the **MinIO web console** at `http://YOUR_SERVER_IP:9001` (login with your `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD`).

---

## Storage Limits

Three independent limits control storage:

| Limit | Configured via | Scope |
|---|---|---|
| **Max file size** | `MAX_FILE_SIZE_BYTES` env var | Per-upload (enforced by backend) |
| **Per-user quota** | `DEFAULT_QUOTA_BYTES` env var (+ per-user override in admin panel) | Per user account |
| **Total bucket quota** | MinIO bucket quota | Entire platform |

### Setting the total bucket quota

After services are running:

```bash
# Set to 500 GB total
sudo docker exec dataserver_minio \
  mc alias set local http://localhost:9000 YOUR_MINIO_USER YOUR_MINIO_PASS

sudo docker exec dataserver_minio \
  mc quota set local/dataserver-files --size 500GiB
```

Or use the **MinIO console** at `:9001` → Buckets → dataserver-files → Summary → Quota.

The interactive installer sets this automatically based on your input.

---

## First Login & Admin Setup

After seeding:

1. Open the app URL in your browser
2. Log in with the email and password from `.env`
3. The seed script also creates an initial invitation code — check the seed output or create one in the Admin Panel

### Admin Panel

Access via your avatar (top-right) → **Admin Panel**, or navigate directly:

| Section | What you can do |
|---|---|
| **Users** | Search, suspend/restore, adjust per-user quotas, change roles, delete |
| **Invitations** | Create platform invitations, view/revoke all codes |
| **Audit Logs** | Browse all actions with filters, export CSV |
| **Storage** | Total usage, per-user breakdown, recalculate stats |
| **Content Flags** | Review reported files, quarantine or dismiss |
| **Platform Policy** | Set global defaults: quota, max file size, blocked extensions |

### Creating invitations

1. Admin Panel → Invitations → **Create invitation**
2. Optionally restrict to a specific email, set max uses and expiry
3. Share the `XXXX-XXXX-XXXX` code with the user
4. They visit `/register`, enter the code, and complete sign-up

---

## Invitation System

### Platform Invitations

- **Created by:** Admins only
- **Purpose:** Allow someone new to create an account
- **Options:** expiry date, max uses, email restriction, note

### Folder-Share Invitations

- **Created by:** Folder owners
- **Purpose:** Grant an existing/new user access to a specific shared folder
- **Flow:** Owner generates invite link → recipient visits `/accept-invite?code=…` → logs in → gains folder access

---

## Permission Levels

Permissions apply per-folder and are inherited by all subfolders.

| Level | View | Download | Upload | Edit/Rename | Delete | Reshare |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Viewer** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Downloader** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Contributor** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Editor** | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Owner** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## Security Overview

| Concern | How it's handled |
|---|---|
| Password storage | Argon2id (65 536 KB memory, 3 iterations, 4 parallelism) |
| Session cookies | HttpOnly, Secure (configurable), SameSite=Strict behind HTTPS |
| File downloads | AWS v4 pre-signed URLs (5 min expiry), signed for the public hostname |
| Virus scanning | ClamAV INSTREAM on every upload; infected files are quarantined |
| MIME validation | Server-side MIME type check (not just extension) |
| Rate limiting | Per-IP limits on auth (10/15 min), API (200/min), uploads (20/hr) |
| CORS | Locked to `FRONTEND_URL` only |
| Content Security Policy | Strict CSP via Helmet |
| Trust proxy | `trust proxy: 1` for correct IP logging behind Tailscale/Cloudflare |

---

## Background Workers

All heavy work runs asynchronously via BullMQ:

| Worker | What it does |
|---|---|
| **Preview** | Generates WebP thumbnails for images after upload |
| **Virus scan** | Streams file through ClamAV; quarantines infected files |
| **Trash cleanup** | Permanently deletes files trashed > 30 days ago |
| **Notifications** | Sends email + in-app notifications for shares, security events, storage warnings |

Workers run inside the backend container alongside the API server.

---

## Local Development Setup

Use this when you want to make code changes and see them live.

### Step 1 — Start infrastructure

```bash
sudo docker compose up -d postgres redis minio clamav
```

### Step 2 — Backend

```bash
cd backend
npm install
cp ../.env.example ../.env
# Edit .env — at minimum set DATABASE_URL, REDIS_URL, S3_* vars

npx prisma db push        # create tables
npx tsx src/seed.ts       # create admin user
npm run dev               # http://localhost:4000
```

### Step 3 — Frontend

```bash
cd frontend
npm install
npm run dev               # http://localhost:5173
```

The Vite dev server proxies `/api/*` to `http://localhost:4000` automatically.

---

## Updating

```bash
cd /opt/dataserver        # or wherever you installed it
git pull
sudo docker compose build --no-cache backend frontend
sudo docker compose up -d
```

> Always run `git pull` **before** rebuilding — Docker caches build layers and won't pick up changes otherwise.

If there are database schema changes:
```bash
sudo docker compose exec backend npx prisma db push
```

---

## Troubleshooting

### Login returns 401 immediately after succeeding

Session cookie not being saved. Check:
- `COOKIE_SECURE=true` requires HTTPS — if you're on plain HTTP, set it to `false`
- `FRONTEND_URL` must match the URL you're accessing the app from (exact origin, no trailing slash)
- nginx must send `X-Forwarded-Proto: https` to the backend (already configured if using this repo's `nginx.conf`)

### File preview/download returns 404 or SignatureDoesNotMatch

- `S3_PUBLIC_URL` must be the URL browsers use (your app URL, not `minio:9000`)
- The presigned URL is signed for `S3_PUBLIC_URL` — if this changes you need to restart the backend
- After changing `S3_PUBLIC_URL`, restart backend: `sudo docker compose restart backend`

### 413 Request Entity Too Large on upload

nginx's upload limit. In `frontend/nginx.conf`, increase `client_max_body_size`:

```nginx
client_max_body_size 2g;   # already set in this repo
```

Rebuild frontend after changing: `sudo docker compose build --no-cache frontend && sudo docker compose up -d frontend`

### Tailscale: "unable to connect"

1. Check container is running: `sudo docker logs dataserver_tailscale --tail 30`
2. Check Funnel is active: `sudo docker exec dataserver_tailscale tailscale --socket=/tmp/tailscaled.sock funnel status`
3. Ensure HTTPS certs are enabled in Tailscale DNS settings
4. Ensure `funnel` attr is in your ACL policy
5. The hostname in `tailscale/serve.json` must match what `tailscale cert` accepts — run:
   ```bash
   sudo docker exec dataserver_tailscale tailscale --socket=/tmp/tailscaled.sock cert YOUR-HOSTNAME
   ```
   The error message will tell you the valid hostname.

### Tailscale auth key error: "requested tags are invalid"

Remove `TS_EXTRA_ARGS: --advertise-tags=tag:server` from docker-compose.yml (requires tags to be defined in ACL first). Generate a new auth key after removing it.

### MinIO presigned URLs use wrong hostname

Set `S3_PUBLIC_URL` in `.env` to your public app URL, then restart backend:
```bash
sudo docker compose restart backend
```

### Docker build uses cached (old) code

Always `git pull` before building:
```bash
git pull && sudo docker compose build --no-cache <service> && sudo docker compose up -d <service>
```

### Services won't start — port already in use

Change the port mapping in `docker-compose.yml`:
```yaml
ports:
  - "3005:80"   # change 3005 to any free port
```

Check what's using a port: `sudo ss -tlnp | grep :3005`
