#!/usr/bin/env bash
set -euo pipefail
umask 077
compose=(docker compose --env-file .local/docker-test.env -f compose.test.yaml)
suffix="$(date +%s)_$$"
probe_schema="backup_probe_$suffix"
restore_db="fdu_restore_$suffix"
created=false
cleanup() {
  "${compose[@]}" exec -T db psql -U fdu_test -d fdu_course_test -q -c "DROP SCHEMA IF EXISTS $probe_schema CASCADE" >/dev/null
  if "$created"; then "${compose[@]}" exec -T db dropdb -U fdu_test "$restore_db"; fi
}
trap cleanup EXIT
"${compose[@]}" exec -T db psql -U fdu_test -d fdu_course_test -v ON_ERROR_STOP=1 -q -c "CREATE SCHEMA $probe_schema; CREATE TABLE $probe_schema.probe(value integer); INSERT INTO $probe_schema.probe VALUES(42)"
"${compose[@]}" exec -T db pg_dump -U fdu_test -d fdu_course_test --format=custom --no-owner --no-acl > .local/backup-test.dump
"${compose[@]}" exec -T db createdb -U fdu_test "$restore_db"
created=true
"${compose[@]}" exec -T db pg_restore -U fdu_test -d "$restore_db" --exit-on-error --no-owner --no-acl < .local/backup-test.dump
value=$("${compose[@]}" exec -T db psql -U fdu_test -d "$restore_db" -tAc "SELECT value FROM $probe_schema.probe")
test "$value" = 42
printf 'PostgreSQL backup and isolated restore verified.\n'
