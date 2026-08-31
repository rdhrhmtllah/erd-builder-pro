#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 || "$2" != "--confirm" ]]; then
  printf 'Usage: %s /absolute/path/to/restore-point.dump --confirm\n' "$0" >&2
  exit 2
fi

dump_file=$1
if [[ "$dump_file" != /* || ! -f "$dump_file" ]]; then
  printf 'Restore point must be an existing absolute .dump path.\n' >&2
  exit 2
fi

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
db_container="${ERD_DB_CONTAINER:-erd-builder-pro-db}"
app_container="${ERD_APP_CONTAINER:-erd-builder-pro}"

docker_cmd=(docker)
if ! docker info >/dev/null 2>&1; then
  docker_cmd=(sudo -n docker)
fi

if [[ -f "$dump_file.sha256" ]]; then
  sha256sum --check "$dump_file.sha256"
fi
"$script_dir/create-server-restore-point.sh" pre-restore

restart_app=true
trap 'if [[ "$restart_app" == true ]]; then "${docker_cmd[@]}" start "$app_container" >/dev/null; fi' EXIT
"${docker_cmd[@]}" stop "$app_container" >/dev/null
"${docker_cmd[@]}" exec "$db_container" sh -lc \
  'dropdb --force -U "$POSTGRES_USER" "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
"${docker_cmd[@]}" exec -i "$db_container" sh -lc \
  'exec pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' < "$dump_file"
"${docker_cmd[@]}" start "$app_container" >/dev/null
restart_app=false

printf 'Restored %s\n' "$dump_file"
