#!/usr/bin/env bash
# Recreates the local test database and applies the LOCAL shim + all migrations.
# Requires a running PostgreSQL 15+ reachable with the env vars below.
set -euo pipefail
PGHOST="${PGHOST:-/tmp}"; PGPORT="${PGPORT:-54329}"; PGUSER="${PGUSER:-postgres}"
DB="${MYFAV_TEST_DB:-myfav_test}"
cd "$(dirname "$0")/.."
PSQL=(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -d postgres -c "drop database if exists $DB with (force)" -c "create database $DB"
"${PSQL[@]}" -d "$DB" -f db/tests/shim/00_local_neon_shim.sql
for f in db/migrations/*.sql; do
  echo "applying $f"
  "${PSQL[@]}" -d "$DB" -f "$f"
done
echo "local database $DB ready"
