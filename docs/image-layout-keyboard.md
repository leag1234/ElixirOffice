# Picture Layout Options keyboard access

With a picture selected in Word, press F6 to reach its Layout Options button.
Enter or Space opens the flyout. Use the arrow keys to choose a wrapping
style, then Enter to apply it. Tab and Shift+Tab move through the wrapping
and position controls. The arrow keys change Move with text / Fix position
on page while keeping focus in those controls.

F6 and Shift+F6 treat the button and open flyout as one keyboard region.
Escape and the close button keep the picture selected and return focus to
the document. See more opens the existing advanced picture dialog; Escape
cancels that dialog and returns to the document.

Wrapping and position changes use the existing document properties and
history, including Undo. Normal ribbon actions and polygon editing keep
their existing focus behavior. A picture must satisfy the existing
selection and editing conditions before Layout Options is available.

## Known limits

The Arabic Insert > Pictures dropdown currently contains empty entries, so
its file and URL commands cannot be activated. Insert > Icons > select an
icon > Insert creates a picture that can use Layout Options. Some flyout
captions remain untranslated. See the [open issue](backlog.md#word-arabic-pictures-menu-has-no-commands).

Keyboard behavior has been exercised with public documents in Firefox and
macOS Chrome, using the desktop renderer and production editor, SDK and
conversion assets. Native file panels, assistive technology, operating-system
input, compositor scaling, hosted transport, the full shortcut inventory,
locked/read-only combinations and packaged applications are not qualified
by those browser checks.

## Focused checks

The maintained browser check covers ordinary image insertion, pointer and
keyboard entry, delayed focus, Tab/Shift+Tab, wrapping and Undo, radio
controls, the advanced dialog, quick region exits, typing after closing and
visible focus cues. English, French, German and Arabic cover light/dark
themes and device pixel ratios 1 and 2.

Use a coherent production asset tree matching the selected source, SDK,
conversion runtime and standard font profile. The desktop unit suite also
requires real desktop assets and existing builder dependencies.

~~~sh
export EO_UPSTREAM=/path/to/owned/DocumentServer
node --test --test-concurrency=1 tests/layout-options/deferred-focus.test.cjs
node --test --test-concurrency=1 tests/desktop/*.test.cjs
EO_DESKTOP_ASSETS=/path/to/assets EO_LAYOUT_OUT=/path/to/fresh/output EO_PLAYWRIGHT_MODULE=/path/to/playwright EO_BROWSER=firefox node tests/desktop/layout-options-focus.cjs
~~~

The browser check defaults to en/light, fr/light, de/dark and ar/dark at
DPR1/2. EO_LAYOUT_PROFILES accepts a JSON array of language/theme pairs.
EO_BROWSER_WS_ENDPOINT connects to an owned, compatible BrowserServer;
EO_LAYOUT_HTTP_PORT selects the loopback fixture port. Set EO_REAL_MAC=1
for actual macOS Chrome so Undo uses Cmd+Z.

The check substitutes the native IPC boundary with public fixtures and
hashes its executed source and served inputs. Historical build provenance,
failures and validation records are retained in the
technical handoff.
