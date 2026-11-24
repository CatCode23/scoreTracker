#!/usr/bin/env bash
# Runs all migrations + seed + RLS/workflow tests against a throwaway local PostgreSQL.
# Requires PostgreSQL 15+ server binaries (initdb, pg_ctl) on PATH or in /usr/lib/postgresql/*/bin.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="$(dirname "$(command -v initdb 2>/dev/null || ls -d /usr/lib/postgresql/*/bin/initdb | tail -1)")"
TMP="$(mktemp -d)"
PORT="${PGPORT_TEST:-55432}"
RUN_AS=()
if [ "$(id -u)" = "0" ]; then
  chown -R postgres "$TMP" 2>/dev/null || true
  RUN_AS=(sudo -u postgres)
  command -v sudo >/dev/null || RUN_AS=(su postgres -c)
fi
run() { if [ "${RUN_AS[0]:-}" = "su" ]; then su postgres -c "$*"; elif [ -n "${RUN_AS[*]:-}" ]; then "${RUN_AS[@]}" "$@"; else "$@"; fi; }
cleanup() { run "$PGBIN/pg_ctl" -D "$TMP/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT
run "$PGBIN/initdb" -D "$TMP/data" -U postgres -A trust >/dev/null
run "$PGBIN/pg_ctl" -D "$TMP/data" -o "-p $PORT -k $TMP -c listen_addresses='' -c wal_level=logical" -l "$TMP/log" -w start >/dev/null
PSQL=(psql -h "$TMP" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X)
"${PSQL[@]}" -f "$ROOT/supabase/tests/00_supabase_stub.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do echo "migrate: $(basename "$f")"; "${PSQL[@]}" -f "$f"; done
"${PSQL[@]}" -f "$ROOT/supabase/seed.sql"
"${PSQL[@]}" -f "$ROOT/supabase/seed.sql" # idempotent
shopt -s nullglob
for f in "$ROOT"/supabase/tests/[1-9]*.sql; do echo "test: $(basename "$f")"; "${PSQL[@]}" -f "$f" >/dev/null; done
echo "All database tests passed."
