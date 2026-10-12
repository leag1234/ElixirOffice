# The upstream: reconnaissance for ElixirOffice

> Naming convention: the upstream is the first-level fork of ONLYOFFICE we derive from. Its name was mechanically rewritten to "ElixirOffice" in this document by `tools/rebrand` (requirement: no more occurrence of the upstream name outside attribution); here, "ElixirOffice" therefore designates the upstream, unless stated otherwise ("our ElixirOffice").

> Read-only, done on 2026-10-05 on `<build-host>:$EO_WORK/upstream/`.
> Each statement points to a file that was read. Paths are relative to the cited repository.
> "Not verified" means I ran nothing and the source does not allow a conclusion.

## 1. Repository map

Orchestrator: `DocumentServer` HEAD `bc03fb4` (2026-10-03, branch `main`). `git describe` gives `v9.3.4-hotfix.1-36-gbc03fb4`.
The tag `v9.3.5-rc.1` (`21821ef`, 2026-09-27, "chore: bump version to rc1") is **not an ancestor** of `main`. The `VERSION` file contains `9.3.5-rc.1`.
The 11 submodules match exactly the gitlinks of HEAD, and each is at tag `v9.3.5-rc.1` (`git submodule status`, without prefix).

| Repository | Role (according to README/AGENTS) | Default branch | Pinned commit | Latest commit | Size (excl. .git) |
|---|---|---|---|---|---|
| DocumentServer | Orchestrator: submodules, bake, dev env, CI | main | bc03fb4 | 2026-10-03 | 2.0 G (submodules included) |
| core | C++ engine: x2t, allfontsgen, doctrenderer, WASM targets | main | ebcf905 (v9.3.5-rc.1) | 2026-09-23 | 691 M |
| core-fonts | Shipped fonts | main | 2de9068 | 2026-03-27 | 158 M |
| dictionaries | Hunspell dictionaries | main (`.gitmodules` declares `master`) | 08d46f8 | 2026-03-27 | 239 M |
| document-formats | `onlyoffice-docs-formats.json` (WOPI/discovery) | main | 4699582 | 2026-03-27 | 56 K |
| document-server-integration | Node sample application (`/example/`) | main | 583fbf4 | 2026-08-07 | 75 M |
| document-server-package | deb/rpm/exe packages (Makefile + m4) | main | 84907ab | 2026-08-24 | 1.8 M |
| document-templates | "New" templates | main | d697ab3 | 2025-05-19 | 5.5 M |
| sdkjs | JS engine of the editors (word/cell/slide/pdf/visio) | main | 3305546 | 2026-09-24 | 146 M |
| sdkjs-forms | Forms add-on for sdkjs (`SDK_ADDONS`) | main | e7859d1 | 2026-03-27 | 300 K |
| server | DocService, FileConverter, Metrics, AdminPanel (Node) | main | f5142e9 | 2026-09-22 | 12 M |
| web-apps | Editors' UI (Backbone/RequireJS, React mobile) | main | 9f05726 | 2026-09-23 | 686 M |
| DesktopEditors | Desktop super-repository (submodules **not initialized** on <build-host>) | main | 16d1a01 | 2026-07-01 | 1.5 M |
| desktop-apps | Qt/CEF desktop shell (win-linux, macos) | main | 0302e7c | 2026-09-28 | 335 M |
| desktop-sdk | `ChromiumBasedEditors` (CEF lib) | main | 6f39508 | 2026-06-30 | 82 M |
| plugin-aiautofill | "AI Auto Fill" plugin (forms) | main | 67df1df | 2026-03-27 | 1.1 M |
| elixiroffice-nextcloud | Nextcloud app `elixiroffice` v11.0.5, NC 33–36 (`appinfo/info.xml`) | main | 69077e0 | 2026-10-02 | 3.4 M |
| documentation | MkDocs site (elixiroffice.github.io/documentation) | main | dbd51d4 | 2026-09-30 | 220 K |

**Dependency chain** (`DocumentServer/AGENTS.md`):
`core-fonts → core/AllFontsGen → sdkjs (AllFonts.js) → web-apps → server → Docker image`.
In practice, the bake graph adds `core-wasm → sdkjs`: `sdkjs` copies `engine/ zlib/ hash/ spell/ libfont/` from `core-wasm` (`sdkjs/.docker/sdkjs.bake.Dockerfile`).

**Repositories shared with DesktopEditors**: `core`, `sdkjs`, `web-apps`, `core-fonts` and `sdkjs-forms` (`DocumentServer/AGENTS.md`). `DesktopEditors/.gitmodules` adds `dictionaries`, `document-templates`, `desktop-apps` and `desktop-sdk`. The desktop pins are older: core `fb7bb6a`, sdkjs `bf4a2db`, web-apps `c6368d5` and desktop-apps `e5f89e2`, whereas the standalone clone is at `0302e7c`. Source: `git submodule status`.

