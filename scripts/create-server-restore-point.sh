#!/usr/bin/env bash
set -euo pipefail

label="${1:-manual}"
if [[ ! "$label" =~ ^[A-Za-z0-9._-]+$ ]]; then
  printf 'Invalid label: use letters, numbers, dots, underscores, or dashes only.\n' >&2
  exit 2
fi

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
app_dir=$(cd "$script_dir/.." && pwd)
service_dir=$(cd "$app_dir/.." && pwd)
backup_dir="${ERD_RESTORE_POINT_DIR:-$service_dir/deploy-backups}"
db_container="${ERD_DB_CONTAINER:-erd-builder-pro-db}"
app_container="${ERD_APP_CONTAINER:-erd-builder-pro}"
timestamp=$(date +%Y%m%d-%H%M%S)
base="$backup_dir/${timestamp}-${label}"

mkdir -p "$backup_dir"

docker_cmd=(docker)
if ! docker info >/dev/null 2>&1; then
  docker_cmd=(sudo -n docker)
fi

"${docker_cmd[@]}" exec "$db_container" sh -lc \
  'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$base.dump"
"${docker_cmd[@]}" exec -i "$db_container" pg_restore -l < "$base.dump" >/dev/null
sha256sum "$base.dump" > "$base.dump.sha256"

git_commit=$(git -C "$app_dir" rev-parse HEAD 2>/dev/null || printf 'unknown')
image_id=$("${docker_cmd[@]}" inspect "$app_container" --format '{{.Image}}' 2>/dev/null || printf 'unknown')
{
  printf 'created_at=%s\n' "$(date --iso-8601=seconds)"
  printf 'label=%s\n' "$label"
  printf 'git_commit=%s\n' "$git_commit"
  printf 'app_image_id=%s\n' "$image_id"
  printf 'database_container=%s\n' "$db_container"
} > "$base.meta"

printf '%s\n' "$base.dump"
