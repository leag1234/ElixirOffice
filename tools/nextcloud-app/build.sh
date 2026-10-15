#!/bin/bash
# Build the ElixirOffice Nextcloud app (fork of eurooffice-nextcloud, branch elixir/nc)
# in place: front-end bundles (js/, css/) with Node and the vendored PHP JWT
# library (lib/Vendor) with Composer in a container. Usage: build.sh <app checkout>
set -euo pipefail
APP=$(cd "${1:?usage: build.sh <app checkout>}" && pwd)
export PATH=${NODE_BIN:-$HOME/elixiroffice/node/bin}:$PATH
cd "$APP"
git submodule update --init assets/document-templates assets/document-formats
npm install --no-audit --no-fund --loglevel=error
git checkout -- npm-shrinkwrap.json 2>/dev/null || true   # npm rewrites the lock file; keep upstream's
npm run build
docker run --rm -u "$(id -u):$(id -g)" -e COMPOSER_HOME=/tmp/composer -v "$APP:/app" -w /app composer:2 \
  install --no-interaction --no-progress --optimize-autoloader
echo "built $APP"
