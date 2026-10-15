#!/bin/bash
# Apply the server side of the elixir/perf fixes (docs/perf.md, fixes 3 to 5) to a
# running dev container, without recreating it. Run as root inside the container
# (make perf-tuning). Idempotent: a rerun only recompresses what changed.
#
# A fresh container gets the same settings from the image (entrypoint
# NGINX_WORKER_PROCESSES=auto and STATIC_GZIP=true, document-server-package
# nginx config and gzip script); an existing dev container keeps the config it
# was created with, hence this script.
set -euo pipefail

PKG=/develop/document-server-package/common/documentserver
GZIP_SH=/usr/bin/documentserver-static-gzip.sh
NGINX_CONF=/etc/nginx/nginx.conf

# Install prefix (<company>/documentserver), read from the installed script.
PREFIX=$(sed -n 's#^DIR="/var/www/\(.*\)"$#\1#p' "$GZIP_SH")
[ -n "$PREFIX" ] || { echo "perf-tuning: cannot read the install prefix from $GZIP_SH" >&2; exit 1; }
DS_CONF=/etc/$PREFIX/nginx/includes/ds-docservice.conf

# 1. One nginx worker per core instead of one (fix 4).
if grep -q '^worker_processes auto;' "$NGINX_CONF"; then
  echo "nginx: worker_processes auto (already)"
else
  sed -i 's/^worker_processes.*/worker_processes auto;/' "$NGINX_CONF"
  echo "nginx: worker_processes auto"
fi

# 2. Versioned api.js cacheable like the other static files; only the
#    unversioned URL stays no-store (fix 5, ds-docservice.conf.m4).
export OLD='location ~ ^(\/[\d]+\.[\d]+\.[\d]+[\.|-][\w]+)?\/(web-apps\/apps\/api\/documents\/api\.js)$ {'
export NEW='location ~ ^\/(web-apps\/apps\/api\/documents\/api\.js)$ {'
if grep -qF "$OLD" "$DS_CONF"; then
  perl -0pi -e 'my $o = quotemeta($ENV{OLD}); s{$o(.*?)alias(\s+)(\S+)/\$2;}{$ENV{NEW}$1alias$2$3/\$1;}s' "$DS_CONF"
  grep -qF "$NEW" "$DS_CONF" || { echo "perf-tuning: api.js location not rewritten" >&2; exit 1; }
  echo "nginx: versioned api.js cacheable"
else
  echo "nginx: versioned api.js cacheable (already)"
fi

# 3. Incremental, parallel static gzip script from the mounted
#    document-server-package checkout (fix 3), then run it: it (re)compresses
#    what is missing or stale, turns gzip_static on and reloads nginx.
TMP=$(mktemp)
sed "s#M4_DS_PREFIX#$PREFIX#g" "$PKG/bin/documentserver-static-gzip.sh.m4" > "$TMP"
if cmp -s "$TMP" "$GZIP_SH"; then
  echo "static gzip: script up to date"
else
  install -m 755 "$TMP" "$GZIP_SH"
  echo "static gzip: script installed from document-server-package"
fi
rm -f "$TMP"

nginx -t -q
START=$(date +%s)
"$GZIP_SH" >/dev/null
echo "static gzip: done in $(( $(date +%s) - START )) s, gzip_static on in $(grep -c '^[[:space:]]*gzip_static on' "$DS_CONF") locations, nginx reloaded"
