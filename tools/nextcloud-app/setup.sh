#!/bin/bash
# SPDX-License-Identifier: AGPL-3.0-only
# Start (or update) the local Nextcloud of docs/storage.md and wire it to a
# document server container:
#   setup.sh <document server container> <document server public URL>
# e.g. setup.sh eo-nc http://localhost:8190/
# Env: NC_APP_DIR (app checkout, default $EO_WORK/upstream-extra/elixiroffice-nextcloud),
#      NC_PORT (8191), NC_ENV (local secrets file, default ~/.config/elixiroffice/nc-dev.env).
# Creates the test users alice and bob; their passwords are in NC_ENV (mode 600).
set -euo pipefail
DS=${1:?usage: setup.sh <ds container> <ds public url>}
DS_URL=${2:?usage: setup.sh <ds container> <ds public url>}
HERE=$(cd "$(dirname "$0")" && pwd)
export NC_APP_DIR=${NC_APP_DIR:-$HOME/elixiroffice/upstream-extra/elixiroffice-nextcloud}
export NC_PORT=${NC_PORT:-8191}
export NC_CONTAINER=${NC_CONTAINER:-elixir-nextcloud}
NC_ENV=${NC_ENV:-$HOME/.config/elixiroffice/nc-dev.env}
if [ ! -f "$NC_ENV" ]; then
  mkdir -p "$(dirname "$NC_ENV")"; umask 077
  gen() { head -c 18 /dev/urandom | base64 | tr -d "/+=" ; }
  printf "NC_ADMIN_PASSWORD=%s\nNC_ALICE_PASSWORD=%s\nNC_BOB_PASSWORD=%s\n" "$(gen)" "$(gen)" "$(gen)" > "$NC_ENV"
fi
chmod 600 "$NC_ENV"
set -a; . "$NC_ENV"; set +a

docker compose -f "$HERE/docker-compose.yml" up -d
occ() { docker exec -u www-data "$NC_CONTAINER" php occ "$@"; }
printf "waiting for Nextcloud"
for _ in $(seq 1 120); do
  occ status --output=json 2>/dev/null | grep -q "\"installed\":true" && break
  printf "."; sleep 3
done
echo
docker network connect elixir-nc "$DS" 2>/dev/null || true

occ config:system:set trusted_domains 10 --value=localhost >/dev/null
occ config:system:set trusted_domains 11 --value=172.17.0.1 >/dev/null
occ config:system:set trusted_domains 12 --value="$NC_CONTAINER" >/dev/null
occ config:system:set allow_local_remote_servers --value=true --type=boolean >/dev/null
# local test instance only: the Playwright suites log in many times in a row
occ config:system:set auth.bruteforce.protection.enabled --value=false --type=boolean >/dev/null
occ config:system:set ratelimit.protection.enabled --value=false --type=boolean >/dev/null
docker exec "$NC_CONTAINER" rm -rf /var/www/html/custom_apps/onlyoffice /var/www/html/apps/richdocuments 2>/dev/null || true
occ app:disable firstrunwizard >/dev/null 2>&1 || true   # no welcome wizard over the Files list in tests
occ app:enable elixiroffice
SECRET=$(docker exec "$DS" printenv JWT_SECRET)
occ config:app:set elixiroffice DocumentServerUrl --value="$DS_URL" >/dev/null
occ config:app:set elixiroffice DocumentServerInternalUrl --value="http://$DS/" >/dev/null
occ config:app:set elixiroffice StorageUrl --value="http://$NC_CONTAINER/" >/dev/null
occ config:app:set elixiroffice VerifyPeerOff --value=true >/dev/null
occ config:app:set elixiroffice jwt_secret --value="$SECRET" >/dev/null
for u in alice bob; do
  case $u in alice) N="Alice Martin"; P=$NC_ALICE_PASSWORD;; bob) N="Bob Durand"; P=$NC_BOB_PASSWORD;; esac
  if ! occ user:info "$u" >/dev/null 2>&1; then
    docker exec -u www-data -e OC_PASS="$P" "$NC_CONTAINER" php occ user:add --password-from-env --display-name="$N" "$u" >/dev/null
    occ user:setting "$u" settings email "$u@example.test" >/dev/null || true
  fi
done
occ elixiroffice:documentserver --check || true
echo "Nextcloud: http://localhost:$NC_PORT/  (users admin, alice, bob; passwords in $NC_ENV)"
