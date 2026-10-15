# Shared by install.sh and check.sh: reads the Elixir AI server configuration.
# Sources, in this order: environment variables, then the file named by ELIXIR_AI_ENV (default: .env of
# the repository). The file is parsed line by line (KEY=value), never executed.
# Variables: ELIXIR_AI_BASE_URL, ELIXIR_AI_MODEL, ELIXIR_AI_API_KEY (legacy: OPENAI_API_KEY).
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ELIXIR_AI_ENV:-$ROOT/.env}"
getvar() { # name: environment first, then the file
  local v="${!1:-}"
  if [ -z "$v" ] && [ -f "$ENV_FILE" ]; then
    v=$(grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- | sed -e 's/^["'"'"']//' -e 's/["'"'"'[:space:]]*$//')
  fi
  printf '%s' "$v"
}
AI_BASE=$(getvar ELIXIR_AI_BASE_URL); AI_MODEL=$(getvar ELIXIR_AI_MODEL); AI_KEY=$(getvar ELIXIR_AI_API_KEY)
[ -z "$AI_KEY" ] && [ -z "$AI_BASE" ] && AI_KEY=$(getvar OPENAI_API_KEY)
[ -z "$AI_BASE" ] && [ -n "$AI_KEY" ] && AI_BASE="https://api.openai.com/v1"
AI_BASE="${AI_BASE%/}"
