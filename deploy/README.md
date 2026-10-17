# Deployment

The server serves static files with Caddy. It does not build the site or run Node. Existing server services are outside this deployment.

## First setup

The reviewed one-time setup is `sudo bash deploy/bootstrap.sh /path/to/deploy.pub`, then upload and activate a validated release. Run `sudo bash deploy/configure-caddy.sh EXPECTED_CADDYFILE_SHA256` only after that release is ready. The latter refuses a changed Caddyfile and restores it if validation or reload fails. Save its printed backup path for the first-release rollback.

A server administrator installs `receive.py` as `/usr/local/libexec/keykomi-release.py`, owned by root and not writable by the deployment user. Create a locked, dedicated `keykomi-deploy` account and `/srv/keykomi/releases` plus `/srv/keykomi/shared`, writable only by that account. The account does not need sudo.

Its SSH key must be restricted with:

```
restrict,command="/usr/bin/python3 /usr/local/libexec/keykomi-release.py" ssh-ed25519 PUBLIC_KEY
```

Keep the account's home and `.ssh/authorized_keys` owned by root, readable but not writable by the account. The forced command accepts only upload, activate, rollback and status. Uploaded archives reject traversal, links, special files, oversized files and mismatched hashes.

Install `keykomi.caddy` as a separate site file. Back up the existing Caddyfile, append its import without changing existing sites, run `caddy validate`, then reload Caddy. No firewall, SSH or Docker changes are needed.

Add these repository secrets to GitHub Actions:

- `DEPLOY_HOST`: server hostname or IP
- `DEPLOY_USER`: `keykomi-deploy`
- `DEPLOY_SSH_KEY`: dedicated private key
- `DEPLOY_KNOWN_HOSTS`: host key verified through the existing trusted SSH connection

Private keys do not belong in the repository. The old general-purpose SSH key is not reused.

## Releases

CI checks types, tests and atlas references, then builds the static site. A push to main deploys it. The workflow can also be run manually from main. Pull requests cannot deploy or read deployment secrets.

For a manual deployment after `pnpm verify` and `pnpm build`:

```sh
KEYKOMI_DEPLOY_TARGET=keykomi-deploy@your-server pnpm run deploy
```

Files go to `/srv/keykomi/releases/COMMIT-RUN-ATTEMPT/web`. The receiver verifies every hash before an atomic switch of `/srv/keykomi/current`. Old hashed JS and CSS remain in `shared/_astro` for open browser tabs. Caddy needs no reload for normal releases.

The first deployment creates the site. Later deployments retain the previous release. Nothing automatically prunes releases or other server data.

## Rollback

```sh
ssh keykomi-deploy@your-server rollback
python3 deploy/smoke.py https://keykomi.com
```

This switches to the previous validated release. CI rolls back automatically if its public HTTPS smoke check fails after a successful activation. A failed first deployment has no prior release; the administrator restores the saved Caddy configuration or fixes the site. Do not retry an ambiguous upload or activation without checking `status` first.
