#!/bin/bash
# Same native Playwright browsers as the normal run, in own systemd user scopes.
set -euo pipefail
: "${EO_BASE:?own instance required}"
: "${EO_LOCAL_FIXTURES:?public verified100 fixture folder required}"
: "${EO_BUDGET_OUT:?output directory required}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
NODE="$HOME/elixiroffice/node-v22.23.3-linux-x64/bin/node"
BUDGET="${EO_BROWSER_BUDGET:-1G}"
export XDG_RUNTIME_DIR="/run/user/$(id -u)"
mkdir -p "$EO_BUDGET_OUT"
failures=0
for engine in chromium firefox webkit; do
 mkdir -p "$EO_BUDGET_OUT/$engine"
 set +e
 EO_ENGINE="$engine" EO_LOCAL_ALL=1 EO_LOCAL_MIN_PAGES=100 EO_LOCAL_PACKAGED=1 \
 EO_LOCAL_OUT="$EO_BUDGET_OUT/$engine/outputs" EO_CGROUP_REPORT=1 EO_MEMORY_REPORT="$EO_BUDGET_OUT/$engine/memory.json" \
 systemd-run --user --scope --unit "eo-w4-A-native-budget-$BUDGET-$engine" \
  -p "MemoryMax=$BUDGET" -p MemorySwapMax=0 /usr/bin/timeout 180 \
  "$NODE" --require "$ROOT/tests/browsers/engine.cjs" "$ROOT/tests/local-mode/editor-browser.mjs" \
  > "$EO_BUDGET_OUT/$engine/run.log" 2>&1
 rc=$?
 set -e
 printf '{"engine":"%s","budget":"%s","swapMax":0,"exitCode":%s}\n' "$engine" "$BUDGET" "$rc" > "$EO_BUDGET_OUT/$engine/result.json"
 echo "$engine native-budget=$BUDGET exit=$rc"
 if [ "$rc" -ne 0 ]; then failures=$((failures+1)); fi
done
[ "$failures" = 0 ]
