# Development environment (`make dev`)

Machine: development host. The upstream repository is in `/srv/elixiroffice/DocumentServer` (branch `elixir/dev`), our repository in `/srv/elixiroffice/elixiroffice`.

## Principle

We reuse the upstream's dev environment (`DocumentServer/develop`): a container `eo` launched from the ready-made image `ghcr.io/euro-office/documentserver:latest-dev`. The checkout is mounted at `/develop`. Each component is rebuilt **inside** the container and then deployed into the installed tree (`$EO_ROOT`; the dev image is the upstream's and keeps the upstream's paths, under `/var/www/<upstream name>/documentserver`: our scripts read `EO_ROOT`, `EO_CONF` and `EO_LOG` in the container, never a hard-coded path). The image is never rebuilt to test a change; the C++ (core) is not recompiled.

## Commands (from `/srv/elixiroffice/elixiroffice`)

| Command | Effect | Measured duration (development host, 2026-10-05) |
|---|---|---|
| `make up` | creates `/srv/elixiroffice/dev-build-cache` if needed, starts the container (compose project "ElixirOffice development environment", `/build` volume), waits for `/healthcheck` | 40 s on first start |
| `make dev-tools` | installs in the container the C++ toolchain (clang, lld, `llvm-ar`…) for `make core/x2t`; idempotent, to be replayed after each recreation | 15 s |
| `make dev` | `up`, then sdkjs and web-apps (full targets the first time, fast afterwards) | 39 s warm |
| `make sdkjs` | webpack rebuild of sdkjs (4 editors) + deployment + cache invalidation | 3 to 4 s after a change, warm webpack cache |
| `make sdkjs-full` | same with `npm ci` | 36 s cold |
| `make web-apps` | fast web-apps rebuild | 19 s |
| `make web-apps-full` | full rebuild with `npm ci` | 49 s |
| `make status` / `make logs` | state of the services, tail of the docservice and converter logs | |
| `make restore-generated` | reverts the tracked files rewritten by the web-apps build (locales, icon sprites) | |

After a rebuild, just reload the editor page. Verified: a change to `sdkjs/word/api.js` is visible in the browser 4 s after saving.

## Recreating the dev container (complete command set)

The `eo` container is disposable; what must survive lives outside it: the sources (`/develop`, mounted) and the compilation cache (`/build`, see below). After a recreation (`make down && make up`, image or compose file change), replay:

```bash
make up && make dev && make example && make ai-proxy && make perf-tuning && make fonts && make dictionaries && make restore-generated
```

(`dev-tools` is called separately; `ai-proxy` reads `.env`.) Default JWT secret of the container: `elixiroffice-dev-jwt-secret-key-2026` (variable `EO_JWT_SECRET` to change it). The base of the compose project's Nextcloud volumes changed name with the rename (see `docs/branding.md`).

## C++ compilation cache (`/build`)

The long compilations done in the container (V8, 3rdParty, x2t, sdkjs stage) write into `/build`. This directory is mounted from the host (`/srv/elixiroffice/dev-build-cache`, variable `BUILD_CACHE`) by `tools/dev/docker-compose.override.yml`, which the `Makefile` adds to the compose command: recreating the container therefore no longer loses anything. The upstream's compose file is not modified. `make dev-tools` reinstalls clang and creates the `llvm-*` links (the toolchain is not in the upstream image).

State as of 2026-10-07: the x2t compilation (`make core/x2t`, V8 included) had failed at step 97/1202 for lack of an unversioned `llvm-ar`; the fix is in `tools/dev/setup-toolchain.sh`. Relaunch in the background: `docker exec -d eo sh -c 'cd / && nice make -f /develop/develop/setup/Makefile core/x2t > /build/x2t-build3.log 2>&1'`.

## x2t of a work item (core change in a worktree)

A work item that changes the C++ converter (example: `w:fldLock`, core `elixir/parity2`) builds x2t in the `eo` container, which has the toolchain and the cached `/build/3rdParty` (V8 and the other libraries), from a copy of the worktree's core, into its own folders, then installs the result in the instance of the item:

```bash
rsync -a --delete --exclude=.git /srv/elixiroffice/wt/<item>/core/ /srv/elixiroffice/dev-build-cache/core-<item>/
docker exec -d eo sh -c 'mkdir -p /build/x2t-<item> && cd /build/x2t-<item> && cmake -GNinja -DEO_CORE_OUTPUT_DIR=/build/x2t-<item>-out -DEO_CORE_TOOLS_DIR=/build/x2t-<item>-tools -DEO_CORE_3RD_PARTY_DIR=/build/3rdParty /build/core-<item>/X2tConverter/build/cmake && nice cmake --build . > /build/x2t-<item>.log 2>&1'
# about 16 min the first time (3962 steps), incremental afterwards
docker exec eo-<item> sh -c '[ -d /root/bin-orig ] || cp -a "$EO_ROOT/server/FileConverter/bin" /root/bin-orig'
(cd /srv/elixiroffice/dev-build-cache/x2t-<item>-out && tar cf - .) | docker exec -i eo-<item> sh -c 'cd "$EO_ROOT/server/FileConverter/bin" && tar xf - && chown -R ds:ds .'
```

The whole output folder is installed (x2t, libx2tlib.so and the libraries built with it), not x2t alone. A round trip without the editor: `x2t` with a parameter file (`m_sFileFrom`, `m_sFileTo`, `m_nFormatTo` 8192 for the editor binary, 65 for .docx), run in `eo` with `LD_LIBRARY_PATH=/build/x2t-<item>-out`.

## Access from the Mac

```bash
ssh -fN -L 18080:localhost:8080 dev-host
```

then http://localhost:18080/example/editor?fileExt=docx&sample=true (sample document) or `?fileExt=docx` (empty document).

## Fixes made upstream (branch `elixir/dev`, `develop/setup/Makefile`)

1. **`make sdkjs` was broken**: it called `grunt`, whereas sdkjs moved to webpack (`sdkjs/build/scripts/build-pipeline.cjs`, Gruntfile removed). New webpack target. The pipeline erases its `BUILD_ROOT/sdkjs`; we therefore build in `/build/sdkjs-stage` and then copy onto the installed tree, which keeps the files generated at installation (`AllFonts.js`, font and theme thumbnails, presentation themes). Added `sdkjs-dev` (without `npm ci`).
2. **The browser did not see the rebuilds**: static files are served with `Cache-Control: max-age=31536000, immutable` under `/<version>-<hash>/`, and the hash comes from `api.js`. The dev cache purge changed `$cache_tag` on the nginx side but not this hash. It now regenerates `api.js` from `api.js.tpl` with a new hash at each build (and takes as template the `api.js` freshly produced by a web-apps build).

Both are `[upstreamable]` candidates. The patch is kept in `patches/DocumentServer/`.

## Known points

- The `latest-dev` image is at 9.3.4 while the sources are at 9.3.5-rc.1. The container's `PRODUCT_VERSION` (9.3.4) takes precedence over the `VERSION` file, which avoids a loading block in case of version mismatch (see the comment in `develop/setup/Makefile`).
- The editor's service worker returns 404s (`document_editor_service_worker.js`, `docserviceworker.js`): no visible effect, to be understood later.
- The upstream sample document still carries the ONLYOFFICE brand (to be handled with the rebranding).