**Synchronization with ONLYOFFICE.** The workflow `.github/workflows/updatemirror.yml` (daily cron at 05:30, self-hosted runner) pushes `--all --tags` of 19 ONLYOFFICE repositories to the ElixirOffice organization. The upstream branches and tags, for example `release/v9.4.0` or `v9.4.0.131`, are therefore found **in the same repositories**. The latest ONLYOFFICE tag merged into HEAD is `v9.3.1.9` for web-apps and server, `v9.3.1.11` for sdkjs and core. ONLYOFFICE 9.4.0 is mirrored but not merged.
A second workflow, `.github/workflows/update-submodules.yml` (06:00), opens a `chore/nightly-submodule-bump` PR every night. Manual bumps are forbidden (`AGENTS.md`).

## 2. Full build (Docker image)

File: `build/docker-bake.hcl`. It is launched from `build/`, the context being `..`.

| Bake target | Dockerfile (stage) | Base | Produces |
|---|---|---|---|
| `brand-icons` | inline `FROM scratch` | — | Empty image, to be overridden by a brand HCL |
| `core` | `core/.docker/core.bake.Dockerfile` (`core`) | ubuntu:22.04 (glibc 2.35 wanted) | x2t, `.so` libs, tools, in `/package` |
| `core-wasm` | `core/.docker/core-wasm.bake.Dockerfile` | `emscripten/emsdk:5.0.4` | WASM modules (engine, zlib, hash, spell, libfont) |
| `sdkjs` | `sdkjs/.docker/sdkjs.bake.Dockerfile` (`sdkjs`) | **ubuntu:26.04**, Node 20 | `npm ci && npm run build` (webpack/Terser), with `SDK_ADDONS=/sdkjs-forms` |
| `web-apps` | `web-apps/.docker/web-apps.bake.Dockerfile` | ubuntu:24.04, Node 20, JDK 21 | `merge_and_check.py` then `THEME=elixiroffice node scripts/build-pipeline.js` |
| `server` | `server/.docker/server.bake.Dockerfile` | ubuntu:24.04, Node 20 | `pkg` binaries: docservice, fileconverter, metrics, adminpanel, plus AdminPanel client build |
| `example` | `document-server-integration/.docker/example.bake.Dockerfile` | ubuntu:24.04 | `pkg` binary of the sample application |
| `bundle` | `build/.docker/bundle.bake.Dockerfile` | alpine | Complete `/build/documentserver` tree, configs run through `sed` on `COMPANY_NAME_LOW`/`PRODUCT_NAME_LOW` |
| `packages` | `build/.docker/packages.bake.Dockerfile` | ubuntu:24.04 | `make deb rpm` of document-server-package, then `FROM scratch`, output `type=local,dest=./deploy/packages` |
| `standalone` (group `default`) | `build/.docker/standalone.bake.Dockerfile` (`finalubuntu`) | ubuntu:24.04 | Installs the `.deb` with PostgreSQL, Redis, RabbitMQ, nginx and supervisor in the image. Tag `ghcr.io/euro-office/documentserver:latest` |
| `develop` | `build/.docker/develop.bake.Dockerfile` | `finalubuntu` | Adds Node 20, JDK 21, cmake, ninja, boost and emsdk "latest". Tag `:latest-dev`, `ENV EO_DEV=/develop THEME=elixiroffice` |
| `cluster-docs`, `cluster-example`, `cluster-utils` (group `cluster`) | `build/.docker/orchestrated.bake.Dockerfile` | fedora:43, node:22-alpine, python:3.14 | Kubernetes images; `docs` installs the **.rpm** |

**Core toolchain** (`core/.docker/core.bake.Dockerfile`):
- vcpkg cloned from HEAD, in manifest mode `core/vcpkg.json`, with `builtin-baseline` pinned in `vcpkg-configuration.json`;
- clang-13 (required by V8 9.x, available only for jammy), cmake and Ninja;
- NuGet binary cache: `NUGET_CACHE=local|remote`, with a bind mount `${NUGET_SOURCE_PATH}`, by default `/nuget-cache`, mounted from the context;
- `RUN --mount=type=cache,target=/build-cache`.

The core-wasm uses ccache, em-cache and a cache whose id depends on `CACHE_BUST`. The other targets rely on `--mount=type=cache,target=/root/.npm`.

