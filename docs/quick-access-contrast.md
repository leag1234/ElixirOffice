# Quick Access icon contrast

Save, Undo, Redo and the customization menu use the theme's header icon color. Fluent monochrome SVG paths inherit that color through their sprite reference; colored paths and ribbon controls keep their existing roles. Disabled controls remain visibly distinct.

The pixel regression in tests/quick-access/run.cjs opens a public document in the desktop editor on a private Linux display and checks seven themes. Real edits and undo enable the controls for normal, hover, keyboard focus and pressed checks. Enabled glyphs require at least 3:1 contrast against their background. Baseline mode exposes the original Classic Light regression.

The focused regression compiles the source header declaration and applies it to the existing packaged editor. It checks the CSS behavior without claiming that a new production package was built. Run with EO_DESKTOP_ROOT, EO_PACKAGE_EXECUTABLE, EO_PLAYWRIGHT and EO_HEADER_LESS pointing to the test stage, its own package, Playwright and the matching header.less source.

The accent-colored Share button keeps white primary icon paths along with its white text; it does not inherit a gray header glyph on a colored button. Focused component captures cover Classic Light and Night. A rebuilt LESS bundle must be checked at the next production build.
