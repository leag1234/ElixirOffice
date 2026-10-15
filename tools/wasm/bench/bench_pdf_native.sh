#!/usr/bin/env bash
# Native counterpart of bench_pdf.mjs: drawing-command stream -> PDF with x2t.
# usage: bench_pdf_native.sh X2T STREAM_DIR OUT_DIR [RUNS]
# font_selection.bin and AllFonts.js must sit next to X2T (its process directory).
set -euo pipefail
x2t=$1 dir=$2 out=$3 runs=${4:-3}
mkdir -p "$out"
echo "file,run,ms,rc,pdf_bytes" > "$out/pdf.csv"
for b in "$dir"/*.bin; do
  n=$(basename "$b" .bin); w="$out/$n"; mkdir -p "$w/tmp"
  cp "$b" "$w/in.bin"; [ -d "$dir/$n/media" ] && cp -r "$dir/$n/media" "$w/"
  printf '<?xml version="1.0" encoding="utf-8"?><TaskQueueDataConvert><m_sFileFrom>%s/in.bin</m_sFileFrom><m_sFileTo>%s/out.pdf</m_sFileTo><m_nFormatFrom>8196</m_nFormatFrom><m_nFormatTo>513</m_nFormatTo><m_bIsNoBase64>true</m_bIsNoBase64><m_sAllFontsPath>%s/AllFonts.js</m_sAllFontsPath><m_sTempDir>%s/tmp</m_sTempDir></TaskQueueDataConvert>' \
    "$w" "$w" "$(dirname "$x2t")" "$w" > "$w/t.xml"
  for r in $(seq 0 $((runs - 1))); do
    rm -f "$w/out.pdf"; t0=$(date +%s%N); rc=0; "$x2t" "$w/t.xml" >/dev/null 2>&1 || rc=$?; t1=$(date +%s%N)
    echo "$n,$r,$(( (t1 - t0) / 1000000 )),$rc,$(stat -c %s "$w/out.pdf" 2>/dev/null || echo 0)" >> "$out/pdf.csv"
  done
  cp "$w/out.pdf" "$out/$n.native.pdf" 2>/dev/null || true
done
cat "$out/pdf.csv"
