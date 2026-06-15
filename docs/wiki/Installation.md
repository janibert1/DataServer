# Installation

DataServer is deployed via Docker Compose. The `install.sh` script walks through all configuration interactively and generates a `.env` file.

---

## Prerequisites

- Docker ≥ 24 and Docker Compose v2
- `openssl` (for VAPID key generation)
- A domain pointed at the server (for Cloudflare Tunnel) or a reverse proxy

---

## Quick start

```sh
git clone https://github.com/janibert1/DataServer.git
cd DataServer
bash install.sh
docker compose up -d
```

---

## Install wizard steps

| Step | What it configures |
|------|--------------------|
| `step_admin` | Admin account email + password |
| `step_smtp` | SMTP relay for email verification and password resets |
| `step_gemini` | Google AI Studio API key (optional — enables AI Sort feature) |
| `step_confirm` | Review summary, then generate `.env` and start containers |

---

## Environment variables

All variables are written to `.env` at the project root. The most important ones:

### Core

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | auto-generated |
| `REDIS_URL` | Redis connection string | auto-generated |
| `JWT_SECRET` | Secret for signing JWTs | auto-generated (64-char hex) |
| `SESSION_SECRET` | Express session secret | auto-generated |
| `ADMIN_EMAIL` | Initial admin account email | prompted |
| `ADMIN_PASSWORD` | Initial admin account password | prompted |

### Storage

| Variable | Description | Default |
|----------|-------------|---------|
| `MINIO_ENDPOINT` | MinIO host | `minio` (Docker service name) |
| `MINIO_PORT` | MinIO port | `9000` |
| `MINIO_ACCESS_KEY` | MinIO access key | auto-generated |
| `MINIO_SECRET_KEY` | MinIO secret key | auto-generated |
| `MINIO_BUCKET` | Bucket name | `dataserver-files` |
| `DEFAULT_QUOTA_BYTES` | Default per-user storage quota | `10737418240` (10 GB) |
| `UPLOAD_DIR` | Local upload path (used for disk stats) | `./uploads` |

### Push notifications (VAPID)

Generated automatically by `install.sh` using OpenSSL.

| Variable | Description |
|----------|-------------|
| `VAPID_PUBLIC_KEY` | Base64url-encoded public key (P-256) |
| `VAPID_PRIVATE_KEY` | Base64url-encoded private key |
| `VAPID_EMAIL` | Contact email for push service (`mailto:…`) |

To regenerate manually:
```sh
tmpkey=$(mktemp)
openssl ecparam -name prime256v1 -genkey -noout -out "$tmpkey"
VAPID_PRIVATE_KEY=$(openssl ec -in "$tmpkey" -outform DER 2>/dev/null \
  | tail -c 32 | base64 -w 0 | tr '+/' '-_' | tr -d '=')
VAPID_PUBLIC_KEY=$(openssl ec -in "$tmpkey" -pubout -outform DER 2>/dev/null \
  | tail -c 65 | base64 -w 0 | tr '+/' '-_' | tr -d '=')
rm "$tmpkey"
```

### AI Sort (optional)

| Variable | Description |
|----------|-------------|
| `GOOGLE_API_KEY` | Google AI Studio API key — leave empty to disable AI Sort |

### SMTP

| Variable | Description |
|----------|-------------|
| `SMTP_HOST` | SMTP server hostname |
| `SMTP_PORT` | SMTP port (typically 587) |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password |
| `SMTP_FROM` | From address for outgoing mail |

### Cloudflare Tunnel

| Variable | Description |
|----------|-------------|
| `CLOUDFLARE_TOKEN` | Tunnel token from the Cloudflare Zero Trust dashboard |

---

## Docker Compose services

| Service | Image | Purpose |
|---------|-------|---------|
| `backend` | built from `./backend` | Express API + BullMQ workers |
| `frontend` | built from `./frontend` | React app (served by Nginx) |
| `postgres` | `postgres:16` | Primary database |
| `redis` | `redis:7-alpine` | BullMQ job queue + sessions |
| `minio` | `minio/minio` | S3-compatible object storage |
| `clamav` | `clamav/clamav` | Virus scanning |
| `cloudflared` | `cloudflare/cloudflared` | Tunnel to public internet |

---

## Upgrading

```sh
git pull
docker compose build
docker compose up -d
```

Prisma migrations run automatically on backend startup. No manual migration step is needed.
