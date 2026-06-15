# Background Jobs

DataServer uses [BullMQ](https://docs.bullmq.io/) for all long-running operations. Jobs run in worker processes inside the backend container and report progress via Redis, which the frontend polls every 2 seconds.

---

## Workers

| Worker | Queue name | Job types |
|--------|-----------|-----------|
| `driveOpsWorker` | `drive-ops-queue` | `zip-to-drive`, `extract`, `trash-folder`, `restore-folder` |
| `previewWorker` | `preview-queue` | Image/video thumbnail generation |
| `virusScanWorker` | `virus-scan-queue` | ClamAV scan after upload |
| `emptyTrashWorker` | `empty-trash-queue` | Permanent deletion of trashed items |
| `aiSortWorker` | `ai-sort-queue` | Gemini-powered automatic file organisation |
| `notificationWorker` | `notification-queue` | Web Push delivery |
| `trashCleanupWorker` | `trash-cleanup-queue` | Scheduled daily purge of expired trash items |
| `zipWorker` | `zip-queue` | *(legacy alias — merged into drive-ops)* |

---

## DriveOps job types

### `zip-to-drive`
Zips a folder (or set of files) into a new `.zip` file inside the user's drive.

Fields:
```ts
{ type: 'zip-to-drive', userId, sourceFolderId, targetFolderId, label }
```

### `extract`
Extracts a `.zip` file into a target folder. Skips files that would exceed the user's quota or total drive capacity and reports them in the result.

Fields:
```ts
{ type: 'extract', userId, fileId, targetFolderId, label }
```

### `trash-folder`
Moves a folder and all its descendants to trash using a single PostgreSQL recursive CTE, then batch-updates in groups of 500.

Fields:
```ts
{ type: 'trash-folder', userId, folderId, label }
```

Progress events:
- 5% — `Collecting folders…`
- 30–95% — `Trashing batch N/M…`
- 100% — `Moved to trash`

### `restore-folder`
Restores a trashed folder and all its trashed descendants from trash.

Fields:
```ts
{ type: 'restore-folder', userId, folderId, label }
```

---

## DriveOps panel

A floating panel in the bottom-left corner of the drive UI shows live progress for all active DriveOps jobs. It polls `GET /api/jobs/:id` every 2 seconds.

Icons by job type:
- `zip-to-drive` → Archive icon
- `extract` → FolderOutput icon
- `trash-folder` → Trash2 icon
- `restore-folder` → RotateCcw icon

Jobs are stored in `driveOpsStore` (Zustand) and removed from the panel when they complete or fail.

---

## Job status API

```
GET /api/jobs/:id
```

Response:
```json
{
  "id": "123",
  "state": "active",
  "progress": { "percent": 45, "message": "Trashing batch 3/7…" },
  "result": null,
  "failedReason": null
}
```

States: `waiting`, `active`, `completed`, `failed`, `delayed`.

---

## Trash & empty-trash flow

1. User clicks "Move to trash" → `POST /api/folders/:id/trash` returns `{ jobId, label }` immediately (HTTP 202).
2. `trash-folder` job runs in the background; only the root folder is shown in the trash listing (descendants remain accessible through the folder hierarchy once you open the root).
3. The daily `trash-cleanup-queue` job (runs at 02:00 UTC) permanently deletes items whose `trashedAt` is older than `trashRetentionDays`.
4. Admin "Empty trash" button queues an `empty-trash-queue` job which permanently deletes all trashed items for a user immediately.

---

## Monitoring

All BullMQ queues are visible in the Bull Board dashboard at:

```
/admin/queues   (if Bull Board is mounted)
```

Alternatively, inspect directly via Redis:
```sh
docker exec -it dataserver_redis redis-cli
> LRANGE bull:drive-ops-queue:wait 0 -1
```
