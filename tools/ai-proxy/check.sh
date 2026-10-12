#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Admin check of the Elixir AI server configuration (make ai-check).
#   tools/ai-proxy/check.sh [server-url]
# 1. shows the configuration found (the key is never printed);
# 2. calls the provider directly with a one-token request (reachability, key, model);
# 3. with a server URL (default http://localhost:8080 when it answers), checks that /elixir-ai/config.json is
#    consistent, that it does not contain the key, and that a request through the server proxy works.
# Exit status 0 when AI is off by design or everything works, 1 otherwise.
set -uo pipefail
. "$(dirname "$0")/common.sh"
SERVER="${1:-${ELIXIR_AI_SERVER:-http://localhost:8080}}"
ok() { echo "  ok    $*"; }; bad() { echo "  FAIL  $*"; FAILED=1; }; FAILED=0
echo "Elixir AI configuration (env, then $ENV_FILE)"
if [ -z "$AI_BASE" ]; then
  echo "  AI is OFF: no ELIXIR_AI_BASE_URL and no API key. The editor works fully and hides its AI entry points;"
  echo "  users can still connect their own service in File > AI. To enable: see docs/ai.md and .env.example."
else
  echo "  base URL : $AI_BASE"; echo "  model    : ${AI_MODEL:-(default of the server)}"; echo "  key      : $([ -n "$AI_KEY" ] && echo "set (${#AI_KEY} characters, not shown)" || echo "none (fine for Ollama and keyless endpoints)")"
  [[ "$AI_BASE" =~ ^https?://[A-Za-z0-9._:-]+(/[A-Za-z0-9._~%/-]*)?$ ]] && ok "base URL syntax" || bad "base URL syntax (letters, digits . _ : - and path only)"
  M="${AI_MODEL:-gpt-4.1-mini}"
  BODY=$(printf '{"model":"%s","messages":[{"role":"user","content":"Reply with: ok"}],"max_tokens":5}' "$M")
  R=$(curl -sS -m 30 -o /tmp/.eo-ai-check.$$ -w '%{http_code}' -H 'Content-Type: application/json' ${AI_KEY:+-H "Authorization: Bearer $AI_KEY"} -d "$BODY" "$AI_BASE/chat/completions" 2>&1) || true
  if [ "$R" = "200" ]; then ok "provider answers (HTTP 200) for model $M"
  else bad "provider call: ${R:-no answer} $(head -c 200 /tmp/.eo-ai-check.$$ 2>/dev/null | tr -d '\n' | sed "s/${AI_KEY:-@@@@}/***/g")"; fi
  rm -f /tmp/.eo-ai-check.$$
fi
echo "Server $SERVER"
CJ=$(curl -sS -m 10 "$SERVER/elixir-ai/config.json" 2>/dev/null) || CJ=""
if [ -z "$CJ" ]; then echo "  (server not reachable here, skipped; run on the host that serves the editor or pass its URL)"
else
  echo "  config.json: $CJ"
  [ -n "$AI_KEY" ] && case "$CJ" in *"$AI_KEY"*) bad "config.json CONTAINS THE KEY" ;; *) ok "config.json does not contain the key" ;; esac
  case "$CJ" in
    *'"enabled":false'*) [ -n "$AI_BASE" ] && bad "server says AI is off but a configuration exists: run make ai-proxy (dev) or restart the container (image)" || ok "server and configuration agree: AI off" ;;
    *'"endpoint"'*) R=$(curl -sS -m 40 -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' -d "$(printf '{"model":"%s","messages":[{"role":"user","content":"Reply with: ok"}],"max_tokens":5}' "${AI_MODEL:-gpt-4.1-mini}")" "$SERVER/elixir-ai/v1/chat/completions" 2>&1)
      [ "$R" = "200" ] && ok "request through the server proxy works (HTTP 200)" || bad "request through the server proxy: HTTP $R" ;;
    *) bad "unexpected config.json" ;;
  esac
fi
exit $FAILED
