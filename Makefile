# SPDX-License-Identifier: AGPL-3.0-only
# ElixirOffice developer entry points (run on the development host).
# Wraps the upstream dev container (DocumentServer/develop): components are
# rebuilt inside the running container and deployed into its installed tree.

UPSTREAM ?= $(HOME)/elixiroffice/DocumentServer
# Upstream images we consume, the only place their names appear (docs/branding.md):
# the dev container (keeps the upstream install paths: never
# hard-code them, read $$EO_ROOT/$$EO_CONF/$$EO_LOG inside the container) and the
# base of the font test images. Our own image is built by `make image` (<build-host>).
DEV_IMAGE ?= ghcr.io/euro-office/documentserver:latest-dev
UPSTREAM_IMAGE ?= ghcr.io/euro-office/documentserver:latest
export EO_IMAGE := $(DEV_IMAGE)
# The override adds the host-side build cache mounted at /build (tools/dev/docker-compose.override.yml).
BUILD_CACHE ?= $(HOME)/elixiroffice/dev-build-cache
export EO_BUILD_CACHE := $(BUILD_CACHE)
COMPOSE  := docker compose -f $(UPSTREAM)/develop/docker-compose.yml -f $(CURDIR)/tools/dev/docker-compose.override.yml
# CONTAINER=<name> targets another dev container (e.g. one started by
# develop/eo.sh: CONTAINER=eo-home UPSTREAM=$EO_WORK/wt/home)
CONTAINER ?=
ifeq ($(CONTAINER),)
EXEC     := $(COMPOSE) exec -T eo
else
EXEC     := docker exec -i $(CONTAINER)
endif
# The container also sees develop/setup/Makefile as /Makefile, but that is a
# single-file bind mount: once git rewrites the file (checkout, merge) the
# container keeps the old copy until it is recreated. Use the copy under the
# /develop directory mount, which is always current.
SETUP    := make -f /develop/develop/setup/Makefile
URL      ?= http://localhost:8080
THEME    := elixiroffice
BRANDING := $(CURDIR)/branding

.PHONY: fonts-pack fonts fonts-image up down dev dev-tools theme sdkjs web-apps sdkjs-full web-apps-full status logs restore-generated \
        example example-brand example-restart example-thumbnails ai-proxy ai-check perf-tuning rebrand rebrand-check image image-base image-fonts

up:
	mkdir -p $(BUILD_CACHE)
	$(COMPOSE) up -d eo
	@for i in $$(seq 1 60); do [ "$$(curl -sf $(URL)/healthcheck)" = true ] && { echo "ready: $(URL)/example/"; exit 0; }; sleep 3; done; echo "not healthy after 180s"; exit 1

# C++ toolchain for core builds inside the container (idempotent, see tools/dev/setup-toolchain.sh)
dev-tools:
	$(EXEC) sh -s < tools/dev/setup-toolchain.sh

down:
	$(COMPOSE) down

# First run installs npm deps (full targets); later runs use the fast targets.
dev: up
	@$(EXEC) test -d /develop/sdkjs/build/node_modules && $(MAKE) sdkjs || $(MAKE) sdkjs-full
	@$(EXEC) test -d /develop/web-apps/build/node_modules && $(MAKE) web-apps || $(MAKE) web-apps-full

sdkjs:
	$(EXEC) $(SETUP) sdkjs-dev

# Our web-apps theme lives in branding/; it is copied into the upstream
# checkout (untracked, excluded from git there) before each web-apps build.
theme:
	rsync -a --delete $(BRANDING)/web-apps/theme/$(THEME)/ $(UPSTREAM)/web-apps/theme/$(THEME)/
	@EX=$$(git -C $(UPSTREAM)/web-apps rev-parse --absolute-git-dir)/info/exclude; \
	grep -qx 'theme/$(THEME)/' $$EX 2>/dev/null || echo 'theme/$(THEME)/' >> $$EX

web-apps: theme
	$(EXEC) $(SETUP) web-apps-dev THEME=$(THEME)

sdkjs-full:
	$(EXEC) $(SETUP) sdkjs

web-apps-full: theme
	$(EXEC) $(SETUP) web-apps THEME=$(THEME)

status:
	$(COMPOSE) ps
	$(EXEC) supervisorctl status

logs:
	$(EXEC) bash -c 'tail -n 50 "$$EO_LOG/docservice/out.log" "$$EO_LOG/converter/out.log"'

# web-apps builds rewrite tracked files in the checkout: locale JSON
# (translation/merge_and_check.py) and the toolbar icon sprites. This discards
# those rewrites; don't run it while editing those files by hand.
restore-generated:
	git -C $(UPSTREAM)/web-apps checkout -- 'apps/*/main/locale/*.json' 'apps/*/main/resources/img/toolbar/icons.svg'

# ---------------------------------------------------------------------------
# Start page (example integration app, docs/home.md)
# The image ships the example app as a pkg binary built at image build time;
# in dev we run it from the mounted submodule instead, with our brand overlay.
EXAMPLE_DIR := $(UPSTREAM)/document-server-integration/web/documentserver-example/nodejs
EXAMPLE_SRC := /develop/document-server-integration/web/documentserver-example/nodejs
APP_NAME    ?= ElixirOffice

