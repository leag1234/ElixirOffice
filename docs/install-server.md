# Install ElixirOffice on one host

The standalone production image includes PostgreSQL, Redis, RabbitMQ, nginx and
the document services. The supplied compose adds Caddy for HTTPS. It needs no
ElixirOffice demo gateway, demo credentials or quotas. AI defaults off.

This is a release review candidate, not a published distribution. The owner supplies
the versioned image/digest, checksums and corresponding-source offer before publication.
There is no public ElixirOffice package repository or download URL yet.

## Obtain and initialize

Use the image archive and deployment bundle supplied by your administrator:

    sha256sum -c SHA256SUMS
    docker load -i elixiroffice-server-image.tar.gz

Alternatively pull the release's immutable registry digest. An image ID is not a
registry manifest digest: use the release's registry digest to pull, and its image
ID to verify a local archive. Keep the previous image archive for rollback.
Do not use latest. The tested standalone baseline is about 5.1 GB uncompressed.

Requirements: Linux x86_64, Docker Engine/Compose v2, Python 3, a hostname and
incoming TCP 80/443. A starting capacity budget is 4 CPU / 8 GiB RAM and 40 GiB free disk
plus documents/backups, not a measured concurrency promise. ARM server acceptance
is unverified. Certificate issuance, cloud storage and configured AI need outbound
network access; offline sites need supplied certificates and local assets.

The APPROVED_IMAGE_DIGEST, APPROVED_CADDY_DIGEST and APPROVED_HELPER_DIGEST
placeholders are filled by the release process, not by guessing a tag or using
latest. The owner publishes approved image references, registry digests and
archive checksums with the release. For an offline image archive, use its supplied
versioned local tag and verify its recorded image ID after loading; a registry
manifest digest may not exist in the local Docker store. Keep release.json.

Extract the bundle and enter its elixiroffice-server directory, then substitute
actual release pins:

    python3 deploy/server/init.py \
      --directory "$HOME/elixiroffice-server" \
      --image elixiroffice/documentserver@sha256:APPROVED_IMAGE_DIGEST \
      --caddy-image caddy@sha256:APPROVED_CADDY_DIGEST \
      --domain office.example.org
    cd "$HOME/elixiroffice-server"
    docker compose -p elixiroffice --env-file server.env config --quiet
    docker compose -p elixiroffice --env-file server.env up -d
    docker compose -p elixiroffice --env-file server.env ps

The helper generates a private JWT secret in server.env mode 600 and refuses to
overwrite an installation. Edit that file privately. Never commit it or paste
rendered compose configuration: it contains credentials. Validation with
config --quiet prints none. Keep the project name unchanged across upgrades.

