#!/bin/sh
set -eu
umask 077
mkdir -p /backups
while true; do
  file="/backups/fdu-course-$(date -u +%Y%m%dT%H%M%SZ).dump"
  if pg_dump --format=custom --no-owner --no-acl > "$file.partial"; then
    mv "$file.partial" "$file"
    echo 'Database backup completed'
  else
    rm -f "$file.partial"
    echo 'Database backup failed' >&2
  fi
  sleep 86400
done
