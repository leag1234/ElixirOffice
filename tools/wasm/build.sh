#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Reproducible build of the x2t converter (DocumentServer core) to WebAssembly.
#
# usage: tools/wasm/build.sh [WORK_DIR]
#   CORE_REPO   git URL or path of the core repository   (default: $UPSTREAM/core, as in the Makefile)
#   CORE_REF    branch/tag/commit to build                 (default: elixir/dev if present, else main)
#   VARIANTS    "st" and/or "mt" (pthreads)                (default: st)
#   PDF_ONLY    1 = drawing stream to PDF only; 0 = full x2t (default)
#   JOBS        parallel jobs                              (default: nproc)
#   LINK_OPT    optimisation level for the final link      (default: -O1)
#   POST_OPT    wasm-opt level run after the link          (default: -O2; "" = none)
#   EXCEPTIONS  -fexceptions (JS-emulated) or -fwasm-exceptions (native EH, default: -fexceptions)
#
# Everything (sources, deps, build trees, caches) stays under WORK_DIR; the
# checkout of the core is a fresh clone, patched with tools/wasm/patches/*.patch.
# Output: WORK_DIR/out/<variant>/x2t.js, x2t.wasm (+ .br/.gz), manifest.json and sizes.txt.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK="$(mkdir -p "${1:-$PWD/wasm-work}" && cd "${1:-$PWD/wasm-work}" && pwd)"
CORE_REPO="${CORE_REPO:-${UPSTREAM:-$HOME/elixiroffice/DocumentServer}/core}"
CORE_REF="${CORE_REF:-}"
VARIANTS="${VARIANTS:-st}"
PDF_ONLY="${PDF_ONLY:-0}"
TARGET=x2t; BINARY=x2t; KIND=full
if [ "$PDF_ONLY" = 1 ]; then TARGET=pdf_runtime; BINARY=pdf-runtime; KIND=pdf; fi
JOBS="${JOBS:-$(nproc)}"
LINK_OPT="${LINK_OPT:--O1}"
POST_OPT="${POST_OPT--O2}"
EXCEPTIONS="${EXCEPTIONS:--fexceptions}"
BOOST_DIR=boost; [ "$EXCEPTIONS" = -fexceptions ] || BOOST_DIR=boost-eh   # Boost must use the same exception model
IMAGE="eo-wasm-emsdk:5.0.4"
BOOST_VER="1.83.0"
BOOST_SHA256="c5a0688e1f0c05f354bbd0b32244d36085d9ffc9f932e8a18983a9908096f614"

log() { printf '\n== %s\n' "$*"; }
dk() {
  docker run --rm -u "$(id -u):$(id -g)" -e HOME=/w/home -e EM_CACHE=/w/em-cache -e CCACHE_DIR=/w/ccache \
    -v "$WORK:/w" -v "$HERE:/tools:ro" -w /w "$IMAGE" bash -euo pipefail -c "$*"
}

mkdir -p "$WORK"/{home,em-cache,ccache,deps,build,out}

log "build image $IMAGE"
docker build -q -t "$IMAGE" "$HERE" >/dev/null

log "core sources"
if [ ! -d "$WORK/core/.git" ]; then
  git clone -q "$CORE_REPO" "$WORK/core"
fi
if [ -z "$CORE_REF" ]; then
  CORE_REF=$(git -C "$WORK/core" rev-parse -q --verify origin/elixir/dev >/dev/null && echo origin/elixir/dev || echo origin/HEAD)
