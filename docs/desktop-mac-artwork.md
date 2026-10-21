# macOS package artwork

The Mac icon uses the existing ElixirOffice flask paths in white and pale cyan
on a contrasting blue rounded tile. Its 1024-pixel source leaves a transparent
outer margin and retains an opaque tile at small sizes. This platform-specific
artwork does not replace the Linux or Windows icon.

The DMG design uses a 640 by 420 window, with the application on the left,
the Applications link on the right and a clear arrow between them. Finder
supplies the item labels. The background contains only the product name,
so it does not embed English installation instructions in other languages.

Sources and checked-in PNGs live in tools/desktop/artwork. To regenerate them
using the existing development Playwright installation:

    EO_PLAYWRIGHT=/absolute/path/to/playwright node tools/desktop/artwork/render.cjs

The renderer uses sandboxed Chromium at device scale one, without network
resources. Keep the generated PNGs with their SVG sources; the Mac builder
uses the checked-in ICNS and background PNG directly and does not need a browser. The release input archive
already includes tools/desktop and therefore carries all artwork.

The source checks cover PNG dimensions, Mac-only configuration, signing defaults,
application/Applications placement and language-neutral background text.
Linux-rendered source previews qualify the artwork, not the native Finder
copy dialog. Actual DMG window placement, copy appearance and native Mac
acceptance require a macOS package build and Finder inspection.

## Small macOS icons

The Mac package uses tools/desktop/artwork/mac-icon.icns, generated from the
1024-pixel Mac master with Apple's sips and iconutil. Both the base mac.icon
setting and the release configuration select that file, so electron-builder
does not convert icon.png into the legacy icp4/icp5 small-size entries that
caused noisy Finder Open With icons.

To regenerate on macOS, without opening an application:

    python3 tools/desktop/artwork/icns.py

The script creates a private temporary iconset with 16, 32, 128, 256 and 512
logical pixels, each at 1x and 2x, then runs iconutil. It refuses output with
icp4/icp5 or missing ic04/ic05 entries. Commit the generated ICNS beside its
master; generation is not a release-build prerequisite.

To inspect the result without a graphical session, use a new output folder:

    iconutil -c iconset tools/desktop/artwork/mac-icon.icns -o /tmp/eo-readback.iconset

The package acceptance script parses the icon actually referenced by the
bundle's Info.plist, rejects icp4/icp5 and malformed containers, and compares
its hash to the checked-in ICNS. It no longer accepts a builder-generated
dist/.icon-icns copy as the reference. The small readback images preserve
opaque artwork and alpha; full RGB equality at partial-alpha edges is not
established by Apple's conversion. Evidence and limitations are in the
icon encoding handoff.

## Native test-app qualification

The isolated Mac tabs test app used the pinned ICNS with product source afa81e9736
and the published 0.2.4 editor/converter resources. Its actual arm64 bundle passed
ad-hoc signature and icon/hash/container checks. The owner confirmed the small
Finder icon is fixed. This qualifies the icon in a native test application;
the new DMG background/window placement still requires a rebuilt DMG inspection.
