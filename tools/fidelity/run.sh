#!/usr/bin/env bash
# Layout-fidelity harness, one command:
#   start DocumentServer -> convert the corpus to PDF -> get the reference PDFs
#   -> rasterise + compare page by page -> results.json + HTML report.
#
# Usage: tools/fidelity/run.sh [--ref word-web|word-desktop|libreoffice|self|<source>]
#                              [--image IMAGE] [--corpus DIR] [--ids t01,a07]
#                              [--baseline results.json] [--save-baseline]
#                              [--dpi 120] [--port 8095] [--workers 4]
#                              [--keep-going] [--refresh-refs] [--keep-server]
#                              [--refs-dir DIR] [--runs-dir DIR] [--baselines-dir DIR]
# See tools/fidelity/README.md (French).
set -euo pipefail

REF=word-web
IMAGE=elixiroffice/documentserver:latest
FID_HOME=${FIDELITY_HOME:-/srv/elixiroffice/fidelity}
CORPUS=${FIDELITY_CORPUS:-/srv/elixiroffice/corpus-provisional}
REFS_DIR="" RUNS_DIR="" BASELINES_DIR=""
IDS="" BASELINE="" SAVE_BASELINE=0 DPI=120 PORT=8095 WORKERS=4
KEEP_GOING=0 REFRESH_REFS=0 KEEP_SERVER=1
DS_NAME=eo-fidelity NET=eo-fidelity-net

die() { echo "run.sh: ERROR: $*" >&2; exit 1; }
log() { echo "[run $(date -u +%H:%M:%S)] $*"; }
anon_id() {  # same rule as corpus_anon.anon_id (sha256 of salt, NUL, relative path)
  h=$(printf 'elixiroffice-private-corpus/v1\000%s' "$1" | sha256sum)
  echo "doc-$(echo "$h" | cut -c1-10)"
}
manifest_ids() {  # manifest ids; anonymous ids (from the file column) for a private corpus
  if [ -n "$PRIV_FLAG" ]; then
    tail -n +2 "$CORPUS/manifest.csv" | cut -d, -f2 | while IFS= read -r f; do anon_id "$f"; done
  else
    tail -n +2 "$CORPUS/manifest.csv" | cut -d, -f1
  fi
}

while [ $# -gt 0 ]; do
  case "$1" in
    --ref) REF=$2; shift 2 ;;
    --image) IMAGE=$2; shift 2 ;;
    --corpus) CORPUS=$2; shift 2 ;;
    --refs-dir) REFS_DIR=$2; shift 2 ;;            # reference PDFs (default $FID_HOME/refs/<ref>)
    --runs-dir) RUNS_DIR=$2; shift 2 ;;            # run outputs (default $FID_HOME/runs)
    --baselines-dir) BASELINES_DIR=$2; shift 2 ;;  # --save-baseline target (default $FID_HOME/baselines)
    --ids) IDS=$2; shift 2 ;;
    --baseline) BASELINE=$(readlink -f "$2"); shift 2 ;;
    --save-baseline) SAVE_BASELINE=1; shift ;;
    --dpi) DPI=$2; shift 2 ;;
    --port) PORT=$2; shift 2 ;;
    --workers) WORKERS=$2; shift 2 ;;
    --keep-going) KEEP_GOING=1; shift ;;
    --refresh-refs) REFRESH_REFS=1; shift ;;
    --stop-server) KEEP_SERVER=0; shift ;;
    --keep-server) KEEP_SERVER=1; shift ;;
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    *) die "unknown argument $1" ;;
  esac
done

