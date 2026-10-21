<!-- SPDX-License-Identifier: AGPL-3.0-only -->
# Status-bar zoom spacing

The spreadsheet and presentation zoom sliders reserve the same half-thumb track extension as Word. The nominal slider is 100px; the common SingleSlider draws a track extending by half the theme's thumb width. Reserving only 100px lets that track overlap the neighboring plus button. With an 18px thumb, the published 0.2.4 Linux package reproduced a 7px overlap at device scale 1. Word already reserved 109px and had a 2px gap.

The correction changes only the two editor LESS width declarations, with the existing legacy fallback and theme-dependent calculation. It leaves the common slider, zoom mapping, button actions and Word layout unchanged.

## Regression

`tests/zoom/desktop.cjs` runs the real Linux desktop package and editor SDK with public blank copies on a private display. It measures both ends and the midpoint of the actual track/thumb against both buttons, checks actual reported device scale, and activates plus, minus and the track through pointer events. It also checks keyboard activation of both buttons in each editor. The layout-direction checks exercise the statusbar's LTR/RTL geometry; they do not claim an Arabic OS launch.

The source-rule test compiles the exact changed LESS blocks with the source theme variable declarations, then appends them after the older package's body stylesheet link. Word uses its existing packaged rule. This focused check avoids a heavy editor build and explicitly differs from testing a newly compiled distribution. For an already rebuilt package, use `EO_ZOOM_SOURCE=0` to test the compiled bundle directly.

Example, after preparing an owned package, public `fixtures/public.{docx,xlsx,pptx}`, results/profile folders and private display:

```sh
EO_UPSTREAM=/srv/elixiroffice/wt/zoom-030-A \
EO_LESS=/path/to/existing/less \
EO_DESKTOP_ROOT=/path/to/private/runtime \
EO_PACKAGE_EXECUTABLE=/path/to/owned/elixiroffice \
EO_DESKTOP_DISPLAY=:PRIVATE_DISPLAY \
EO_PLAYWRIGHT=/path/to/playwright \
EO_ZOOM_OUTPUT=/path/to/private/results \
node tests/zoom/desktop.cjs
```

Default coverage: Word/spreadsheet/presentation, scales 1/1.25/1.5/2, white/classic-light/night themes, three thumb positions and two layout directions: 216 geometry states, 36 pointer-control groups. Keyboard is checked in the first scale/theme for all three editors. Optional `EO_ZOOM_SCALES` and `EO_ZOOM_THEMES` narrow a diagnostic run.

The 0.2.4 baseline used SHA-verified public Linux.deb `e343307849cfe980193152fb04cb72a252ce270697950dd968c1d649c486bdca`. All 216 corrected geometry states had zero overlap; all 36 pointer groups updated the real SDK zoom label. The additional first-scale/white-theme keyboard check passed in all three editors. No page errors or external requests occurred. These checks use Chromium on Xvfb with forced device scales; a physical Wayland compositor and Windows/macOS native scaling are not claimed.
