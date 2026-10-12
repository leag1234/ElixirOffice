#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Shared by the runtime image layer and explicit dev installation.
set -euo pipefail
SOURCE="${1:?usage: configure.sh nginx-template-directory}"
: "${EO_ROOT:?}" "${EO_CONF:?}"
CONF="$EO_CONF/nginx/includes"
install -m 644 "$SOURCE/http.conf" /etc/nginx/conf.d/elixiroffice-wasm.conf
sed "s|@ROOT@|$EO_ROOT|g" "$SOURCE/locations.conf" > "$CONF/ds-wasm-runtime.conf"
INCLUDE="include $CONF/ds-wasm-runtime.conf;"
if ! grep -qxF "$INCLUDE" "$CONF/ds-docservice.conf"; then
  sed -i "1i $INCLUDE" "$CONF/ds-docservice.conf"
fi
nginx -t -q
