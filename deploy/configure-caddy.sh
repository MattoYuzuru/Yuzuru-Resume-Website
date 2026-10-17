#!/usr/bin/env bash
set -euo pipefail
[[ "$EUID" == 0 ]] || exit 1
cd "$(dirname "$0")"
expected="${1:?Expected SHA256 of the reviewed Caddyfile}"
actual="$(sha256sum /etc/caddy/Caddyfile | cut -d ' ' -f 1)"
[[ "$actual" == "$expected" ]] || { echo 'Caddy configuration changed; review again.' >&2; exit 1; }
[[ -s /srv/keykomi/current/web/index.html ]] || { echo 'Activate a valid release first.' >&2; exit 1; }
[[ ! -e /etc/caddy/sites/keykomi.caddy ]] || { echo 'Site file already exists.' >&2; exit 1; }
backup_dir="/var/backups/keykomi/$(date -u +%Y%m%dT%H%M%SZ)"
install -d -m 700 "$backup_dir"
cp -p /etc/caddy/Caddyfile "$backup_dir/Caddyfile"
restore_on_error() {
  local result=$?
  trap - EXIT
  if [[ "$result" != 0 ]]; then
    cp -p "$backup_dir/Caddyfile" /etc/caddy/Caddyfile
    rm -f /etc/caddy/sites/keykomi.caddy
    caddy validate --config /etc/caddy/Caddyfile
    systemctl reload caddy
    echo "Restored Caddyfile from $backup_dir" >&2
  fi
  exit "$result"
}
trap restore_on_error EXIT
install -d -m 755 /etc/caddy/sites
install -o root -g root -m 644 keykomi.caddy /etc/caddy/sites/keykomi.caddy
printf '\nimport /etc/caddy/sites/keykomi.caddy\n' >> /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
systemctl is-active --quiet caddy
printf 'Caddy site enabled. Backup: %s/Caddyfile\n' "$backup_dir"