**Precompiled third-party dependencies**: V8, Boost, Qt and CEF are **downloaded as binaries** from a public Nextcloud share, `VCPKG_BINARY_REMOTE="https://cloud.nextcloud.com/public.php/dav/files/n9KYBcFYyLLCgEw"` (`core/common.cmake:48`). Each archive is verified by SHA512 against `hashes.txt` (`core/Common/3dParty/v8/portfile.cmake`). Rebuilding them goes through `Common/3dParty/build_dependencies.sh`, "~5 hours or more" (`core/Readme.md`).

**buildx caches and flags.** Each target declares `cache-from/cache-to = type=local,src|dest=/tmp/${REGISTRY}/<target>,mode=max`, i.e. `/tmp/ghcr.io/elixiroffice/...`. Two consequences:
- the default `docker` driver cannot export a local cache, hence the `docker-container` builder that `build/BUILD_REQUISITES.md` asks for (`docker buildx create --name container-builder --driver docker-container --use`);
- recent BuildKit requires fs entitlements: read of `..` for the context, write of `/tmp` for the cache-to.

The upstream doc (`documentation/docs/development/building.md`) prescribes `BUILDX_BAKE_ENTITLEMENTS_FS=0 docker buildx bake --allow=fs.read=.. --load`. It **does not mention** `--allow=fs=/tmp`, which our usage with entitlement checking requires because of the local cache-to. For a branded build, it adds `-f brands/<brand>/brand-server.hcl --allow=fs=./brands/<brand>/generated`. In CI, the caches are replaced by `type=registry` via `--set`, in `.github/workflows/build.yml`.

**Platforms.** `docker-bake.hcl` declares no `platforms`: the build is native to the host. CI builds amd64 on `ubuntu-latest` and arm64 on `ubuntu-24.04-arm`, then merges the manifests into `:nightly` (main), `:latest` (tags) and `:latest-dev` (main). The arch is handled by `TARGETARCH`, with `pkg -t linux-x64|arm64` (server) and `linux_64`/`linux_arm64` symlinks (packages).

**Durations.** No full build duration is documented. The only figures found:
- sdkjs: ~50 s cold for the 4 modules in webpack, against 399 s previously with Closure (`sdkjs/build/DEVELOPER-GUIDE.md`);
- third-party dependencies: ~5 h (`core/Readme.md`).

**`packages` target.** It starts from `bundle`, not from `finalubuntu`: `PACKAGE_BASE` is declared but `build/README.md` is behind on this point. The Dockerfile exports `COMPANY_NAME`/`PRODUCT_NAME` as ENV then runs `make deb rpm BRANDING_DIR="." PRODUCT_VERSION BUILD_NUMBER`. Names follow `${COMPANY_NAME_LOW}-${PRODUCT_NAME_LOW}_${VER}-${BUILD}_${arch}.deb`, for example `elixiroffice-documentserver_…`. Tests are done under Vagrant (Ubuntu 24.04, Debian 12, Rocky 9) via `build/Makefile`. GitHub releases attach the `.deb`/`.rpm` for elixiroffice; the nextcloud-office brand drops them over SSH.

**Versions.** `docker-bake.hcl` defaults to `PRODUCT_VERSION=9.3.1` and `BUILD_NUMBER=dev.1`. The doc claims the version is read from `VERSION`, but only CI does so, in `build.yml`. The raw bake does not.

## 3. Dev environment (basis of our `make dev`)

**Compose** (`develop/docker-compose.yml`, project name "ElixirOffice development environment"):

| Service | Image | Host port | Notes |
|---|---|---|---|
| `eo` | `ghcr.io/euro-office/documentserver:latest-dev` | 8080→80 | Env: `EXAMPLE_ENABLED=true`, `JWT_SECRET=${EO_JWT_SECRET:-elixiroffice-dev-jwt-secret-key-2026}`, `ALLOW_PRIVATE_IP_ADDRESS`, `USE_UNAUTHORIZED_STORAGE`, `THEME=elixiroffice`. Volumes: `../:/develop:z` and `./setup/Makefile:/Makefile:z` |
| `nextcloud` | `nextcloud:${NC_VERSION:-latest}` | 8081→80 | admin/admin, SQLite; mounts `../../elixiroffice-nextcloud` read-only in `custom_apps/elixiroffice`; hook `setup/enable-office.sh` |
| `onlyoffice` | `onlyoffice/documentserver:latest` | 8082→80 | Reference ONLYOFFICE instance (comparison), same JWT |

`docker-compose.next.yml` replaces `nextcloud` with `ghcr.io/juliusknorr/nextcloud-dev-php82` (`NC_BRANCH`).

**Host Makefile** (`develop/Makefile`):
- `local` (default): `up -d`, then `refresh-urls`, then `exec eo bash`, hence **interactive**;
- `pull`, `build` (= `cd ../build && docker buildx bake develop`), `mobile`, `next`, `next-mobile`;
- `refresh-urls`: waits for `/healthcheck` then sets `DocumentServerUrl` and `jwt_secret` via `occ`;
- `wipe-nc`, `wipe-next`.