[[ "$REF" =~ ^[a-z0-9][a-z0-9._-]*$ ]] || die "invalid --ref '$REF'"
HERE=$(cd "$(dirname "$0")" && pwd)
CORPUS=$(readlink -f "$CORPUS")
# Private corpus (real teacher documents, docs/fidelity.md): anonymous ids only in every output.
PRIV_FLAG=""
case "$CORPUS" in *corpus-private*) PRIV_FLAG=--private ;; esac
if [ "${EO_PRIVATE_CORPUS:-0}" = 1 ]; then PRIV_FLAG=--private; fi
[ -f "$CORPUS/manifest.csv" ] || die "no manifest.csv in $CORPUS"
[ -z "$BASELINE" ] || [ -f "$BASELINE" ] || die "baseline $BASELINE not found"
RUNS_DIR=$(readlink -m "${RUNS_DIR:-$FID_HOME/runs}")
BASELINES_DIR=$(readlink -m "${BASELINES_DIR:-$FID_HOME/baselines}")
EXT_REF_DIR=$(readlink -m "${REFS_DIR:-$FID_HOME/refs/$REF}")
mkdir -p "$RUNS_DIR" "$FID_HOME/refs" "$BASELINES_DIR"
T_START=$(date +%s)
case "$REF" in
  self|libreoffice) ;;
  *)  # external reference (Word...): must be provided, fail before doing any work
    ls "$EXT_REF_DIR"/*.pdf >/dev/null 2>&1 || die "no reference PDFs in $EXT_REF_DIR: expected $EXT_REF_DIR/<id>.pdf (ids from manifest.csv, e.g. t01.pdf) and SOURCE.json; see tools/fidelity/README.md"
    [ -f "$FID_HOME/refs/$REF/SOURCE.json" ] || echo "run.sh: WARNING: $FID_HOME/refs/$REF/SOURCE.json missing, reference provenance will be undocumented" >&2
    ;;
esac

# ---------------------------------------------------------------- run dir
RUN_ID=$(date -u +%Y%m%dT%H%M%SZ)-$REF
RUN="$RUNS_DIR/$RUN_ID"
mkdir -p "$RUN"
exec > >(tee -a "$RUN/run.log") 2>&1
log "run $RUN_ID  corpus $CORPUS  ref $REF  image $IMAGE"

# ---------------------------------------------------------------- images
img_tag() { cat "$HERE/$1" "$HERE/requirements.txt" | sha256sum | cut -c1-12; }
ensure_image() {  # name dockerfile
  local tag="$1:$(img_tag "$2")"
  if ! docker image inspect "$tag" >/dev/null 2>&1; then
    log "building $tag" >&2
    # explicit default (docker driver) builder: never touch other buildx builders
    docker buildx build --builder default --load -q -t "$tag" -f "$HERE/$2" "$HERE" >/dev/null
  fi
  echo "$tag"
}
TOOLS=$(ensure_image eo-fidelity-tools Dockerfile)
docker image inspect "$IMAGE" >/dev/null 2>&1 || die "image $IMAGE not present locally (not pulling)"
IMAGE_ID=$(docker image inspect --format '{{.Id}}' "$IMAGE")
IMAGE_DIGEST=$(docker image inspect --format '{{range .RepoDigests}}{{.}} {{end}}' "$IMAGE" | xargs)
IMAGE_CREATED=$(docker image inspect --format '{{.Created}}' "$IMAGE")

# ---------------------------------------------------------------- secret + server
umask 077
mkdir -p "$FID_HOME/secrets"
SECRET="$FID_HOME/secrets/jwt_secret"
[ -s "$SECRET" ] || head -c 32 /dev/urandom | base64 | tr -d '/+=\n' > "$SECRET"
chmod 600 "$SECRET"
printf 'JWT_ENABLED=true\nJWT_SECRET=%s\nALLOW_PRIVATE_IP_ADDRESS=true\nEXAMPLE_ENABLED=false\n' \
  "$(cat "$SECRET")" > "$FID_HOME/secrets/ds.env"
umask 022

docker network inspect "$NET" >/dev/null 2>&1 || docker network create "$NET" >/dev/null
running_image=$(docker inspect --format '{{.Image}}' "$DS_NAME" 2>/dev/null || true)
running_state=$(docker inspect --format '{{.State.Running}}' "$DS_NAME" 2>/dev/null || true)
if [ "$running_image" != "$IMAGE_ID" ] || [ "$running_state" != "true" ]; then
  [ -z "$running_image" ] || { log "replacing container $DS_NAME"; docker rm -f "$DS_NAME" >/dev/null; }
  log "starting $DS_NAME from $IMAGE on 127.0.0.1:$PORT"
  docker run -d --name "$DS_NAME" --network "$NET" -p "127.0.0.1:$PORT:80" \
    --env-file "$FID_HOME/secrets/ds.env" "$IMAGE" >/dev/null
fi
log "waiting for http://127.0.0.1:$PORT/healthcheck"
for i in $(seq 1 120); do
  [ "$(curl -s -m 5 "http://127.0.0.1:$PORT/healthcheck" || true)" = "true" ] && break
  [ "$i" = 120 ] && die "DocumentServer not healthy after 600 s (docker logs $DS_NAME)"
  sleep 5
done
DS_VERSION=$(docker exec "$DS_NAME" sh -c "grep -o \"return *'[0-9][0-9.]*'\" \$EO_ROOT/web-apps/apps/api/documents/api.js | head -1 | grep -o \"[0-9][0-9.]*\"" || true)
log "DocumentServer healthy (version ${DS_VERSION:-?}, image ${IMAGE_ID:7:12})"

UIDGID="$(id -u):$(id -g)"

tools() {  # extra docker args... -- command...
  docker run --rm -u "$UIDGID" --network "$NET" \
    -v "$HERE:/app:ro" -v "$CORPUS:/corpus:ro" -v "$RUN:/run" "$@"
}

convert_pass() {  # outdir-in-run pass-name
  local name="eo-fid-conv-$(echo "$RUN_ID-$2" | tr 'A-Z' 'a-z')"
  tools --name "$name" -v "$SECRET:/secret:ro" "$TOOLS" \
    python /app/convert.py --corpus /corpus --out "/run/$1" --ds "http://$DS_NAME" \
      --secret-file /secret --serve-host "$name" --run-key "${RUN_ID}_$2" \
      --workers "$WORKERS" ${IDS:+--ids "$IDS"} $PRIV_FLAG
}

CONV_FAILED=0
t0=$(date +%s)
log "converting corpus with ElixirOffice ($IMAGE)"
convert_pass ours a || CONV_FAILED=$?
T_CONVERT=$(( $(date +%s) - t0 ))
if [ "$CONV_FAILED" != 0 ]; then
  echo "run.sh: CONVERSION FAILURES (see above and $RUN/ours/convert.json)" >&2
  [ "$KEEP_GOING" = 1 ] || exit 2
fi

# ---------------------------------------------------------------- references
t0=$(date +%s)
case "$REF" in
  self)
    log "reference = second ElixirOffice pass (determinism check, NOT a fidelity reference)"
    convert_pass ref-self b || { echo "run.sh: second pass failed" >&2; [ "$KEEP_GOING" = 1 ] || exit 2; }
    REF_DIR="$RUN/ref-self"
    printf '{"source":"self","is_fidelity_reference":false,"label":"self: second ElixirOffice conversion (determinism check, NOT a fidelity reference)"}\n' > "$REF_DIR/SOURCE.json"
    ;;
  libreoffice)
    REF_DIR="$FID_HOME/refs/libreoffice"
    need=0
    [ "$REFRESH_REFS" = 1 ] && need=1
    for id in $(manifest_ids); do
      [ -f "$REF_DIR/$id.pdf" ] || need=1
    done
    if [ "$need" = 1 ]; then
      LO=$(ensure_image eo-fidelity-lo Dockerfile.libreoffice)
      log "generating LibreOffice stand-in references with $LO (NOT a fidelity reference)"
      mkdir -p "$REF_DIR"
      docker run --rm -u "$UIDGID" -v "$HERE:/app:ro" -v "$CORPUS:/corpus:ro" -v "$REF_DIR:/out" \
        "$LO" sh /app/lo-convert.sh /corpus /out "" "${PRIV_FLAG:+1}" || { echo "run.sh: LibreOffice failures" >&2; [ "$KEEP_GOING" = 1 ] || exit 2; }
    fi
    ;;
  *)
    REF_DIR="$EXT_REF_DIR"  # validated before conversion
    ;;
esac
T_REF=$(( $(date +%s) - t0 ))

# ---------------------------------------------------------------- compare
tools -v "$REF_DIR:/ref:ro" "$TOOLS" python /app/meta.py --out /run/meta.json --run-id "$RUN_ID" \
  --date-utc "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --host "$(hostname)" \
  --image-name "$IMAGE" --image-id "$IMAGE_ID" --image-repo-digest "$IMAGE_DIGEST" \
  --image-created "$IMAGE_CREATED" --ds-version "$DS_VERSION" \
  --tools-image "$TOOLS@$(docker image inspect --format '{{.Id}}' "$TOOLS" | cut -c8-19)" \
  --corpus /corpus --corpus-host "$CORPUS" --ref-source "$REF" --ref-dir /ref --ref-dir-host "$REF_DIR" \
  --timing "convert=$T_CONVERT" --timing "reference=$T_REF"

log "rasterising (${DPI} dpi) and comparing"
CMP_RC=0
tools -v "$REF_DIR:/ref:ro" ${BASELINE:+-v "$BASELINE:/baseline.json:ro"} "$TOOLS" \
  python /app/compare.py --ref-dir /ref --cand-dir /run/ours --corpus /corpus --out /run \
    --meta /run/meta.json --dpi "$DPI" --workers 8 ${IDS:+--ids "$IDS"} $PRIV_FLAG \
    ${BASELINE:+--baseline /baseline.json} || CMP_RC=$?

ln -sfn "$RUN_ID" "$RUNS_DIR/latest-$REF"
if [ "$SAVE_BASELINE" = 1 ] && [ -f "$RUN/results.json" ]; then
  cp "$RUN/results.json" "$BASELINES_DIR/$REF.json"
  log "baseline saved: $BASELINES_DIR/$REF.json"
fi
[ "$KEEP_SERVER" = 1 ] || docker rm -f "$DS_NAME" >/dev/null
log "done in $(( $(date +%s) - T_START )) s: $RUN/report/index.html"
[ "$CONV_FAILED" = 0 ] || { echo "run.sh: finished WITH CONVERSION FAILURES" >&2; exit 2; }
exit "$CMP_RC"
