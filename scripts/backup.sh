#!/usr/bin/env bash
set -euo pipefail
umask 077
mkdir -p backups
file="backups/fdu-course-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker compose exec -T db pg_dump -U fdu_course -d fdu_course --format=custom --no-owner --no-acl > "$file.partial"
mv "$file.partial" "$file"
printf 'Backup saved: %s\n' "$file"