Only Caddy publishes host ports. The document server, database, cache and queue
stay on the private compose network. JWT remains enabled. HTTPS waits for the
document-service health check, which permits about 12 minutes for initialization.
The image's font pack is used without regenerating fonts on each restart.
[Compose readiness](https://docs.docker.com/compose/how-tos/startup-order/).

## HTTPS and access

Point the hostname's A/AAAA records to this host and forward TCP 80/443; check IPv6 is
reachable if advertised. Allow inbound TCP 80 and 443 through the host firewall, router/NAT and any cloud
firewall to Caddy. HTTP-01 validation specifically requires public port 80;
Caddy also supports TLS-ALPN-01 on port 443. Neither should be forwarded to the
database or document-server backend. Caddy obtains/renews certificates and
redirects HTTP to HTTPS. Its certificate/account volumes persist.

Set an operator contact email in the global block of your installed Caddyfile,
before the site block:

    {
        email office-admin@example.org
    }

Keep certificate state across recreations. Repeated fresh issuance can hit
[Let's Encrypt rate limits](https://letsencrypt.org/docs/rate-limits/).
For issuance tests, use the staging ACME endpoint via the global option
acme_ca https://acme-staging-v02.api.letsencrypt.org/directory; staging
certificates are not browser-trusted. Remove that option for production.
[Caddy global options](https://caddyserver.com/docs/caddyfile/options).
[Automatic HTTPS requirements](https://caddyserver.com/docs/automatic-https).

    curl --fail https://office.example.org/healthcheck
    curl --fail https://office.example.org/elixir-ai/config.json

Expected: true, then {"enabled":false}. Use trusted certificates for browser,
document-server downloads and storage callbacks. Do not disable certificate checking.

For supplied certificates (including offline/private sites), obtain a PEM
full chain and matching unencrypted server key for the configured hostname.
In the private install directory create certs/, put fullchain.pem and privkey.pem
inside it, and restrict the key to the operator/service that reads it. The
standard Caddy container runs as root and can read a mode 0600 key; a custom
non-root image needs the matching UID/group permissions. Add this mount to
the HTTPS service's existing volumes, preserving its other mounts:

    services:
      https:
        volumes:
          - "./certs:/certs:ro"

Replace the installed Caddyfile site block with:

    {$EO_DOMAIN} {
        tls /certs/fullchain.pem /certs/privkey.pem
        reverse_proxy documentserver:80
    }

Validate the file and recreate HTTPS from the private install directory:

    docker compose -p elixiroffice --env-file server.env run --rm --no-deps --entrypoint caddy https \
      validate --config /etc/caddy/Caddyfile --adapter caddyfile
    docker compose -p elixiroffice --env-file server.env up -d --force-recreate https

All browsers, Nextcloud and document-service callbacks must trust the issuing CA.
For a private CA, place its public root certificate in certs/root-ca.pem
(mode 0644 so the ds service user can read it), and merge these settings with
documentserver's existing environment and volumes:

    services:
      documentserver:
        environment:
          NODE_EXTRA_CA_CERTS: /certs/root-ca.pem
        volumes:
          - "./certs/root-ca.pem:/certs/root-ca.pem:ro"

Recreate documentserver, verify health with curl --cacert certs/root-ca.pem,
then test an actual save/reopen. Never mount a CA private key in documentserver.
Track expiry and replace/reload supplied certificates yourself; automatic ACME
renewal does not manage these files.
Do not expose Caddy's admin endpoint. If an existing reverse
proxy owns TCP 80/443, remove the HTTPS service and connect the proxy to the document
service over a private Docker network, or publish the backend on loopback only.
Preserve Host/X-Forwarded-Proto/X-Forwarded-Host, WebSocket upgrades and long saves.
That operator-managed proxy is optional; our demo gateway is never required.

## Start page and persistent storage

By default EO_START_PAGE=false: connect authenticated storage such as Nextcloud;
the welcome page is not a file portal. To enable the start page, set
EO_START_PAGE=true, recreate documentserver, and visit /example/.

**Local profiles are not authentication or access control.** Enable this portal
only for a trusted network/VPN or an independently configured access layer.
Profile names, JWTs and random file URLs are not a multi-tenant account boundary.
A blanket browser login wall can break server-side download/save callbacks;
those must remain reachable by the document service. The authenticated Nextcloud
app avoids using the start page as an account system.

The state volume contains "This server" files, profile data and encrypted cloud
sessions, including their encryption key. Losing that key loses cloud sessions.
It does not protect against access to the entire server disk. The data volume
preserves document-service generated secrets; postgres holds task/conversion
metadata; redis/rabbitmq hold service state; logs hold diagnostics; caddy_data and
caddy_config hold HTTPS state. All eight volumes belong to this deployment.

Volumes survive container replacement and compose down. Never run down --volumes
on an installation you want to retain. Before shutdown, close editors and verify
saves in their actual storage; an open document may still be in service cache.
Nextcloud originals/versions require their own Nextcloud backup.

## AI or no AI

Keep ELIXIR_AI_BASE_URL, ELIXIR_AI_MODEL and ELIXIR_AI_API_KEY empty for no managed
AI. Editing works without it. A user can separately configure a browser provider
in File > AI. For a managed OpenAI-compatible service, set private server.env:

    ELIXIR_AI_BASE_URL=https://provider.example.org/v1
    ELIXIR_AI_MODEL=your-model
    ELIXIR_AI_API_KEY=your-private-key

Keyless internal providers may leave the key empty but need URL/model.
localhost is the container, not your laptop or host. Recreate after edits:

    docker compose -p elixiroffice --env-file server.env up -d --force-recreate documentserver

The image creates its own same-origin AI proxy; browser configuration includes
model/endpoint, not the server key. Selected text/context goes to the configured
provider. See [AI configuration](ai.md#72-administrator-server).
Docker administrators can inspect container environments; protect host/env/backups.

To disable managed AI, empty all three variables and recreate the container,
rather than merely restart: this avoids retaining an old generated nginx include.
Browser-saved provider settings are separate; remove them in File > AI as needed.

## Nextcloud / Murena Workspace

[Storage architecture and security](storage.md) documents two modes.

Inside your own Nextcloud, the app is a separate release artifact, not part of
the document-server image. The ElixirOffice app is a fork of Euro-Office/eurooffice-nextcloud. Its source
is maintained at upstream-extra/elixiroffice-nextcloud (branch elixir/nc in the
source release). The product's
patches/elixiroffice-nextcloud/ and tools/nextcloud-app/rebrand.py record the
branding changes; tools/nextcloud-app/build.sh builds the matching app checkout
(front-end JS/CSS and vendored PHP dependencies). The release must identify its
exact app commit and provide either the built app or its corresponding source
and build tools. No public app download URL is available yet.

From the complete matching source release, a maintainer builds it with:

    NODE_BIN=/path/to/node/bin \
      bash tools/nextcloud-app/build.sh /path/to/elixiroffice-nextcloud

A Nextcloud administrator copies/extracts the built app as
custom_apps/elixiroffice under the Nextcloud installation, with its
appinfo/info.xml, js/, css/ and lib/Vendor present and readable by the web/PHP
service user. Verify the app archive checksum, retain its licence files, and
enable it using Nextcloud's service user (adapt the paths/user for your host):

    cd /path/to/nextcloud
    php occ app:enable elixiroffice

Do not run tools/nextcloud-app/setup.sh on production: it is a development-only
test-user/bootstrap helper. Configure the document server through the app's
administrator settings; do not copy its development TLS/security settings. Current upstream compatibility is 33–36; verify the
supplied appinfo/info.xml. Set the document-server URL to
https://office.example.org/ and its JWT secret to this installation's private
value. Internal document/storage URLs are optional routing settings; both systems
must reach download and callback addresses and trust certificates.
Test open/edit/save/close/reopen, not only the connection-check button.
The document-service container must also reach its public office hostname through
HTTPS for saved-file callbacks. Check container DNS, proxy routing/hairpin access
and certificate trust; a hostname resolving to container loopback is incorrect.

For private Nextcloud addresses, explicitly enable EO_ALLOW_PRIVATE_STORAGE=true
only for that trusted topology. It broadens document-service outbound access;
metadata addresses remain blocked and HTTPS validation stays on. If Nextcloud
is proxied, configure its trusted proxies/overwrite protocol:
[Nextcloud reverse-proxy guide](https://docs.nextcloud.com/server/latest/admin_manual/configuration_server/reverse_proxy_configuration.html).

From the optional start page: choose Connect Murena Workspace / Nextcloud, enter
the HTTPS address and approve Login Flow v2 on that server. Your main password is
entered there; an app password is retained encrypted here. example.json allows
https://murena.io by default. Add your organization's exact HTTPS origin to
allowedServers, adjust defaultServer, and recreate documentserver. Keep
allowHttp=false. The document-server callback fetch uses internal loopback.
Sign out revokes the app password; Nextcloud device settings can revoke it too.
Verify saves after reopening and conflict handling after a concurrent storage edit.
Real external Murena credentials are not supplied; your administrator tests them.

## Backup, upgrade and rollback

Ask users to save/close, verify storage writes, then stop the entire project.
Back up all eight volumes while stopped, plus private server.env, compose,
Caddy/example configuration, release manifest and image archive. A live PostgreSQL
file copy is not a backup. Keep archives private and copy them off-host.

The supplied helper stops this project and leaves it stopped:

    python3 deploy/server/backup.py \
      --install "$HOME/elixiroffice-server" \
      --project elixiroffice \
      --output "$HOME/backups/eo-before-upgrade" \
      --helper-image alpine@sha256:APPROVED_HELPER_DIGEST

It archives each named volume without network access and records hashes.
Resume the same version with compose up -d if not upgrading.

For upgrade, load/pull a new immutable image, keep the old one, update only EO_IMAGE
in the existing env, apply reviewed deployment-file changes, validate config, then
compose up -d. Check health, HTTPS, AI state, storage connection and save/reopen.
Do not rotate JWT/session keys during upgrades. PostgreSQL major-version changes
need explicit migration, not an image swap.

Rollback requires the matching pre-upgrade configuration and data: changing image
tags cannot reverse database migrations. Reconcile any saves after the backup,
then stop this project and restore:

    python3 deploy/server/backup.py restore \
      --install "$HOME/elixiroffice-server" \
      --project elixiroffice \
      --output "$HOME/backups/eo-before-upgrade" \
      --helper-image alpine@sha256:APPROVED_HELPER_DIGEST \
      --replace-volumes

Restore verifies hashes and project/volume names and refuses running containers.
The explicit replacement flag authorizes replacing this installation's contents.
Use the same project name/configuration on a recovery host. Start the restored
previous image and verify save/reopen. Full restore loses changes after the backup.

## Logs

From the private install directory:

    docker compose -p elixiroffice --env-file server.env logs -f documentserver https

This follows container stdout/stderr, including Caddy certificate diagnostics.
Detailed document-service logs also live in the logs named volume mounted at
/var/log/elixiroffice (documentserver/docservice, converter and nginx logs).
Inspect locally, for example:

    docker compose -p elixiroffice --env-file server.env exec documentserver \
      ls /var/log/elixiroffice/documentserver

Logs can contain
document names, URLs or personal data. Restrict access, retain/rotate them under
your operator policy and redact before sharing. Do not publish rendered env or
credentials with diagnostics.

## Uninstall

Save/close documents, verify storage writes and make a private off-host backup.
In the install directory stop and remove the project's containers/network:

    docker compose -p elixiroffice --env-file server.env down

Named volumes, files, secrets and images remain, so this is reversible.
**Irreversible data deletion:** only after verifying the backup and deciding to
discard this installation, use:

    docker compose -p elixiroffice --env-file server.env down -v

This deletes all eight project volumes: local files, database/cache/queue state,
session keys, logs and HTTPS account/certificate state. Cloud originals in
Nextcloud are separate, but local cloud sessions are lost.
Afterwards remove this installation's private directory and backup copies only
when their retention is no longer required. Remove the specific supplied image
references with docker image rm IMAGE_REFERENCE if unused by other installations.
Do not use a global prune or delete another project's volumes.

## Licence and source

ElixirOffice is licensed under AGPLv3 and derived from Euro-Office / ONLYOFFICE.
Preserve the upstream copyright, attribution and licence notices. Operators
redistributing binaries must provide the corresponding source under the licence;
operators who modify the program and offer it over a network must offer that
modified version's corresponding source to the users interacting with it.
Every network deployment should identify a working source location for its users:

    SOURCE_URL=TODO_OWNER_CORRESPONDING_SOURCE_URL

SOURCE_URL is a release/documentation placeholder, not a compose environment
setting. The owner must replace it with the source offer matching the distributed
image/app versions, including source/submodule pins, build scripts and required
installation materials; expose that offer in the deployment's user-facing
information. A placeholder is not a completed source offer.
See [AGPLv3, sections 6 and 13](https://www.gnu.org/licenses/agpl-3.0.html).

In the image, licence files are /var/www/elixiroffice/documentserver/LICENSE
and LICENSE.txt; package attribution is
/usr/share/doc/elixiroffice-documentserver/copyright. In the extracted deployment
bundle they are licences/LICENSE, licences/LICENSE.txt and
licences/package-copyright, with exported third-party/font notices alongside them.
The release.json source offer and image/source/runtime pins must stay with the
bundle. Publication is pending; review bundles are not third-party releases.

## DEB/RPM packages

Docker is the reviewed single-host path. Existing native packaging lives in
DocumentServer/document-server-package. The packages target builds DEB/RPM from
the branded bundle, not from the standalone image. No hosting/signing is configured.

From the matching source release:

    cd DocumentServer/build
    BRAND_DIR=/path/to/elixiroffice/branding \
      docker buildx bake --builder eo --progress=plain \
      -f docker-bake.hcl \
      -f /path/to/elixiroffice/branding/build/elixiroffice.hcl packages

Output: build/deploy/packages/. Record VERSION, BUILD_NUMBER and SHA256 checksums.
Expected names start elixiroffice-documentserver. Inspect actual metadata:

    dpkg-deb --info ./elixiroffice-documentserver_*.deb
    rpm -qpi ./elixiroffice-documentserver-*.rpm

An administrator installs an exact package on a clean supported VM with
apt install ./exact-package.deb or dnf install ./exact-package.rpm.
Packages install host services; Docker env/volumes do not configure them.
Provision the database role/database, RabbitMQ, nginx, Redis where needed and
exact dependencies from metadata. DEB debconf supplies ds/db-host, ds/db-user,
ds/db-pwd, ds/db-name, ds/jwt-secret and ds/jwt-enabled under the package name;
retain JWT. RPM includes its generated documentserver-configure.sh helper.
Keep secrets out of shell histories/process arguments; use private configuration
or interactive provisioning. Native HTTPS uses installed nginx/certificate tooling.

Back up /etc/elixiroffice, /var/lib/elixiroffice, configured database/storage before
native upgrades. Downgrading a package does not undo migration. Inspect scripts
before replacing any existing office install. Ubuntu24.04/Debian12/Rocky9 are
build-tree test targets, not claimed release1 package acceptance.
The package target precedes the final Docker font/runtime layers. Native operators
must provision matching font assets and, if enabling browser conversion, the pinned
full WASM runtime separately; the package is not equivalent to the final image.
**Fresh native DEB/RPM installation is unverified in this task.**

## Maintainer build and distribution

Use tools/image/build.sh all on an independent build checkout, with explicit DS,
REGISTRY, TAG, BUILDER, LOGS and pinned full X2T_RELEASE. It builds base/font/runtime
stages and records image-tag.json. Its overlay mutates source; never use another
session's checkout. Release production assets must match every recorded source pin.

Retain package licence files and upstream attributions. Include source/submodule
pins, runtime manifest, build scripts, checksums and corresponding-source offer
with third-party binaries. Publication/source-offer location belongs to the owner.
Do not redistribute a review image while that information is missing.
Exact review evidence/limitations: the accompanying release acceptance record

Deployment bundling: tools/server/bundle.py takes the image build record, exported
image licences and a matching image reference, writes deployment/image checksums,
and optionally exports the image. Review bundles use --review; distribution bundles
require the owner's corresponding-source offer URL. It never pushes an image.