`AGENTS.md` forbids `make`/`make local` for agents and requires `docker compose exec -T eo <cmd>`.

**Makefile in the container** (`develop/setup/Makefile`, mounted on `/Makefile`). `EO_DEV=/develop`; `EO_ROOT=/var/www/elixiroffice/documentserver` comes from the ENV of `finalubuntu`. `PRODUCT_VERSION` is read from `$(EO_DEV)/VERSION` and must equal `asc_getBuildVersion`: otherwise the UI skeleton stays stuck (comment in the file).

| Target | What it does exactly |
|---|---|
| `web-apps` | `translation/merge_and_check.py` (rewrites the locale JSONs in the tree!), `npm ci`, `BUILD_ROOT=$EO_ROOT THEME=elixiroffice node scripts/build-pipeline.js`, then `FLUSH_CACHE`: new hash in `/etc/nginx/includes/ds-cache.conf` and `service nginx reload` |
| `web-apps-dev` | Same without `npm ci`; first checks that `node_modules` is present |
| `sdkjs` | `npm install`, then `CC_PLATFORM=… BUILD_ROOT=$EO_ROOT grunt --compiled develop`, then `documentserver-generate-allfonts.sh`. **Probably broken**: `sdkjs/build/Gruntfile.js` was deleted (webpack migration, `afa2052c97` of 2026-07-23) and `package.json` only exposes `build`/`develop`/`watch:*`. Not verified at runtime |
| `core`, `core/x2t`, `core/allfontsgen`, `core/allthemesgen`, `core/pluginsmanager`, `core/docbuilder` | `cmake -GNinja` in `/build/<name>` with `-DEO_CORE_OUTPUT_DIR=$EO_ROOT/server/FileConverter/bin -DEO_CORE_TOOLS_DIR=$EO_ROOT/server/tools -DEO_CORE_3RD_PARTY_DIR=/build/3rdParty`, then `cmake --build`. Debug only with `DEBUG=1`. No service restart. Incremental as long as the container lives |
| `core/wasm[/font\|spell\|zlib\|hash\|draw\|oform]` | `emcmake cmake` (emsdk in `/opt/emsdk`), output in `sdkjs/common/...`, then `make sdkjs` |
| `server/common` | `npm install` and `sed buildVersion` in `Common/sources/commondefines.js` (modifies the tree) |
| `server/docservice`, `server/converter`, `server/metrics`, `server/adminp/srv` | `npm install`, `pkg . -t linux-x64 …` to `$EO_ROOT/server/...`, then `supervisorctl restart <svc>`. **`linux-x64` is hard-coded**, which contradicts the README's arm64 claim |
| `server/adminp/cli` | `npm run build` of the AdminPanel client with `BUILD_ROOT=$EO_ROOT/server/AdminPanel/client` |
| `all` | `web-apps sdkjs core server` |

**Deploying changes.** Builds write directly into the installed tree `$EO_ROOT`, then nginx is reloaded (web-apps) or the supervisor service restarted (server). A `--force-recreate` of the container brings everything back to the image (`AGENTS.md`). `develop/README.md` and `sdkjs/build/DEVELOPER-GUIDE.md` also cite `make front-dev`, `front-dev-live` and `front-prod`: **these targets do not exist** in `setup/Makefile`.

**`develop/eo.sh`** allows launching several isolated instances. Subcommands: `up [--force] <name> [port]`, `build <name> <targets>`, `exec`, `logs`, `ls`, `down <name>|--all`.
- Each instance starts `docker run -d` on the `EO_IMAGE` image (default `:latest-dev`), with the label `eo.test=1` and port `0:80` (automatic assignment).
- Env: `EXAMPLE_ENABLED`, `WOPI_ENABLED`, `JWT_SECRET`, `USE_UNAUTHORIZED_STORAGE`, `ALLOW_PRIVATE_IP_ADDRESS` and `THEME=elixiroffice`.
- Mounts: the git root on `/develop` and `setup/Makefile` on `/Makefile`.
- The script waits for `/healthcheck` for up to 300 s, then displays the URLs.
- It recommends one worktree per instance, so as not to share `node_modules`.

**JWT.** Dev secret: `elixiroffice-dev-jwt-secret-key-2026`. `JWT_ENABLED` is `true` by default in `build/scripts/standalone/entrypoint.sh`. The sample application requires JWT.

