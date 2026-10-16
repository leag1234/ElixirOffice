#!/bin/bash
# SPDX-License-Identifier: AGPL-3.0-only
# Debian metadata permits omitting Homepage; the pinned builder requires one.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP="$ROOT/desktop/dist/linux-unpacked"
[ -x "$APP/elixiroffice" ] || { echo "Build the Linux application first" >&2; exit 1; }
VERSION="$(node -p "require(process.argv[1]).version" "$ROOT/desktop/package.json")"
DEB_VERSION="$(node "$ROOT/desktop/build-identity.cjs" deb "$ROOT/desktop")"
STAGE="$(mktemp -d "$ROOT/desktop/dist/deb-stage.XXXXXX")"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/DEBIAN" "$STAGE/opt/ElixirOffice" "$STAGE/usr/share/applications" "$STAGE/usr/share/icons/hicolor/512x512/apps"
cp -a "$APP/." "$STAGE/opt/ElixirOffice/"
cp "$ROOT/desktop/icon.png" "$STAGE/usr/share/icons/hicolor/512x512/apps/elixiroffice.png"
SIZE="$(du -sk "$STAGE/opt/ElixirOffice" | cut -f1)"
cat > "$STAGE/DEBIAN/control" <<EOF
Package: elixiroffice-desktop
Version: $DEB_VERSION
Architecture: amd64
Maintainer: ElixirOffice contributors
Installed-Size: $SIZE
Depends: libgtk-3-0, libnotify4, libnss3, libxss1, libxtst6, xdg-utils, libatspi2.0-0, libuuid1, libsecret-1-0
Recommends: libappindicator3-1
Section: editors
Priority: optional
Description: Local ElixirOffice desktop editors
 Offline document, spreadsheet and presentation editors.
EOF
cat > "$STAGE/usr/share/applications/org.elixiroffice.desktop.desktop" <<'EOF'
[Desktop Entry]
Name=ElixirOffice
Comment=Local office editors
Exec="/opt/ElixirOffice/elixiroffice" %U
Terminal=false
Type=Application
Icon=elixiroffice
Categories=Office;
MimeType=application/pdf;application/vnd.openxmlformats-officedocument.wordprocessingml.document;application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;application/vnd.openxmlformats-officedocument.presentationml.presentation;application/vnd.oasis.opendocument.text;application/vnd.oasis.opendocument.spreadsheet;application/vnd.oasis.opendocument.presentation;application/msword;application/vnd.ms-excel;application/vnd.ms-powerpoint;application/rtf;text/plain;text/csv;application/vnd.openxmlformats-officedocument.wordprocessingml.template;application/vnd.ms-word.document.macroEnabled.12;application/vnd.openxmlformats-officedocument.spreadsheetml.template;application/vnd.ms-excel.sheet.macroEnabled.12;application/vnd.openxmlformats-officedocument.presentationml.template;application/vnd.openxmlformats-officedocument.presentationml.slideshow;
EOF
for SCRIPT in postinst postrm; do
 cat > "$STAGE/DEBIAN/$SCRIPT" <<'EOF'
#!/bin/sh
set -e
if command -v update-desktop-database >/dev/null 2>&1; then update-desktop-database -q || true; fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor || true; fi
exit 0
EOF
 chmod 755 "$STAGE/DEBIAN/$SCRIPT"
done
dpkg-deb --root-owner-group -Zgzip --build "$STAGE" "$ROOT/desktop/dist/ElixirOffice-$VERSION-linux-amd64.deb"
