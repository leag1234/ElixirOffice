#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Install the same validated runtime and nginx configuration on an own dev instance.
set -euo pipefail
CONTAINER="${1:?usage: install-runtime-dev.sh own-container release-directory}"
RELEASE="${2:?}"
case "$CONTAINER" in eo-demo*) echo "never on the demo" >&2; exit 1;; eo) [ "${EO_ALLOW_MAIN:-0}" = 1 ] || { echo "use an own dev instance (lead: EO_ALLOW_MAIN=1)" >&2; exit 1; };; esac
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTEXT="$(mktemp -d)"
trap 'rm -rf "$CONTEXT"' EXIT
python3 "$HERE/prepare-runtime.py" "$RELEASE" "$CONTEXT"
ROOT="$(docker exec "$CONTAINER" printenv EO_ROOT)"
tar cf - -C "$CONTEXT" sdkjs | docker exec -i "$CONTAINER" tar xf - -C "$ROOT" --no-same-owner
docker exec "$CONTAINER" mkdir -p /usr/share/elixiroffice-wasm/nginx
tar cf - -C "$CONTEXT/nginx" . | docker exec -i "$CONTAINER" tar xf - -C /usr/share/elixiroffice-wasm/nginx --no-same-owner
docker exec "$CONTAINER" bash /usr/share/elixiroffice-wasm/nginx/configure.sh /usr/share/elixiroffice-wasm/nginx
docker exec "$CONTAINER" nginx -s reload
