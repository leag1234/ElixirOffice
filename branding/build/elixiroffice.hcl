# SPDX-License-Identifier: AGPL-3.0-only
# ElixirOffice brand for DocumentServer/build/docker-bake.hcl (docs/branding.md).
# Loaded after the upstream bake file, it only overrides variables and the
# brand-icons target; no upstream Dockerfile is forked.
#
#   cd DocumentServer/build
#   docker buildx bake --builder eo -f docker-bake.hcl \
#     -f ../../elixiroffice/branding/build/elixiroffice.hcl \
#     --allow=fs=/tmp --allow=fs.read=.. --allow=fs.read=../../elixiroffice/branding \
#     --load standalone
#
# Result: elixiroffice/documentserver:latest, installed under
# /var/www|/etc|/var/log/elixiroffice/documentserver, package
# elixiroffice-documentserver, PostgreSQL role/database elixiroffice, web-apps
# theme "elixiroffice" from branding/web-apps/theme/elixiroffice.

variable "COMPANY_NAME" {
  default = "ElixirOffice"
}

# Local image names only (elixiroffice/<target>:TAG); nothing is pushed.
variable "REGISTRY" {
  default = "elixiroffice"
}

# branding/ of the ElixirOffice repository, relative to DocumentServer/build
# (the two checkouts are siblings: <dir>/DocumentServer, <dir>/elixiroffice).
variable "BRAND_DIR" {
  default = "../../elixiroffice/branding"
}

# Overlay copied over the upstream trees by the server, example, packages and
# web-apps stages (COPY --from=brand-icons /[s]erver, /[d]ocument-server-*,
# /[w]eb-apps/theme).
# The upstream target is a dockerfile-inline (empty scratch), and an inline
# Dockerfile wins over `dockerfile` when targets are merged: ours is therefore
# inline too ($${...} is a Dockerfile variable, not an HCL one).
target "brand-icons" {
  context = BRAND_DIR
  args = {
    THEME = THEME
  }
  dockerfile-inline = <<-EOT
    # ElixirOffice brand overlay for the DocumentServer image build (brand-icons
    # target of branding/build/elixiroffice.hcl). Context: branding/.
    # Renders the SVG sources into the icon files the upstream trees ship (PNG/ICO
    # favicons, logos) and lays them out at the paths of the upstream sources:
    #   /web-apps/theme/<THEME>/                                 web-apps theme
    #   /server/...                                              AdminPanel, welcome/info pages
    #   /document-server-package/common/documentserver-example/welcome/css/
    #   /document-server-integration/web/documentserver-example/nodejs/   start page
    FROM alpine:3.22 AS render
        RUN apk add --no-cache rsvg-convert imagemagick
        ARG THEME=elixiroffice
        COPY web-apps/theme/$${THEME}/ /out/web-apps/theme/$${THEME}/
        COPY example/nodejs/ /out/document-server-integration/web/documentserver-example/nodejs/
        COPY web-apps/theme/$${THEME}/assets/img/header/ /src/header/
        COPY example/nodejs/public/elixir/brand/favicon.svg /src/favicon.svg
        RUN set -e; cd /src; \
            for s in 16 32 48 64 256; do rsvg-convert -w $s -h $s favicon.svg -o fav-$s.png; done; \
            magick fav-16.png fav-32.png fav-48.png fav-64.png fav-256.png favicon.ico; \
            rsvg-convert -h 56 header/logo_light.svg -o logo.png; \
            EX=/out/document-server-integration/web/documentserver-example/nodejs/public; \
            mkdir -p $EX/images $EX/elixir/brand; \
            cp header/logo_light.svg $EX/elixir/brand/logo.svg; \
            cp header/logo_light.svg $EX/images/logo.svg; \
            cp header/logo_light.svg $EX/images/mobile-logo.svg; \
            cp header/logo_light.svg $EX/images/mobile-logo_eo.svg; \
            cp favicon.svg $EX/images/favicon_eo.svg; cp favicon.ico $EX/images/favicon.ico; \
            AP=/out/server/AdminPanel/client; mkdir -p $AP/public/images $AP/src/assets; \
            cp favicon.svg $AP/public/images/favicon_eo.svg; cp favicon.ico $AP/public/images/favicon.ico; \
            cp header/logo_light.svg $AP/src/assets/logo.svg; \
            cp header/logo_light.svg $AP/src/assets/AppLogo.svg; \
            cp header/dark-logo_s.svg $AP/src/assets/dark-logo_s.svg; \
            cp header/header-logo_s.svg $AP/src/assets/AppMenuLogo.svg; \
            for p in info welcome; do d=/out/server/branding/$p/img; mkdir -p $d; \
              cp favicon.ico $d/favicon.ico; cp header/logo_light.svg $d/logo.svg; cp logo.png $d/logo.png; done; \
            W=/out/document-server-package/common/documentserver-example/welcome/css; mkdir -p $W; \
            cp header/logo_light.svg $W/logo.svg; cp favicon.svg $W/favicon_eo.svg; cp favicon.ico $W/favicon.ico

    FROM scratch
        COPY --from=render /out/ /
  EOT
}