# Brand overlay (logo, favicon, templates): copied into the submodule checkout,
# excluded from git there, like the web-apps theme.
example-brand:
	rsync -rlt $(BRANDING)/example/nodejs/ $(EXAMPLE_DIR)/
	cp $(BRANDING)/web-apps/theme/$(THEME)/assets/img/header/logo_light.svg $(EXAMPLE_DIR)/public/elixir/brand/logo.svg
	@EX=$$(git -C $(UPSTREAM)/document-server-integration rev-parse --absolute-git-dir)/info/exclude; \
	mkdir -p $$(dirname $$EX); \
	grep -qx '/web/documentserver-example/nodejs/public/elixir/brand/' $$EX 2>/dev/null || \
	  echo '/web/documentserver-example/nodejs/public/elixir/brand/' >> $$EX

# Switch the container's example app to node + sources (idempotent).
example: example-brand
	$(EXEC) bash -s $(EXAMPLE_SRC) $(APP_NAME) < tools/example/run-from-source.sh

# Server-side .js and i18n catalogs are read at start-up; views (.ejs) and
# public/ are served live (no view cache outside NODE_ENV=production).
example-restart: example-brand
	$(EXEC) supervisorctl restart example

# Regenerate template thumbnails with the document server's converter, then
# copy them back into branding/.
example-thumbnails: example
	$(EXEC) sh -c 'node - $(EXAMPLE_SRC)/public/elixir/brand/templates "$$JWT_SECRET"' < tools/example/thumbnails.js
	cp $(EXAMPLE_DIR)/public/elixir/brand/templates/*.png $(BRANDING)/example/nodejs/public/elixir/brand/templates/

# Elixir AI, server-managed mode: nginx in the container proxies
# /elixir-ai/v1/chat/completions to the OpenAI-compatible endpoint set by
# ELIXIR_AI_BASE_URL / ELIXIR_AI_MODEL / ELIXIR_AI_API_KEY (environment or .env,
# see .env.example and docs/ai.md); the browser needs no key. With nothing set,
# AI is off ({"enabled":false}). Lost when the container is recreated: rerun.
ai-proxy:
	tools/ai-proxy/install.sh $(if $(CONTAINER),$(CONTAINER),$$($(COMPOSE) ps -q eo))

# Admin check of the AI configuration: provider reachable, key and model
# accepted, config.json free of the key, proxy working (SERVER=http://host:port).
ai-check:
	tools/ai-proxy/check.sh $(SERVER)

# Server side of the performance fixes (docs/perf.md, fixes 3 to 5) on an
# existing container: nginx worker_processes auto, cacheable versioned api.js,
# precompressed static files (gzip_static) with the incremental script from
# document-server-package. A new container gets them from its entrypoint and
# image. Idempotent; lost when the container is recreated: rerun.
perf-tuning:
	$(EXEC) bash -s < tools/perf/tuning.sh

# Thesauri (docs/thesaurus.md): the dev image carries the upstream dictionaries only; copies the
# MyThes files (th_*.dat/.idx) of the dictionaries submodule into the container. The production
# image gets them from its COPY dictionaries stage. Lost when the container is recreated: rerun.
dictionaries:
	cd $(UPSTREAM)/dictionaries && tar cf - $$(ls -d */th_* */*_thes.* 2>/dev/null) | $(EXEC) sh -c 'cd $$EO_ROOT/dictionaries && tar xf - --no-same-owner'
	@$(EXEC) sh -c 'ls $$EO_ROOT/dictionaries/*/th_* 2>/dev/null | wc -l | sed "s/^/dictionaries: thesaurus files installed: /"'

# Font pack (branding/fonts, licences in branding/fonts/LICENSES.md): metric substitutes
# for Microsoft and non-redistributable school fonts; FONT_GROUPS=metric,school adds
# the free school fonts (Andika, OpenDyslexic, Comic Neue), see docs/fonts.md § 6.
# fonts-pack builds it with fontTools in a throwaway container (pinned versions);
# fonts copies it into the dev container and regenerates AllFonts.js / font_selection.bin
# (restarts docservice and converter inside the container, does not recreate it).
# fonts-image builds a test image for the fidelity harness: FONTS_BASE + the pack
# (+ SDKJS_BUILD=<built sdkjs tree>, X2T_BUILD=<core package/bin>).
FONTS_CACHE ?= $(HOME)/.cache/elixiroffice-fonts
FONTS_OUT   ?= $(FONTS_CACHE)/out
FONT_GROUPS ?= metric
FONTS_DIR   := /usr/share/fonts/truetype/elixiroffice
FONTS_PY    ?= python:3.12-slim
FONTS_BASE  ?= $(UPSTREAM_IMAGE)
FONTS_TAG   ?= elixiroffice/documentserver:fonts

