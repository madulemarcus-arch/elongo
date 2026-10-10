#!/bin/sh
# Applies supabase/schema.sql (twice, to prove it can be replayed) on a throwaway local PostgreSQL database
# and runs the permission scenarios of tests/rls-check.sql. Needs a local server and a superuser: npm run test:sql
# Override the connection with PSQL="psql -h host -U user".
set -e
cd "$(dirname "$0")"
PSQL=${PSQL:-"su postgres -c"}
DB=lisanga_rls_test
run() { if [ "$PSQL" = "su postgres -c" ]; then su postgres -c "psql -q -v ON_ERROR_STOP=1 $1 -f $2"; else $PSQL -q -v ON_ERROR_STOP=1 $1 -f "$2"; fi; }
if [ "$PSQL" = "su postgres -c" ]; then su postgres -c "dropdb --if-exists $DB && createdb $DB"; else $PSQL -c "drop database if exists $DB" postgres && $PSQL -c "create database $DB" postgres; fi
run "-d $DB" "$(pwd)/rls-stub.sql"
run "-d $DB" "$(pwd)/../supabase/schema.sql"
run "-d $DB" "$(pwd)/../supabase/schema.sql"
run "-d $DB" "$(pwd)/rls-check.sql" 2>&1 | grep -E "ECHEC|ERROR|ok " || true
echo "--- terminé"
