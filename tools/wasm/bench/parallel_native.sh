#!/usr/bin/env bash
# Same throughput test for the native x2t: K concurrent processes.
# usage: parallel_native.sh X2T CORPUS_DIR K OUT_DIR
set -euo pipefail
x2t=$1 corpus=$2 k=$3 out=$4
mkdir -p "$out"
bindir=$(dirname "$x2t")
i=0
for f in $(find "$corpus" -name '*.docx' | sort); do
  i=$((i+1)); d="$out/j$i"; mkdir -p "$d/tmp"
  printf '<?xml version="1.0" encoding="utf-8"?><TaskQueueDataConvert><m_sFileFrom>%s</m_sFileFrom><m_sFileTo>%s/Editor.bin</m_sFileTo><m_nFormatTo>8193</m_nFormatTo><m_bIsNoBase64>true</m_bIsNoBase64><m_sAllFontsPath>%s/AllFonts.js</m_sAllFontsPath><m_sTempDir>%s/tmp</m_sTempDir></TaskQueueDataConvert>' "$f" "$d" "$bindir" "$d" > "$d/t.xml"
done
t0=$(date +%s%N)
ls -d "$out"/j* | xargs -P "$k" -I{} sh -c "$x2t {}/t.xml >/dev/null 2>&1"
t1=$(date +%s%N)
echo "K=$k files=$i wall=$(( (t1-t0)/1000000 ))ms"
