#!/bin/bash
# Image check (docs/install-server.md): health, services, install paths, and no upstream-name occurrence in paths and served
# content of elixiroffice/documentserver:<tag>. Usage: tools/image/validate.sh <image> [outdir]. Build host (build-host).
IMG=${1:?usage: validate.sh <image> [outdir]}
N=eo-validate; P=${VALIDATE_PORT:-8098}
U="eu""ro[-_ ]?off""ice"   # the upstream name, written in pieces so this file is not an occurrence itself
OUT=${2:-/tmp/eo-validate}; mkdir -p $OUT
docker rm -f $N >/dev/null 2>&1
docker run -d --name $N -p 127.0.0.1:$P:80 -e EXAMPLE_ENABLED=true -e JWT_SECRET=rebrand-validation-secret-0123456789abcdef $IMG >/dev/null
for i in $(seq 1 90); do [ "$(curl -sf localhost:$P/healthcheck)" = true ] && break; sleep 3; done
echo "health: $(curl -s localhost:$P/healthcheck)"
docker exec $N sh -c 'env | grep -E "^(EO_|COMPANY|PRODUCT_NAME)"; supervisorctl status; dpkg -l | grep -i documentserver | cut -c1-80; su postgres -c "psql -tAc \"select datname from pg_database\""; su postgres -c "psql -tAc \"select rolname from pg_roles where rolcanlogin\""'
echo "== paths containing the upstream name (excluding attribution files)"
docker exec $N sh -c "find / -xdev 2>/dev/null | grep -i -E \"$U\"" > $OUT/paths.txt
grep -v -i -E "/(LICENSE|NOTICE|3rd-Party|ATTRIBUTION|AUTHORS|COPYING)[^/]*$" $OUT/paths.txt | head -20; echo "count: $(wc -l < $OUT/paths.txt)"
echo "== file contents (served tree) mentioning the upstream name"
docker exec $N sh -c "grep -r -I -l -i -E \"$U\" \$EO_ROOT \$EO_ROOT-example /etc/\$COMPANY_NAME_LOW /etc/nginx /etc/supervisor 2>/dev/null" > $OUT/content-files.txt
echo "count: $(wc -l < $OUT/content-files.txt)"
docker exec $N sh -c "grep -r -I -h -o -i -E \".{0,60}$U.{0,40}\" \$EO_ROOT \$EO_ROOT-example /etc/\$COMPANY_NAME_LOW /etc/nginx /etc/supervisor 2>/dev/null" | sort | uniq -c | sort -rn > $OUT/content-lines.txt
head -30 $OUT/content-lines.txt | cut -c1-200
echo "== HTTP"
V=$(curl -s -o /dev/null -w '%{redirect_url}' localhost:$P/web-apps/apps/documenteditor/main/index.html | sed -E 's#http://[^/]+/([^/]+)/web-apps.*#\1#')
echo "version path: $V"
echo "== spell checking: dictionaries and engine served (feedback F2; expect 200 and sizes > 100000, ~49 languages)"
echo "thesaurus files (expect > 30, de_DE and ar included): $(docker exec $N sh -c 'ls $EO_ROOT/dictionaries/*/th_*.dat $EO_ROOT/dictionaries/*/*_thes.dat 2>/dev/null | wc -l') $(curl -s -o /dev/null -w '%{http_code}' localhost:$P/$V/dictionaries/de_DE/th_de_DE_v2.idx)"
echo "dictionary folders: $(docker exec $N sh -c 'ls -d $EO_ROOT/dictionaries/*/ | wc -l')"
for u in dictionaries/en_US/en_US.dic dictionaries/fr_FR/fr_FR.dic dictionaries/en_US/en_US.aff sdkjs/common/spell/spell/spell.wasm; do
  echo "$u $(curl -s -o /dev/null -w '%{http_code} %{size_download}' localhost:$P/$V/$u)"
done
: > $OUT/http.txt
for u in / /welcome/ /info/ /example/ /healthcheck \
  /$V/web-apps/apps/api/documents/api.js /$V/web-apps/apps/api/documents/preload.html \
  /$V/web-apps/apps/documenteditor/main/index.html /$V/web-apps/apps/spreadsheeteditor/main/index.html \
  /$V/web-apps/apps/presentationeditor/main/index.html /$V/web-apps/apps/pdfeditor/main/index.html \
  /$V/web-apps/apps/documenteditor/embed/index.html /$V/web-apps/apps/documenteditor/main/app.js \
  /$V/web-apps/apps/documenteditor/main/locale/en.json /$V/web-apps/apps/documenteditor/main/locale/fr.json \
  /$V/sdkjs/word/sdk-all-min.js /$V/sdkjs/common/AllFonts.js /admin/ /hosting/discovery ; do
  f=$OUT/http$(echo $u | tr '/?' '__').txt
  curl -s -L -D $f.h -o $f "localhost:$P$u"
  e=$(grep -c -i -E "$U" $f $f.h | awk -F: '{s+=$2} END{print s}')
  o=$(grep -o -i -E ".{0,40}only""office.{0,30}" $f $f.h | wc -l)
  echo "$u status=$(head -1 $f.h | cut -d" " -f2) euro=$e upstream-brand=$o" | tee -a $OUT/http.txt
done
grep -h -i -E "^(server|x-|via)" $OUT/*.h | sort | uniq -c
