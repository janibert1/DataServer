# DataServer Wiki

DataServer is a self-hosted cloud storage platform with a TypeScript/Express backend, React frontend, PostgreSQL database, MinIO object storage, and BullMQ background workers.

## Pages

| Page | Description |
|------|-------------|
| [Storage & Quotas](Storage-and-Quotas) | Per-user quotas, drive capacity, validation rules, admin API |
| [Background Jobs](Background-Jobs) | BullMQ workers, DriveOps panel, job types |
| [Installation](Installation) | Docker Compose setup, environment variables, VAPID keys |
| [Architecture](Architecture) | System overview, services, data flow |

## Quick links

- **Admin panel**: `/admin` — requires `ADMIN` role
- **API base**: `/api`
- **Health check**: `/api/health`
- **Source**: [github.com/janibert1/DataServer](https://github.com/janibert1/DataServer)