fi
git -C "$WORK/core" checkout -q -f -B wasm-build "$CORE_REF"
git -C "$WORK/core" clean -q -fdx
for p in "$HERE"/patches/*.patch; do
  git -C "$WORK/core" apply "$p"
  echo "applied $(basename "$p")"
done
echo "core at $(git -C "$WORK/core" rev-parse --short HEAD) (+$(ls "$HERE"/patches/*.patch | wc -l) patches)"

log "boost $BOOST_VER for wasm"
if [ ! -f "$WORK/deps/$BOOST_DIR/lib/libboost_filesystem.a" ]; then
  tarball="$WORK/deps/boost-$BOOST_VER.tar.xz"
  [ -f "$tarball" ] || curl -sSL -o "$tarball" "https://github.com/boostorg/boost/releases/download/boost-$BOOST_VER/boost-$BOOST_VER.tar.xz"
  echo "$BOOST_SHA256  $tarball" | sha256sum -c -
  tar -C "$WORK/deps" -xf "$tarball"
  dk "cd deps && emcmake cmake -S boost-$BOOST_VER -B boost-build-$BOOST_DIR -G Ninja -DCMAKE_BUILD_TYPE=Release \
        -DCMAKE_CXX_FLAGS='-Os -fms-extensions $EXCEPTIONS' -DCMAKE_C_FLAGS=$EXCEPTIONS -DCMAKE_INSTALL_PREFIX=/w/deps/$BOOST_DIR -DBUILD_SHARED_LIBS=OFF \
        -DBOOST_INCLUDE_LIBRARIES='system;filesystem;regex;date_time' >/dev/null \
      && cmake --build boost-build-$BOOST_DIR -j$JOBS >/dev/null && cmake --install boost-build-$BOOST_DIR >/dev/null \
      && mkdir -p $BOOST_DIR/include \
      && for d in boost-$BOOST_VER/libs/*/include boost-$BOOST_VER/libs/numeric/*/include; do cp -r --update=none \$d/boost $BOOST_DIR/include/; done"
fi

log "third-party sources used by the core (fetched by its own script)"
dk "python3 core/Common/3dParty/build_3rdparty.py --only=html,apple,md,socketio /w/third_party/work /w/third_party/install >/w/build/3rdparty.log 2>&1"

for v in $VARIANTS; do
  log "configure + build: $v"
  threads=OFF; [ "$v" = mt ] && threads=ON
  dk "emcmake cmake -S /tools/cmake -B build/$v -G Ninja -DCMAKE_BUILD_TYPE=Release \
        -DCMAKE_C_COMPILER_LAUNCHER=ccache -DCMAKE_CXX_COMPILER_LAUNCHER=ccache \
        -DEO_CORE_DIR=/w/core -DEO_WASM_BOOST=/w/deps/$BOOST_DIR -DEO_CORE_3RD_PARTY_DIR=/w/third_party \
        -DEO_CORE_OUTPUT_DIR=/w/build/$v/dist -DEO_WASM_THREADS=$threads -DEO_WASM_EXCEPTIONS=$EXCEPTIONS \
        -DCMAKE_EXE_LINKER_FLAGS_RELEASE='$LINK_OPT' >/w/build/configure-$v.log 2>&1 \
      && cmake --build build/$v --target $TARGET -j$JOBS > /w/build/build-$v.log 2>&1"
  # A -O2 link inlines every static initialiser into __wasm_call_ctors: one
  # 37 MB function, above V8's 7.65 MB per-function limit (Chrome, Node,
  # Electron refuse the module). So: link at -O1, then wasm-opt with the
  # initialisers kept out of line. The binary has no name section; add-names.py
  # rebuilds one from the symbol map so that --no-inline can match them.
  # wasm-opt runs passes in command-line order: --no-inline must come first.
  # The binary carries no target_features section: list Emscripten's defaults.
  features="--enable-bulk-memory --enable-bulk-memory-opt --enable-nontrapping-float-to-int --enable-sign-ext \
    --enable-mutable-globals --enable-reference-types --enable-multivalue"
  [ "$v" = mt ] && features="$features --enable-threads"
  [ "$EXCEPTIONS" = -fwasm-exceptions ] && features="$features --enable-exception-handling"
  if [ -n "$POST_OPT" ]; then
    dk "python3 /tools/add-names.py build/$v/$BINARY/x2t.wasm build/$v/$BINARY/x2t.js.symbols build/$v/x2t-named.wasm \
        && /emsdk/upstream/bin/wasm-opt build/$v/x2t-named.wasm $features '--no-inline=_GLOBAL__sub_I_*' $POST_OPT \
             --strip-debug -o build/$v/$BINARY/x2t.wasm && rm build/$v/x2t-named.wasm"
  fi
  dk "mkdir -p out/$v && cp build/$v/$BINARY/x2t.js build/$v/$BINARY/x2t.wasm out/$v/ \
      && cd out/$v && brotli -f -q 11 x2t.wasm x2t.js && gzip -n -f -k -9 x2t.wasm x2t.js \
      && ls -l x2t.js x2t.js.br x2t.js.gz x2t.wasm x2t.wasm.br x2t.wasm.gz | awk '{print \$5, \$9}' | tee sizes.txt"
  python3 "$HERE/manifest.py" "$WORK/out/$v" "$WORK/core" "$HERE" \
    --exceptions="$EXCEPTIONS" --link-opt="$LINK_OPT" --post-opt="$POST_OPT" --variant="$v" --kind="$KIND" \
    --image-id="$(docker image inspect --format '{{.Id}}' "$IMAGE")"
  version=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["artifact_version"])' "$WORK/out/$v/manifest.json")
  release="$WORK/out/releases/$version"
  mkdir -p "$release"
  cp "$WORK/out/$v"/x2t.* "$WORK/out/$v/manifest.json" "$WORK/out/$v/sizes.txt" "$release/"
done
log "done: $WORK/out"
