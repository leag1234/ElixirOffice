#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Run the example integration app (start page) from the mounted source instead
# of the pkg binary baked into the dev image. Executed INSIDE a dev container
# (piped by `make example`). Idempotent; the change lasts until the container
# is recreated.
#   $1  source dir (default: the submodule under /develop)
#   $2  product name shown by the app (default: ElixirOffice)
set -euo pipefail
SRC="${1:-/develop/document-server-integration/web/documentserver-example/nodejs}"
APP_NAME="${2:-ElixirOffice}"
# EO_CONF/EO_LOG/COMPANY_NAME_LOW are set by the image (upstream or ours)
: "${EO_CONF:?EO_CONF not set: not a DocumentServer container?}"
CONF_DIR="${EO_CONF}-example"

cd "$SRC"
# runtime deps only; reinstall when the lock file changes
if [ ! -f node_modules/.package-lock.json ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  npm ci --omit=dev --no-audit --no-fund --loglevel=error
fi

# same program as the image's ds-example.conf, but node + sources
cat > /etc/supervisor/conf.d/ds-example.conf <<CONF
[program:example]
command=/usr/bin/node $SRC/bin/www
directory=$SRC/
user=ds
environment=HOME=/home/ds,NODE_ENV=production-linux,NODE_CONFIG_DIR=%(ENV_EO_CONF)s-example,NODE_DISABLE_COLORS=1,APPLICATION_NAME=%(ENV_COMPANY_NAME_LOW)s
stdout_logfile=%(ENV_EO_LOG)s/ds-example_out.log
stdout_logfile_backups=0
stdout_logfile_maxbytes=0
stderr_logfile=%(ENV_EO_LOG)s/ds-example_err.log
stderr_logfile_backups=0
stderr_logfile_maxbytes=0
autostart=true
CONF

# the image build sets appName to COMPANY_NAME in the config; in dev,
# node-config's local-<env>.json overrides appName (editor tab: "<file> - <name>")
# elixir.nextcloud.allowHttp: a dev container may connect to a local Nextcloud over plain http
# (docs/storage.md); production configurations keep the default (https only).
NC_HTTP="${ELIXIR_NC_ALLOW_HTTP:-true}"
case "$NC_HTTP" in true|false) ;; *) NC_HTTP=false ;; esac
printf '{ "server": { "appName": "%s" }, "elixir": { "nextcloud": { "allowHttp": %s } } }\n' "$APP_NAME" "$NC_HTTP" > "$CONF_DIR/local-production-linux.json"

supervisorctl reread >/dev/null
supervisorctl update example >/dev/null
supervisorctl restart example >/dev/null
for _ in $(seq 1 30); do
  if [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost/example/)" = 200 ]; then
    echo "example app running from $SRC"; exit 0
  fi
  sleep 1
done
echo "example app did not answer; see ${EO_LOG:-\$EO_LOG}/ds-example_err.log" >&2
exit 1
