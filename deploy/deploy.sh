#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
ssh_target="${KEYKOMI_DEPLOY_TARGET:?Set KEYKOMI_DEPLOY_TARGET to the restricted deployment account}"
revision="$(git rev-parse HEAD)"
run_id="${GITHUB_RUN_ID:-$(date +%s)}"
attempt="${GITHUB_RUN_ATTEMPT:-1}"
release_id="${revision}-${run_id}-${attempt}"
[[ "$release_id" =~ ^[a-f0-9]{40}-[0-9]{1,15}-[0-9]{1,3}$ ]] || exit 2
pnpm release
archive="$(mktemp -t keykomi-release.XXXXXXXX)"
trap 'rm -f "$archive"' EXIT
COPYFILE_DISABLE=1 tar -czf "$archive" -C apps/web/dist .
ssh -o BatchMode=yes "$ssh_target" "upload $release_id" < "$archive"
ssh -o BatchMode=yes "$ssh_target" "activate $release_id"
if ! python3 deploy/smoke.py https://keykomi.com "$revision"; then
  ssh -o BatchMode=yes "$ssh_target" rollback
  python3 deploy/smoke.py https://keykomi.com
  exit 1
fi
