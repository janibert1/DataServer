#!/bin/bash
# Refuses to let minio silently write to local disk if the NAS CIFS mount drops.
# See auto-memory project_dataserver.md / project_dataserver_resume_plan.md for why.
MOUNT=/mnt/Dataserver
STATE=/opt/dataserver/.mount_guard_down
COMPOSE="/usr/bin/docker compose -f /opt/dataserver/docker-compose.yml"

if mountpoint -q "$MOUNT"; then
    if [ -f "$STATE" ]; then
        logger -t dataserver-mount-guard "NAS mount recovered - restarting minio"
        $COMPOSE start minio
        rm -f "$STATE"
    fi
else
    if [ ! -f "$STATE" ]; then
        logger -t dataserver-mount-guard "NAS mount is DOWN - stopping minio to prevent local-disk fallback"
        date -u +%FT%TZ > "$STATE"
        $COMPOSE stop minio
    fi
fi
