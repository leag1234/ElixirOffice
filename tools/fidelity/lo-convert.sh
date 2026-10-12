#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-only
# Runs inside the eo-fidelity-lo container. Converts every corpus .docx to
# /out/<id>.pdf with LibreOffice headless and writes /out/SOURCE.json.
# STAND-IN ONLY: LibreOffice output is NOT a fidelity reference.
# Usage: lo-convert.sh /corpus /out [id,id,...] [private: 1 for the private corpus]
# A private corpus gets anonymous ids (doc-...) and no LibreOffice log lines (they name files).
set -eu
corpus=$1; out=$2; ids=${3:-}; private=${4:-}
anon_id() {  # same rule as corpus_anon.anon_id (sha256 of salt, NUL, relative path)
  h=$(printf 'elixiroffice-private-corpus/v1\000%s' "$1" | sha256sum)
  echo "doc-$(echo "$h" | cut -c1-10)"
}
mkdir -p "$out"
work=$(mktemp -d)
profile="file://$work/profile"
version=$(soffice --version 2>/dev/null | head -1)
fail=0
# manifest.csv: the first two columns (id, file) never contain commas or quotes.
tail -n +2 "$corpus/manifest.csv" | cut -d, -f1,2 > "$work/list"
while IFS=, read -r id file; do
  if [ -n "$private" ]; then id=$(anon_id "$file"); fi
  if [ -n "$ids" ] && ! echo ",$ids," | grep -q ",$id,"; then continue; fi
  rm -rf "$work/o"; mkdir -p "$work/o"
  if soffice -env:UserInstallation="$profile" --headless --norestore \
       --convert-to pdf --outdir "$work/o" "$corpus/$file" >"$work/log" 2>&1 \
     && [ -s "$work/o/$(basename "$file" .docx).pdf" ]; then
    mv "$work/o/$(basename "$file" .docx).pdf" "$out/$id.pdf"
    echo "[libreoffice] $id ok"
  else
    if [ -n "$private" ]; then echo "[libreoffice] $id FAILED (log hidden: private corpus)" >&2
    else echo "[libreoffice] $id FAILED: $(tr '\n' ' ' < "$work/log")" >&2; fi
    fail=1
  fi
done < "$work/list"
cat > "$out/SOURCE.json" <<EOF
{"source": "libreoffice", "is_fidelity_reference": false,
 "label": "libreoffice (NOT a fidelity reference)",
 "producer": "$version",
 "generated_utc": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
 "notes": "LibreOffice headless in eo-fidelity-lo (Debian trixie, Carlito/Caladea/Liberation/DejaVu fonts). Stand-in to exercise the harness only."}
EOF
rm -rf "$work"
exit $fail
