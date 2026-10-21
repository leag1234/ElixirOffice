#!/usr/bin/env bash
# Install the Elixir AI server-managed proxy into a running dev container.
# The browser calls /elixir-ai/v1/chat/completions on the document server; nginx forwards it to the
# configured OpenAI-compatible endpoint and adds the key (never sent to the browser). With no
# configuration the container answers /elixir-ai/config.json with {"enabled":false}: AI is off.
# Configuration: ELIXIR_AI_BASE_URL, ELIXIR_AI_MODEL, ELIXIR_AI_API_KEY in the environment or in .env
# (docs/ai.md, .env.example). The nginx include is produced by build/scripts/standalone/elixir-ai-conf.sh
# of the mounted sources, the same script the image entrypoint runs.
# Usage: tools/ai-proxy/install.sh <container> [model]    (model overrides ELIXIR_AI_MODEL)
set -euo pipefail
C=${1:?container}
. "$(dirname "$0")/common.sh"
[ -n "${2:-}" ] && AI_MODEL=$2
GEN=/develop/build/scripts/standalone/elixir-ai-conf.sh
docker exec "$C" test -f "$GEN" || { echo "$GEN missing in $C (container not mounted on a tree with the AI config script)" >&2; exit 1; }
AI_ENV_FILE=$(mktemp "${TMPDIR:-/tmp}/eo-ai-env.XXXXXX")
chmod 600 "$AI_ENV_FILE"
trap 'rm -f "$AI_ENV_FILE"' EXIT
{ printf 'ELIXIR_AI_BASE_URL=%s\nELIXIR_AI_MODEL=%s\nELIXIR_AI_API_KEY=%s\nEO_AI_CA_FILE=%s\n' "$AI_BASE" "$AI_MODEL" "$AI_KEY" "$AI_CA_FILE"; } > "$AI_ENV_FILE"
docker exec -i --env-file "$AI_ENV_FILE" "$C" sh -c "umask 077; sh $GEN > /etc/nginx/includes/ds-elixir-ai.conf && nginx -t -q && service nginx reload >/dev/null"
if [ -n "$AI_BASE" ]; then echo "Elixir AI proxy installed in $C ($AI_BASE, model ${AI_MODEL:-default}, key $([ -n "$AI_KEY" ] && echo set || echo none))"
else echo "Elixir AI is not configured: $C answers {\"enabled\":false} (set ELIXIR_AI_BASE_URL / ELIXIR_AI_API_KEY, see .env.example)"; fi
