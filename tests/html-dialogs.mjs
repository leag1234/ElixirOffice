// SPDX-License-Identifier: AGPL-3.0-only
// Test cleanup must run dialog lifecycle handlers, never hide a modal backdrop.
export async function cancelHtmlDialogs(frame) {
  await frame.evaluate(() => {
    for (const dialog of document.querySelectorAll('dialog[open]')) {
      const cancel = dialog.querySelector('#elixir-ai-setup-cancel');
      if (cancel) cancel.click();
      else if (dialog.dispatchEvent(new Event('cancel', {cancelable: true}))) dialog.close();
    }
  });
}
