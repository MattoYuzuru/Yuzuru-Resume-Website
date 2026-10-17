#!/usr/bin/env bash
# Run once as administrator, after reviewing the deployment plan.
set -euo pipefail
[[ "$EUID" == 0 ]] || { echo 'Run as root' >&2; exit 1; }
cd "$(dirname "$0")"
public_key="${1:?Path to the dedicated deployment public key}"
[[ "$(head -c 12 "$public_key")" == 'ssh-ed25519 ' ]] || exit 2
if getent passwd keykomi-deploy >/dev/null; then
  echo 'Deployment account already exists; inspect it before changing access.' >&2
  exit 1
fi
useradd --system --home-dir /var/lib/keykomi-deploy --shell /bin/sh --create-home keykomi-deploy
install -d -o root -g root -m 755 /var/lib/keykomi-deploy/.ssh
chown root:root /var/lib/keykomi-deploy
chmod 755 /var/lib/keykomi-deploy
{ printf 'restrict,command="/usr/bin/python3 /usr/local/libexec/keykomi-release.py" '; cat "$public_key"; } > /var/lib/keykomi-deploy/.ssh/authorized_keys
chown root:root /var/lib/keykomi-deploy/.ssh/authorized_keys
chmod 644 /var/lib/keykomi-deploy/.ssh/authorized_keys
install -d -o root -g root -m 755 /usr/local/libexec
install -o root -g root -m 755 receive.py /usr/local/libexec/keykomi-release.py
install -d -o keykomi-deploy -g keykomi-deploy -m 755 /srv/keykomi /srv/keykomi/releases /srv/keykomi/shared
printf 'Restricted account and release directories prepared. Caddy has not been changed.\n'
