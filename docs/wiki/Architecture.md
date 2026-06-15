# Architecture

---

## System overview

```
Browser / Mobile
      │
      ▼
Cloudflare Tunnel (cloudflared)
      │
      ├──► Frontend (React + Vite, served by Nginx)  :80
      │
      └──► Backend (Express + Prisma)                :4000
                │
                ├──► PostgreSQL (Prisma ORM)
                ├──► Redis (BullMQ queues + sessions)
                ├──► MinIO (S3 object storage)
                └──► ClamAV (virus scanning socket)
```

All services run in Docker Compose on the same host. The Cloudflare Tunnel forwards public HTTPS traffic without opening any firewall ports.

---

## Backend

**Runtime**: Node.js 20, TypeScript compiled with `tsc`.

**Key libraries**:
- `express` — HTTP routing
- `prisma` — ORM for PostgreSQL
- `bullmq` — Background job queues
- `@aws-sdk/client-s3` — MinIO (S3-compatible) access
- `sharp` — Image thumbnail generation
- `archiver` / `unzipper` — Zip/extract
- `nodemailer` — Email delivery
- `web-push` — Web Push notifications
- `@google/generative-ai` — Gemini AI Sort

**Route structure**:

| Mount | File | Purpose |
|-------|------|---------|
| `/api/auth` | `routes/auth.ts` | Login, register, OAuth, 2FA |
| `/api/files` | `routes/files.ts` | Upload, download, trash, share |
| `/api/folders` | `routes/folders.ts` | CRUD, trash, restore, share |
| `/api/admin` | `routes/admin.ts` | Users, policy, quotas, audit logs |
| `/api/account` | `routes/account.ts` | Profile, settings, quota info |
| `/api/jobs` | `routes/jobs.ts` | Job status polling |
| `/api/notifications` | `routes/notifications.ts` | Push subscription management |

---

## Frontend

**Runtime**: React 18 + Vite, served statically by Nginx.

**Key libraries**:
- `@tanstack/react-query` — Server state, caching, mutations
- `zustand` — Client-side state (upload queue, DriveOps panel, selection)
- `@headlessui/react` — Accessible modals and menus
- `lucide-react` — Icons
- `react-router-dom` — Client-side routing

**Key state stores**:

| Store | Purpose |
|-------|---------|
| `useAuthStore` | Current user, JWT, session |
| `useUploadStore` | Active upload queue with per-file progress |
| `useDriveOpsStore` | Active background DriveOps jobs (zip, extract, trash, restore) |
| `useSelectionStore` | Multi-select state for bulk operations |

---

## Database (PostgreSQL via Prisma)

**Key models**:

| Model | Description |
|-------|-------------|
| `User` | Account, quota, role, status |
| `File` | File metadata, S3 key, preview key, versions |
| `Folder` | Folder tree (self-referential parentId) |
| `StoragePolicy` | Global storage settings (singleton) |
| `AuditLog` | Immutable log of admin and user actions |
| `Invitation` | Platform and folder-share invitations |
| `ContentFlag` | User-reported content for admin review |
| `PushSubscription` | Web Push endpoint + keys per browser |

---

## Storage flow (upload)

1. Client sends `POST /api/files/upload` (multipart).
2. Middleware authenticates user and enforces `maxFileSizeBytes`.
3. `checkQuota` verifies user quota; `checkTotalCapacity` verifies drive capacity.
4. File is streamed to MinIO under key `uploads/{userId}/{uuid}/{filename}`.
5. `storageUsedBytes` is incremented atomically.
6. A `preview-queue` job is queued for thumbnail generation.
7. A `virus-scan-queue` job is queued for ClamAV scan.
8. File record is created in PostgreSQL; response returns file metadata.

---

## Storage flow (trash → delete)

1. `POST /api/folders/:id/trash` → queues `trash-folder` DriveOps job (HTTP 202).
2. Worker uses recursive CTE to find all descendant folder IDs; batch-marks `isTrashed = true`.
3. Files inside remain on MinIO; they are not deleted until the folder is permanently removed.
4. Daily cron (`trash-cleanup-queue`, 02:00 UTC) permanently deletes items older than `trashRetentionDays`:
   - Files: deleted from MinIO, `storageUsedBytes` decremented.
   - Folders: `deletedAt` set.
5. Admin "Empty trash" skips the retention window.

---

## Security notes

- Passwords hashed with bcrypt (cost 12).
- JWTs signed with `JWT_SECRET`; short-lived access tokens + refresh tokens.
- All file access goes through the API — MinIO is not exposed publicly.
- ClamAV scans every uploaded file; flagged files are quarantined and the upload is rejected.
- Audit log records every admin action and quota change; entries are immutable (no update/delete routes).
- Content flags allow users to report files/folders; admins review in the `/admin/flags` panel.
