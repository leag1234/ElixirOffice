# Desktop Options keyboard behavior

Open **File → Options** from an editor. The recovery checkbox receives keyboard focus as soon as the dialog appears, including while author or font preferences are loading. Use Tab and Shift+Tab to move between the available controls.

Escape and Cancel close Options without saving recovery or author edits. Save applies the recovery settings and author name before closing. The computer-font switch uses its own permission flow, independently of Save and Cancel; those buttons do not undo font-permission changes. Opening Options again shows the saved recovery and author values.

After Options closes, typing resumes at the existing document caret or replaces the existing selection. If another dialog, control or document has taken focus, that newer destination keeps focus. Closing Options while a preference read is pending does not reopen the dialog or move focus when the read completes.

The **Elixir — Settings** button opens the editor's AI settings. Options does not take focus back from that panel. Returning to the home screen while Options closes keeps the home screen usable.

## Browser behavior and scope

Tab movement at the edge of an HTML dialog follows the browser's native keyboard behavior. In headless Chromium, a complete cycle can pass through browser chrome before returning to the dialog. In headless Firefox, forward Tab stays on the last button after visiting the controls; reverse Tab stays on the dialog after visiting them in reverse. Use Escape to close the dialog from a focused control.

The regression checks use the real desktop renderer and a public blank Word document, with simulated native preference calls. They cover initial focus, ordinary caret and selection return, early and settled Escape, preference saving and cancellation, delayed reads, repeated opening, and a newer focus owner.

These checks do not establish behavior in a packaged native window, assistive technology, physical keyboard layouts, hosted editors, or other document formats.

## Focused checks

Run the deterministic ownership checks from the repository root:

~~~sh
node --test tests/desktop/options-focus.test.cjs
~~~

The browser driver requires built desktop assets, Playwright and a fresh output directory:

~~~sh
EO_DESKTOP_ASSETS=/path/to/desktop-assets \
EO_PLAYWRIGHT_MODULE=/path/to/playwright \
EO_OPTIONS_OUT=/path/to/new-results \
EO_BROWSER=firefox \
node tests/desktop/options-focus.cjs
~~~

Set EO_OPTIONS_PROFILES to a JSON array of language, theme and device-pixel-ratio triples when running several profiles. EO_BROWSER_WS_ENDPOINT connects the driver to an already running compatible test browser.
