# Storage & Quotas

DataServer enforces storage limits at two levels: a **per-user quota** and an optional **total drive capacity**. This page explains how both work, what the admin controls do, and what validation rules are enforced server-side.

---

## Concepts

### Per-user quota (`storageQuotaBytes`)

Every user has a `storageQuotaBytes` field. Uploads are rejected when:

```
user.storageUsedBytes + uploadSize > user.storageQuotaBytes
```

`storageUsedBytes` is incremented on upload and decremented when files are permanently deleted (trash → empty trash). New users receive the `defaultQuotaBytes` value from the storage policy.

### Total drive capacity (`totalDriveCapacityBytes`)

An optional server-wide cap stored in `StoragePolicy`. When set, uploads are also rejected when:

```
totalOccupiedAcrossAllUsers + uploadSize > totalDriveCapacityBytes
```

Setting this to `null` means unlimited (bounded only by physical disk / MinIO).

### Allocated vs. occupied

| Term | Meaning |
|------|---------|
| **Occupied** | Sum of `storageUsedBytes` — actual bytes stored |
| **Allocated** | Sum of `storageQuotaBytes` — total promised space across all users |

Allocated can legitimately exceed occupied (users haven't used their full quota yet). Allocated can also exceed the total drive capacity if quotas were set before the capacity limit was added; the UI warns about this and offers proportional redistribution.

---

## Validation rules

All rules are enforced server-side. Client-side limits are advisory only.

### Per-user quota (`PATCH /api/admin/users/:id` with `action: setQuota`)

| Rule | Error |
|------|-------|
| `storageQuotaBytes` must be a valid integer string | 400 `storageQuotaBytes must be a valid integer.` |
| Must be ≥ 0 | 400 `Quota cannot be negative.` |
| Must be ≥ user's current `storageUsedBytes` | 400 `Quota cannot be set below the user's current usage (N bytes).` |
| Must not exceed remaining drive capacity headroom¹ | 400 `Quota would exceed total drive capacity. Available headroom: N bytes.` |

> ¹ Headroom = `totalDriveCapacityBytes − totalAllocatedQuota + thisUser'sCurrentQuota`. Only checked when a total capacity is configured.

### Storage policy (`PATCH /api/admin/policy`)

| Field | Rules |
|-------|-------|
| `defaultQuotaBytes` | Valid integer, ≥ 1 byte |
| `maxFileSizeBytes` | Valid integer, ≥ 1 byte |
| `trashRetentionDays` | Positive integer (≥ 1); 0 would permanently delete files the moment they are trashed |
| `versionRetentionCount` | Non-negative integer (≥ 0); 0 disables versioning |
| `totalDriveCapacityBytes` | Valid integer, must be ≥ current occupied space, must be ≤ physical disk − 2 GB (local storage only) |

### Quota redistribution (`POST /api/admin/redistribute-quotas`)

| Rule | Error |
|------|-------|
| `targetCapacityBytes` must be a valid integer | 400 |
| Must be ≥ 1 byte | 400 |
| Must be ≥ current total occupied space | 400 (same as `totalDriveCapacityBytes` validation) |

---

## Admin API endpoints

All endpoints require authentication with an `ADMIN`-role user.

### Get storage overview
```
GET /api/admin/storage-overview
```
Returns current occupied, allocated, configured capacity, and physical disk info.

```json
{
  "disk": { "totalBytes": "...", "availableBytes": "..." },
  "capacityBytes": "107374182400",
  "occupiedBytes": "4831838208",
  "allocatedQuotaBytes": "53687091200"
}
```

### Get storage stats (top users)
```
GET /api/admin/storage-stats
```
Returns top 10 users by usage, total used, total allocated, and active user count.

### Set a user's quota
```
PATCH /api/admin/users/:id
Content-Type: application/json

{ "action": "setQuota", "storageQuotaBytes": "10737418240" }
```
Always send bytes as a string (JSON integers lose precision for large values).

### Get / update storage policy
```
GET  /api/admin/policy
PATCH /api/admin/policy
```

Policy fields:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `defaultQuotaBytes` | string (bigint) | `"10737418240"` (10 GB) | Quota assigned to new users |
| `maxFileSizeBytes` | string (bigint) | `"5368709120"` (5 GB) | Hard cap per uploaded file |
| `totalDriveCapacityBytes` | string (bigint) or `null` | `null` | Server-wide capacity ceiling |
| `trashRetentionDays` | number | `30` | Days before trashed items are permanently deleted |
| `versionRetentionCount` | number | `5` | Number of old file versions to keep |
| `allowedMimeTypes` | string[] | `[]` (all) | Whitelist; empty = allow all |
| `blockedExtensions` | string[] | `[]` | Blocked file extensions |

### Proportionally redistribute quotas
```
POST /api/admin/redistribute-quotas
Content-Type: application/json

{ "targetCapacityBytes": "53687091200", "preview": true }
```

Scales all active users' quotas proportionally to fit within `targetCapacityBytes`. No user's quota is reduced below their actual used space. Pass `"preview": true` to see the adjustments without committing them.

Response:
```json
{
  "adjusted": true,
  "users": [
    { "id": "...", "oldQuota": "10737418240", "newQuota": "8589934592", "used": "3221225472" }
  ]
}
```

---

## Storage accounting

`storageUsedBytes` is updated in three places:

| Event | Change |
|-------|--------|
| File uploaded (single or multi-part) | `+= fileSize` |
| File permanently deleted (empty trash worker, delete route) | `-= fileSize` |
| File overwritten (version replaced) | `+= newSize − oldSize` |

The quota check (`checkQuota`) reads `storageUsedBytes` and `storageQuotaBytes` in a single DB round-trip. Both the per-user quota and the total capacity check happen before any bytes are written to MinIO.

---

## Physical disk validation

When the storage backend is local (i.e. `UPLOAD_DIR` points to a local path), setting `totalDriveCapacityBytes` also validates against the actual disk via `fs.statfsSync`. The maximum allowed value is:

```
totalDriveCapacityBytes ≤ physicalDisk.totalBytes − 2 GB
```

The 2 GB buffer ensures the OS and other processes always have breathing room. This check is skipped automatically when using S3 / MinIO on a remote host (disk stats are not meaningful there).
