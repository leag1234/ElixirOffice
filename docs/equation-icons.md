# Equation category icons

The 0.3.1 source candidate renders legacy equation category classes such as
svgicon svg-icon-fraction with the matching shipped SVG symbol. Both the ordinary
and large-button template paths use the same existing icon sizing and theme
classes. The twelve categories keep their menus and mathematical choices;
modern btn-* icons, image overrides, captions and custom CSS/raster fallbacks
retain their existing behavior. Only complete legacy symbol tokens are accepted.

The inherited template recognized btn-* names but emitted an empty i.icon for
the equation classes. The symbol and menu data were already present: the original
Linux 0.2.4 and 0.3.0 package diagnosis found twelve empty category icons, while
the fraction menu still displayed nine choices. This is a shared editor component
correction; it does not change document conversion, SDK math data or fonts.

Run the template regression with:

    EO_WEBAPPS=/absolute/path/to/web-apps node --test tests/equation-icons/button.test.cjs

The test uses the repository's production Underscore engine and both actual
production template expressions. Its112cases cover all twelve shipped equation
symbols across ordinary, caption, menu, split and large button paths, modern
icons, image precedence, custom fallback, empty icons and safe token boundaries.
The test first fails104cases on the unchanged source and passes112after the fix.

The separate Linux driver tests/equation-icons/native.cjs exercises the exact
candidate module with the real bundled editor and SDK on a private authenticated
Xvfb. Its module overlay is source evidence, not a rebuilt package or a claim
about native Windows/macOS acceptance. Provide EO_PRODUCT_ROOT, EO_WEBAPPS,
EO_PLAYWRIGHT, EO_ELECTRON and EO_NATIVE_WORK plus the private display/profile
environment. The test profiles and documents are disposable; its cleanup exits
only its own Electron child instead of waiting on a synthetic unsaved-document
sheet. Later fresh asset/package builds must include this shared web-apps commit.

Actual source-overlay Linux result: four profiles pass (light/dark at100/150percent),
with twelve category SVGs plus the settings SVG, nine fraction choices, one
observed call through the real SDK per selection and no page errors. Light100and
dark150popup captures were visually inspected. The initial runtime fixture
omitted explicit lazy-script/input-focus readiness and then waited in unsaved
cleanup; that failed log remains. The corrected driver waits for readiness,
focuses the input and explicitly exits only its own disposable app. Native
window/print/save dialogs, normal shutdown and fresh packaged assets are not
qualified by this check.