**Useful URLs**:
- `http://localhost:8080/` (welcome);
- `/healthcheck` (returns `true`);
- `/example/`;
- `/example/editor?fileExt=docx|xlsx|pptx|pdf` to create a document; `?fileName=` requires an existing file;
- logs in `/var/log/elixiroffice/documentserver/{docservice,converter}/out.log` and `ds-example_out.log`;
- `supervisorctl status`.

Internal ports: DocService 8000, AdminPanel 9000, sample 3000, statsd 8125 (`server/Common/config/default.json`, sample config file). `documentation/docs/introduction/architecture.md` announces 8080 for DocService, which is wrong for the Node process.

**e2e tests**: `e2e/` (Playwright, 5 specs), run in CI on a self-hosted runner against the PR's image.

## 4. Code entry points

- **Text editor (web-apps)**:
  - `apps/documenteditor/main/index.html(.deploy)` loads `app.js`, which does `require([...])` then `new Backbone.Application({controllers:[…,'Main',…]})` and `app.start()` (l. 107–209);
  - controllers in `apps/documenteditor/main/app/controller/` (`Main.js`, `Toolbar.js`, `LeftMenu.js`, etc.);
  - variants `embed/`, `forms/`, `mobile/` (React/framework7);
  - integration API: `apps/api/documents/api.js`, with `getAppPath()` l. 1115 which chooses `index.html` or `index_loader.html`;
  - common: `apps/common/main/lib/controller/*`.
- **web-apps build**: `build/scripts/build-pipeline.js` (webpack 5, 5 phases and `verify-*` gates), with `build/webpack.*.mjs` and `build/*.json`. `build/README.md` is declared the "authoritative" source.
- **sdkjs word**:
  - `word/api.js` (`asc_docs_api`), `word/apiBuilder.js` (Document Builder) and `word/api_plugins.js`;
  - model in `word/Editor/` (`Document.js`, …);
  - common in `common/` (History, TableId, co-editing `docscoapi.js` and `CollaborativeEditingBase.js`);
  - the concatenation order is fixed in `configs/word.json`: without ES modules, a new file must be added there (`sdkjs/AGENTS.md`).
- **Plugins**:
  - UI side, `web-apps/apps/common/main/lib/controller/Plugins.js` merges `editorConfig.plugins.pluginsData` (supplied by the integrator) and `../../../../plugins.json` (server);
  - `plugins.json` is served by `server/DocService/sources/server.js:358`, which lists the directory `services.CoAuthoring.plugins.uri`, i.e. `sdkjs-plugins/`;
  - engine side, `sdkjs/common/plugins.js` (`CPluginsManager`);
  - installation via `core/DesktopEditor/pluginsmanager`, whose default marketplace is `https://onlyoffice.github.io` (`main.cpp:263`), called by `documentserver-pluginsmanager.sh --update=sdkjs-plugins/plugin-list-default.json` at startup if `PLUGINS_ENABLED=true` (`build/scripts/standalone/entrypoint.sh:574`).
- **Server**:
  - `server/DocService/sources/server.js` (bin `docservice`) and `DocsCoServer.js` (co-editing WebSocket), plus `gc.js` and `shutdown.js`;
  - `server/FileConverter/sources/convertermaster.js` (bin, cluster) then `converter.js`, which launches x2t (`FileConverter.converter.x2tPath`);
  - x2t itself: `core/X2tConverter/build/cmake`;
  - AI proxy: `server/DocService/sources/ai/aiProxyHandler.js`;
  - supervisor: `build/configs/standalone/supervisor/ds-*.conf`.

## 5. Branding

**Bake variables** (`build/docker-bake.hcl`): `BRANDING_DIR="."`, `COMPANY_NAME="ElixirOffice"` (hence `COMPANY_NAME_LOW=elixiroffice`), `PRODUCT_NAME="DocumentServer"` (hence `documentserver`), `REGISTRY=ghcr.io/${COMPANY_NAME_LOW}`.

What they really control:
- `COMPANY_NAME_LOW` and `PRODUCT_NAME_LOW` set the paths `/var/www|/etc|/var/log/<company_low>/<product_low>` (`standalone.bake.Dockerfile`), the package names, and a `sed s/elixiroffice/…/; s/documentserver/…/` on the JSONs of `server/Common/config` and of the sample's config (`bundle.bake.Dockerfile`).
- `COMPANY_NAME` serves as `APP_NAME` for the AdminPanel client (`server.bake.Dockerfile`), feeds the `sed s/ElixirOffice/${COMPANY_NAME}/` of the sample's config, and is passed as ENV to document-server-package's Makefile, which uses it with `COMPANY_NAME ?= ELIXIROFFICE`.
- **`BRANDING_DIR` has no effect**: it is declared as `ARG` in server/example/packages, then forced to `"."` in the `make` call.
- web-apps ignores these variables: `THEME=elixiroffice` is hard-coded in `web-apps.bake.Dockerfile` and `setup/Makefile`.
- sdkjs does not receive them either. Its default `COMPANY_NAME` is contradictory: `'onlyoffice'` in the comment of `build-pipeline.cjs`, `'ElixirOffice'` in `webpack.sdk.factory.mjs`.
- Other hard-coded values: the PostgreSQL user and database `elixiroffice` (`standalone.bake.Dockerfile`, `entrypoint.sh`), and `elixiroffice` in the `example` stage of `orchestrated`.

