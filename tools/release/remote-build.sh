#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Invoked only in a fresh, caller-owned release folder over verified SSH.
set -euo pipefail
export PYTHONDONTWRITEBYTECODE=1
# Build/audit stages inherit no ambient credentials or GUI capabilities.
if [ "${EO_RELEASE_CLEAN_ENV:-}" != yes ]; then
  if [ "$(/usr/bin/uname -s)" = Darwin ]; then
    if [ "$(/usr/sbin/sysctl -n hw.optional.arm64 2>/dev/null)" != 1 ]; then
      echo "Mac release requires Apple Silicon arm64 hardware" >&2
      exit 1
    fi
    exec /usr/bin/env -i PATH=/usr/bin:/bin:/usr/local/bin HOME="$HOME" \
      LANG=C.UTF-8 PYTHONDONTWRITEBYTECODE=1 EO_RELEASE_CLEAN_ENV=yes \
      /usr/bin/arch -arm64 /bin/bash "${BASH_SOURCE[0]}" "$@"
  fi
  exec /usr/bin/env -i PATH=/usr/bin:/bin:/usr/local/bin HOME="$HOME" \
    LANG=C.UTF-8 PYTHONDONTWRITEBYTECODE=1 EO_RELEASE_CLEAN_ENV=yes \
    /bin/bash "${BASH_SOURCE[0]}" "$@"
fi
MODE="$1"
TASK_ROOT="$2"
RUN_SMOKE="${3:-yes}"
SYSTEM=$(uname -s)
MACHINE=$(uname -m)
if [ "$MODE" = mac ]; then
  if [ "$SYSTEM/$MACHINE" != Darwin/arm64 ]; then
    echo "Mac release requires Darwin arm64; observed $SYSTEM $MACHINE" >&2
    exit 1
  fi
elif [ "$MODE" = linux ]; then
  if [ "$SYSTEM/$MACHINE" != Linux/x86_64 ]; then
    echo "Linux release requires Linux x86_64; observed $SYSTEM $MACHINE" >&2
    exit 1
  fi
else
  echo "Unknown release platform: $MODE" >&2
  exit 1
fi
EXPECTED_TEST_UPSTREAM_SHA="${4:?Supply test_upstream.manifest_sha256 from BUILD-INFO.json}"
cd "$TASK_ROOT"
mkdir -p results profiles tmp test-tools
export TMPDIR="$TASK_ROOT/tmp"
export EO_DESKTOP_ROOT="$TASK_ROOT"
export EO_PLAYWRIGHT="$TASK_ROOT/test-tools/playwright-core"
export XDG_CONFIG_HOME="$TASK_ROOT/profiles/config"
export XDG_DATA_HOME="$TASK_ROOT/profiles/data"
export XDG_CACHE_HOME="$TASK_ROOT/profiles/cache"
export GSETTINGS_BACKEND=memory
export EO_RELEASE_REQUIRE_BUILDER=1
export EO_UPSTREAM="$TASK_ROOT/cache/home/elixiroffice/DocumentServer"
export DBUS_SESSION_BUS_ADDRESS="unix:path=$TASK_ROOT/profiles/no-session-bus"
python3 - "$EO_UPSTREAM" "$EXPECTED_TEST_UPSTREAM_SHA" "$TASK_ROOT/tools/release/desktop-test-inputs.json" <<'PY'
import hashlib,json,pathlib,sys
root=pathlib.Path(sys.argv[1])
data=(root/'INPUTS.json').read_bytes()
assert len(sys.argv[2])==64 and hashlib.sha256(data).hexdigest()==sys.argv[2], 'Test source manifest pin mismatch'
manifest=json.loads(data)
inventory=pathlib.Path(sys.argv[3])
assert not inventory.is_symlink() and hashlib.sha256(inventory.read_bytes()).hexdigest()==manifest["inventory_sha256"], "Desktop test inventory mismatch"
for name,expected in manifest['files'].items():
    path=pathlib.Path(name)
    assert not path.is_absolute() and '..' not in path.parts
    file=root/path
    assert not file.is_symlink() and file.stat().st_size==expected['bytes']
    assert hashlib.sha256(file.read_bytes()).hexdigest()==expected['sha256']
PY
if [ "$MODE" = mac ]; then
  echo "Mac build architecture: $(uname -m)"
  python3 - "$TASK_ROOT" <<'PY'
import hashlib, pathlib, sys, urllib.request
root=pathlib.Path(sys.argv[1]);archive=root/'test-tools/node-arm64.tar.gz'
url='https://nodejs.org/dist/v22.23.3/node-v22.23.3-darwin-arm64.tar.gz'
with urllib.request.urlopen(url,timeout=120) as response:archive.write_bytes(response.read())
assert hashlib.sha256(archive.read_bytes()).hexdigest()=='23b25245dcfb9af7262f8ff142e9e2e0af025368117329e7a7458a51e5922f53'

PY
  tar -xzf test-tools/node-arm64.tar.gz -C test-tools
  export PATH="$TASK_ROOT/test-tools/node-v22.23.3-darwin-arm64/bin:$PATH"
  export MAC_BUILD_CACHE="$TASK_ROOT/cache"
  bash tools/desktop/mac.sh > results/mac-package.log 2>&1
  node tools/desktop/check-mac.cjs desktop/dist "$TASK_ROOT/accepted-mac" > results/mac-artifact-audit.log 2>&1
  if [ "$RUN_SMOKE" = no ]; then exit 0; fi
  export EO_PACKAGE_EXECUTABLE="$TASK_ROOT/accepted-mac/ElixirOffice.app/Contents/MacOS/ElixirOffice"
  node tests/desktop/mac-unattended.cjs > results/existing-mac-smoke.log 2>&1
else
  echo "Linux build architecture: $(uname -m)"
  export PATH="$TASK_ROOT/test-tools:$PATH"
  APPIMAGE=$(python3 -c 'import pathlib;files=list(pathlib.Path(".").glob("*.AppImage"));assert len(files)==1;print(files[0])')
  chmod u+x "$APPIMAGE"
  "./$APPIMAGE" --appimage-extract > results/appimage-extract.log 2>&1
  export EO_PACKAGE_EXECUTABLE="$TASK_ROOT/squashfs-root/elixiroffice"
  python3 tests/desktop/verify-resources.py squashfs-root/resources/assets > results/linux-resource-audit.log 2>&1
  python3 tests/desktop/check-samples.py squashfs-root/resources/assets > results/linux-sample-audit.log 2>&1
  export DISPLAY=:0
  EO_PACKAGE_LABEL=beta2-D node tests/desktop/package.cjs > results/existing-linux-smoke.log 2>&1
fi
node tools/release/packaged-smoke.cjs > results/six-format-smoke.log 2>&1
