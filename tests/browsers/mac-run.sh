#!/bin/bash
# Prepared on development host; execute only when the owner launches it on the Mac.
set -euo pipefail
[ "$(uname -s)" = Darwin ] || { echo "Owner Mac required" >&2; exit 1; }
: "${1:?usage: mac-run.sh ABSOLUTE_PUBLIC_DOCX OUTPUT_DIR}"
: "${2:?output directory required}"
REMOTE_PORT="${EO_REMOTE_PORT:-32786}"
TUNNEL_PORT="${EO_TUNNEL_PORT:-18083}"
[ "$REMOTE_PORT" != 8080 ] || { echo "Lead instance forbidden" >&2; exit 1; }
ssh -o ExitOnForwardFailure=yes -N -L "127.0.0.1:$TUNNEL_PORT:127.0.0.1:$REMOTE_PORT" "${EO_FIRE:-gael@192.0.2.10}" &
tunnel=$!
trap 'kill "$tunnel" 2>/dev/null || true' EXIT
export EO_BASE="http://127.0.0.1:$TUNNEL_PORT"
healthy=false
for attempt in {1..30}; do
  kill -0 "$tunnel"
  if curl -fsS "$EO_BASE/healthcheck" >/dev/null; then healthy=true; break; fi
  sleep 1
done
[ "$healthy" = true ] || { echo "Tunnel health check failed" >&2; exit 1; }
node "$(dirname "$0")/mac-native.mjs" "$1" "$2"