**Real branding mechanism on the image side.** The `brand-icons` target is overridden by an external HCL, for example `brands/nextcloud-office-brand/brand-server.hcl`, coming from the `ElixirOffice/nextcloud-office-brand` repository that CI clones with a token. This HCL renders 5 SVGs (`logo-dark/light`, `logo-large-*`, `splash`) to PNG/ICO, and its files are overlaid via `COPY --from=brand-icons /[s]erver`, `/[d]ocument-server-package` and `/document-server-integration/...` (`documentation/docs/development/building.md`). This is the model to reproduce for ElixirOffice: an HCL and a brand folder, **without forking the Dockerfiles**.

**web-apps**: themes in `theme/<name>/`, with `meta/config.json` and `assets/img|less`.
- The values come from `theme/euro-office/meta/config.json`: `company_name` and `app_title` "Euro Office", `publisher_url`, `support_url` and `help_url` to github.com/euro-office, `attribution` "…based on ONLYOFFICE…", and the logo names.
- They are resolved by `build/theme.config.mjs`, with priority env > config > default.
- Substituted tokens: `{{APP_TITLE_TEXT}}`, `{{LOADER_LOGO}}`, `{{LOADER_LOGO_DARK}}` and `{{COMPANY_NAME}}`, verified by the `verify-bundles.mjs` gate.
- The fallbacks remain **onlyoffice.com** (`theme.config.mjs:169-216`, to `www`, `support` and `helpcenter`).
- `theme/README.md` still mentions `Gruntfile.js`, which is out of date.
- **Integrator branding is unlocked**: the license no longer conditions `customization.logo/loaderLogo/loaderName` (`canBrandingExt` in `Main.js` and `appOptions.js`, issue #89).

**File counts** (`git grep -l -i`):

| Repository | "onlyoffice" | "elixiroffice/elixiroffice/elixiroffice" | "onlyoffice.com" |
|---|---|---|---|
| web-apps | 1626 | 16 | 1439, of which 1404 in `apps/*/main/resources/help` |
| sdkjs | 63 | 25 | 28 |
| server | 51 | 8 | 13 |
| core | 100 | 9 | 17 |
| document-server-integration | 193 | 53 | 38 |
| document-server-package | 29 | 9 | 14 |

Hosts encountered in web-apps: www (1323 occurrences), helpcenter (573), api (193), git (21), support (2), helpdesk (1).

Outside the help, the main files are:
- `apps/*/embed/index*.html` (www.onlyoffice.com link);
- `apps/*/main/app/controller/Toolbar.js` ("blog/2025/10/docs-9-1-released" link);
- `apps/*/mobile/.../Settings.jsx` (helpcenter);
- `apps/common/main/lib/view/MacrosDialog.js` (api.onlyoffice.com);
- `build/*.json` and `build/package.json` (homepage);
- `build/scripts/deploy-resources.js`.

The `en.json` locales of documenteditor main/mobile contain neither "ONLYOFFICE" nor "ElixirOffice".

**Telemetry, update, license**:
- `web-apps/apps/common/Analytics.js` injects Google Analytics (`ga.js`). It is referenced by documenteditor `main/app.js`, `forms/app.js` and `embed/index*.html`. Its runtime activation is not verified, probably conditioned by the config.
- `aiSettings.allowedCorsOrigins` allows `onlyoffice.github.io` and `onlyoffice-plugins.github.io` (`server/Common/config/default.json`).
- The plugin marketplace points to `onlyoffice.github.io` (core pluginsmanager).
- Windows packaging downloads `download.onlyoffice.com/.../FireDaemon-OpenSSL` (`document-server-package/Makefile:582`).
- No "check update" call was found in server/web-apps/sdkjs.
- License: `server/Common/sources/license.js` always returns success (`branding:true`, `customization:true`, `connections: LICENSE_CONNECTIONS = 99999`, `constants.js:84`). This is commit `075a3f3b` "feat: remove edition/license feature gates".
- The file headers remain "(c) Copyright Ascensio System SIA 2010-2024", without the clause 7(b) logo nor the LV-1050 address, removed by the `strip-logo-clause.yml` workflow.

## 6. Desktop

- **DesktopEditors** (`VERSION.txt` = `9.3.1build`): super-repository, latest commit on 2026-07-01 (submodule bump, H. Leidinger), submodules not cloned on <build-host>.
- **Build** (`build/README.md`): single CMake definition in `desktop-apps/win-linux/CMakeLists.txt`, with vcpkg (`core/vcpkg.json`, feature `desktop-editors`), Ninja and ccache/sccache.
- **Linux**: `docker buildx bake` on the `desktop-common` targets (JS+WASM payload), then `desktop-linux` (stage `desktop-apps/.docker/desktop-apps.bake.Dockerfile` on `core-base` ubuntu 22.04 amd64 / 24.04 arm64, Qt via `aqtinstall`), then `packages` (deb, rpm, tar.xz).
- **Windows**: `build/windows/build.ps1` (MSVC, ZIP and Inno installer, optional MSI), arm64 by cross-compilation.
- **CI** (`.github/workflows/build.yml`, triggered on `pull_request` and `workflow_dispatch` only): jobs `build-common`, `build-linux`, `build-windows` (windows-2022 and windows-11-arm). There is also `winget.yml`.
- **macOS**: the README badge announces macOS, but no doc nor CI job exists (0 occurrences of "macos" in the workflows). The `desktop-apps/macos` folder (Xcode project `ONLYOFFICE.xcodeproj`) still receives i18n commits (Danish, 2026-09-28).
- **CEF**: it is indeed CEF, with `libcef` linked in `win-linux/CMakeLists.txt`.
  - `desktop-sdk` contains `cef_pri_103/107` and CEF headers.
  - The CEF vcpkg portfile downloads a binary from the same Nextcloud share.
  - `core/Common/3dParty/cef/nc-build.py` pins `cef_version = "109.1.18+gf1c41e4+chromium-109.0.5414.120"`, i.e. **Chromium 109 (early 2023)**, from cef-builds.spotifycdn.com: notable security risk.
  - Qt6 was added on the Windows side (`desktop-sdk` `02d643db`, 2026-06-26).
- **Buildable?** A documented chain exists for Linux and Windows, but the `desktop-linux` Dockerfile mounts `nextcloud_user/pass` secrets for the binary cache. Without them, or without the public share, the compilation is not verified.
- **Activity**: desktop-sdk on 2026-06-30, desktop-apps on 2026-09-28 (mostly i18n), super-repository on 2026-07-01, CI on PRs only. The desktop branch is clearly less active than DocumentServer.

## 7. Upstream contribution rules (for us)

Sources: `DocumentServer/AGENTS.md`, `CONTRIBUTING.md`, `SECURITY.md`, `sdkjs/AGENTS.md`, and the unmerged branch `origin/agents/copyright-license-instructions`. `AI_POLICY.md` is in `Euro-Office/.github`, which is not cloned: **not read**.

- **Commits**: Conventional Commits v1.0.0. An `Assisted-by: AGENT_NAME:MODEL_VERSION` trailer is required, one per agent/model, for example `Assisted-by: ClaudeCode:claude-opus-4-8`. The history shows variants (`ClaudeCode:claude-sonnet-5`, `Claude Code:Opus 4.8`).
- **Signing and DCO**: CONTRIBUTING says "Commits are required to be signed", the doc says "signed (DCO)". GPG signing is therefore ambiguous, but the use of `Signed-off-by` is attested in the history. **Only the human** may add `Signed-off-by`; an agent never does.
- **Style**: 120 columns, LF, final newline, `git pull --rebase`. Indentation: 4 spaces according to CONTRIBUTING, but **tabs in sdkjs** (`sdkjs/AGENTS.md`: "follow the local style").
- **sdkjs lint**: the only gate is `python tests/code-style/check.py`, which requires the "Copyright Ascensio System" header or an `SPDX-License-Identifier`. Do not reintroduce `LV-1050`.
- **License headers** (unmerged branch, 2026-09-23): keep the upstream notices on existing or derived files, without changing the years. New files only get `SPDX-FileCopyrightText: 2026 Euro-Office contributors` and `SPDX-License-Identifier: AGPL-3.0-only`. Files already added do so (example: `sdkjs/build/webpack.sdk.factory.mjs`). DocumentServer's README uses `AGPL`, without `-3.0-only`.
- **AI policy (summary)**: disclosure in the PR, the author remains responsible for every line, PR descriptions and review comments written by the human, code tested **on a live instance by the human**, no license contamination, focused PRs. The agent must warn when a PR approaches several thousand lines and propose an issue before any multi-subsystem change.
- **Forbidden for an agent**:
  - opening issues or PRs, or posting comments autonomously;
  - sending security reports: private channel only, via GitHub private advisory (`SECURITY.md`), whereas `AGENTS.md` cites a Proton mail, which is an inconsistency;
  - resolving `good first issue`s;
  - modifying a submodule without reading its AGENTS;
  - creating a root `package.json`;
  - touching `docker-bake.hcl` without multi-platform validation;
  - bumping submodules by hand.
- **Process**: 2 approvals, green CI, PR linked to an issue; PRs from external forks do not have the secrets in CI (comment in `build.yml`).

## 8. Gaps and surprises (compared with the assumptions)

- **"Fork of OnlyOffice"**: confirmed (`ATTRIBUTION`, `sdkjs/AGENTS.md` "hard fork"). The base is ONLYOFFICE 9.3.1.x; 9.4.0 is mirrored but not merged. The forks are `main` branches in repositories that also contain the mirrored upstream branches.
  - Important technical breaks: sdkjs build moved from Grunt/Closure to webpack/Terser, web-apps build in webpack, core in CMake/vcpkg instead of `build_tools`.
  - The license gates and clause 7(b) were removed.
- **"First stable in June 2026"**: confirmed, `v9.3.1` is tagged on 2026-06-09. Before: `tp.1` on 2026-03-31, `beta.1` on 2026-05-28, `rc.1` on 2026-06-04. After: 9.3.2 (06-25), 9.3.3 (08-04), 9.3.4 (08-25), hotfix (08-28), 9.3.5-rc.1 (09-27). The first commit dates from 2025-10-10. The README still announces "deb/rpm packages shortly", whereas they are already attached to the releases by CI.
- **"Co-editing requires PostgreSQL, Redis and RabbitMQ"**: partially true.
  - The queue is `rabbitmq` by default, but `activemq` is also supported (`default.json`).
  - The database is PostgreSQL by default; MySQL, MSSQL and Oracle have connectors in `DocService/sources/databaseConnectors`.
  - **Redis is not required on a single node**: `editorDataStorage` is `"editorDataMemory"` and no `editorDataRedis` module exists in `DocService/sources`. The entrypoint nonetheless starts `redis-server` locally. The exact role of Redis (pub/sub, multi-node) is not verified.
  - The standalone image embeds the three services; `DB_HOST`, `AMQP_HOST` and `REDIS_SERVER_HOST` allow externalizing them.
- **"The desktop apps exist"**: yes, with code and a Linux/Windows CI on PRs. However: no desktop release found locally (not verified on the GitHub side), macOS without a build, CEF/Chromium 109, and a super-repository frozen on 2026-07-01 at 9.3.1.
- **"AI plugin inherited from OnlyOffice"**: a nuance is needed.
  - The upstream AI infrastructure is inherited: `aiSettings`, `aiProxyHandler.js`, the AdminPanel `AiIntegration` page. The GUID of the ONLYOFFICE AI plugin only appears in a comment (`sdkjs/common/apiBase.js:5998`).
  - **No plugin is packaged**: `bundle` creates an empty `sdkjs-plugins/`, and `plugin-list-default.json` is absent from the tree, so the pluginsmanager does not run. Runtime behavior not verified.
  - The doc points to `ONLYOFFICE/onlyoffice.github.io` for plugins.
  - `plugin-aiautofill` is a distinct form-filling plugin (GUID `asc.{6A95DA5C-…}`, v1.0.0, 2026-03), which requires a third-party backend. It is not the general-purpose AI assistant.
- **Supply chain**: V8, Boost, Qt and CEF come from binaries on `cloud.nextcloud.com` (pinned SHA512 hashes). The base image `emscripten/emsdk:5.0.4` is specific to ElixirOffice. The develop Dockerfile installs emsdk "latest" from `main.tar.gz`, which is not reproducible.
- **Governance and brands**: Nextcloud is strongly involved: `nextcloud-office` brand in CI, Nextcloud share, NC app. Recent commits are mostly by Christoph Schaefer and James Manuel. `CODEOWNERS` only contains `@elixiroffice/server`.
- **Doc and tooling behind the code**:
  - `make sdkjs` relies on Grunt, whereas the Gruntfile is deleted;
  - `make front-dev` is absent;
  - `server/*` is compiled hard-coded as `linux-x64`, whereas the README announces arm64 support;
  - `theme/README.md` mentions Grunt;
  - `build/README.md` speaks of `finalubuntu` as the base of the packages, whereas it is `bundle`;
  - DocService is announced on port 8080, whereas it listens on 8000;
  - "Each submodule has its own AGENTS.md" is false: only sdkjs has one.
- **Ubuntu 26.04** is the base of the sdkjs stage (`sdkjs.bake.Dockerfile`); the other stages use 22.04 or 24.04.