fonts-pack:
	mkdir -p $(FONTS_CACHE)/dl $(FONTS_OUT)
	docker run --rm -u $$(id -u):$$(id -g) -e HOME=/tmp -e PIP_DISABLE_PIP_VERSION_CHECK=1 \
	  -v $(BRANDING)/fonts:/src:ro -v $(FONTS_CACHE):/cache $(FONTS_PY) sh -c \
	  'pip install -q --user fonttools==4.54.1 && python /src/build.py --cache /cache/dl --out /cache/out --groups $(FONT_GROUPS)'

fonts: fonts-pack
	$(EXEC) sh -c 'rm -rf $(FONTS_DIR) && mkdir -p $(FONTS_DIR)'
	tar -C $(FONTS_OUT) -cf - . | $(EXEC) tar -C $(FONTS_DIR) --no-same-owner -xf -
	$(EXEC) documentserver-generate-allfonts.sh
	@# the dev container names its programs converter/docservice (the script restarts ds:*)
	-$(EXEC) sh -c "supervisorctl status converter >/dev/null 2>&1 && supervisorctl restart converter docservice"
	@$(EXEC) sh -c 'grep -c "\"Gelasio Metric\"" "$$EO_ROOT/sdkjs/common/AllFonts.js"' >/dev/null && echo "fonts: pack installed, AllFonts.js regenerated"

fonts-image: fonts-pack
	rm -rf $(FONTS_CACHE)/ctx && mkdir -p $(FONTS_CACHE)/ctx/sdkjs $(FONTS_CACHE)/ctx/x2t && cp -a $(FONTS_OUT) $(FONTS_CACHE)/ctx/fonts
	$(if $(SDKJS_BUILD),cp -a $(SDKJS_BUILD)/. $(FONTS_CACHE)/ctx/sdkjs/)
	$(if $(X2T_BUILD),cp -a $(X2T_BUILD)/. $(FONTS_CACHE)/ctx/x2t/)
	docker build -f $(BRANDING)/fonts/Dockerfile.test --build-arg BASE=$(FONTS_BASE) -t $(FONTS_TAG) $(FONTS_CACHE)/ctx

# Rebrand (docs/branding.md). rebrand rewrites the upstream names left in the
# DocumentServer checkout (run after every upstream rebase, then commit with
# REBRAND_COMMIT=1); rebrand-check lists what is left (CI: exits 1 if anything).
rebrand:
	tools/rebrand/rename.sh $(if $(REBRAND_COMMIT),--commit) $(UPSTREAM)

rebrand-check:
	tools/rebrand/check.sh $(UPSTREAM)

# Full ElixirOffice production image (build host, <build-host>; docs/dev.md):
# 1. bake: upstream DocumentServer/build stages + our brand HCL (branding/build/elixiroffice.hcl) ->
#    $(IMAGE_REGISTRY)/documentserver:$(IMAGE_TAG)-base (AI client overlay applied to the sources first);
# 2. fonts: the font pack layer (branding/build/Dockerfile.fonts) -> $(IMAGE_REGISTRY)/documentserver:$(IMAGE_TAG).
# First build about 1 to 2 h, then cached (docs/install-server.md has the measured times). Local only (--load).
# IMAGE_TAG defaults to <date>-<DocumentServer commit>; FONT_GROUPS=metric,school adds the free school fonts.
# The record (times, size, revisions) is written to $(IMAGE_LOGS)/image-<tag>.json.
BUILDER        ?= eo
IMAGE_TAG      ?=
IMAGE_REGISTRY ?= elixiroffice
IMAGE_LOGS     ?= $(CURDIR)/../logs
image image-base image-fonts:
	$(if $(filter command line environment,$(origin UPSTREAM)),DS=$(UPSTREAM)) REGISTRY=$(IMAGE_REGISTRY) BUILDER=$(BUILDER) LOGS=$(IMAGE_LOGS) FONT_GROUPS=$(FONT_GROUPS) \
	  $(if $(IMAGE_TAG),TAG=$(IMAGE_TAG)) tools/image/build.sh $(if $(filter image-base,$@),base,$(if $(filter image-fonts,$@),fonts,all))

# Install the users own licensed fonts (e.g. copied from a Windows C:\Windows\Fonts) into the dev container, next to our pack.
# Private use only: never commit these files, never ship them in an image or a public demo.
#   make fonts-user DIR=~/fonts-user
USER_FONTS_DIR := /usr/share/fonts/truetype/user-fonts
fonts-user:
	@test -n "$(DIR)" && test -d "$(DIR)" || { echo "usage: make fonts-user DIR=<folder with .ttf/.otf/.ttc>"; exit 1; }
	$(EXEC) sh -c 'rm -rf $(USER_FONTS_DIR) && mkdir -p $(USER_FONTS_DIR)'
	cd "$(DIR)" && find . -type f \( -iname '*.ttf' -o -iname '*.otf' -o -iname '*.ttc' \) -print0 | tar --null -T - -cf - | $(EXEC) tar -C $(USER_FONTS_DIR) --no-same-owner -xf -
	$(EXEC) documentserver-generate-allfonts.sh
	-$(EXEC) sh -c "supervisorctl restart converter docservice"
	@echo "fonts-user: $$($(EXEC) sh -c 'find $(USER_FONTS_DIR) -type f | wc -l') font files installed"
