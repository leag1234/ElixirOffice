// SPDX-License-Identifier: AGPL-3.0-only
// Cases of the PowerPoint shortcuts suite; ids match the "test" column of
// docs/shortcuts-powerpoint.csv. check() returns true or a failure message.
const eq = (a, b, what) => a === b ? true : `${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`;

// toolbar toggle state after a key in the selected title text
const toggle = (id, keys, btn) => ({
  id, keys,
  setup: async t => { await t.editTitle(); t._before = await t.tb(`tb.${btn}.pressed`); },
  check: async t => eq(await t.tb(`tb.${btn}.pressed`), !t._before, btn + '.pressed'),
  teardown: async t => { await t.press('Control+Z'); await t.closeAll(); },
});
// paragraph alignment as reported by the engine (asc_onParagraphAlign): 0 right, 1 left, 2 center, 3 justify
const align = (id, keys, value) => ({
  id, keys,
  setup: async t => { await t.editTitle(); await t.press(value === 1 ? 'Control+R' : 'Control+L'); },
  check: async t => eq(await t.ev(() => PE.getController('Toolbar')._state.pralign), value, 'paragraph alignment'),
  teardown: async t => { await t.press('Control+Z'); await t.closeAll(); },
});
const spyCase = (id, keys, api, setup) => ({
  id, keys,
  setup: async t => { setup && await setup(t); await t.spy(api); },
  check: async t => (await t.spied(api)) > 0 ? true : `${api} not called`,
});
const visibleCase = (id, keys, sel, setup) => ({
  id, keys,
  setup: async t => { await t.closeAll(); setup && await setup(t); },
  check: async t => (await t.visible(sel)) ? true : `${sel} not visible`,
});

const SUB = 'Asc.vertalign_SubScript';

// ---- helpers of the PowerPoint keys added in elixir/xlppt
const logic = 'PE.getController("Main").api.WordControl.m_oLogicDocument';
const historyBase = async t => { t._h = await t.ev(() => AscCommon.History.Index); };
const undoToBase = async t => { await t.closeAll(); await t.ev(h => { const api = PE.getController('Main').api; for (let i = 0; i < 50 && AscCommon.History.Index > h; i++) api.Undo(); }, t._h); };
// title placeholder of slide 1 with three paragraphs, caret at the start
const threeParas = async t => {
  await t.goSlide(0); const [x, y] = await t.slideCenter(); await t.page.mouse.click(x, y + 60); await t.wait(400); await t.press('Control+A'); await historyBase(t);
  for (const [i, w] of ['one', 'two', 'three'].entries()) { if (i) await t.press('Enter'); await t.page.keyboard.type(w); }
  await t.press('Control+Home');
};
const paraIndex = t => t.ev(l => { const c = eval(l).GetCurrentController().getTargetDocContent(); return c ? (c.IsSelectionUse() ? c.Selection.EndPos : c.CurPos.ContentPos) : -1; }, logic);
const paraTexts = t => t.ev(l => eval(l).GetCurrentController().getTargetDocContent().Content.map(p => p.GetText().trim()), logic);
const selectedText = t => t.ev(l => eval(l).GetSelectedText(false).trim(), logic);
const textCase = (id, keys, setup, check, mac) => ({ id, keys, mac, setup, check, teardown: undoToBase });
const showCase = (id, keys, check) => ({ id, keys: ['F5'].concat(keys), mac: ['F5'].concat([].concat(keys).map(k => k.replace('Control+', 'Meta+'))), wait: 600,
  setup: async t => { await t.goSlide(0); await t.clickCanvas(); }, check });

export const cases = [
  // ---- frequently used
  { id: 'new-slide', keys: 'Control+M', setup: async t => { await t.clickCanvas(); await t.press('Escape'); t._n = await t.count(); },
    check: async t => eq(await t.count(), t._n + 1, 'slides'), teardown: async t => { await t.press('Control+Z'); } },
  toggle('bold', 'Control+B', 'btnBold'),
  toggle('italic', 'Control+I', 'btnItalic'),
  toggle('underline', 'Control+U', 'btnUnderline'),
  toggle('subscript', 'Control+Equal', 'btnSubscript'),
  toggle('superscript', 'Control+Shift+Equal', 'btnSuperscript'),
  { ...visibleCase('font-dialog', 'Control+Shift+F', '.asc-window', async t => { await t.editTitle(); }), wait: 1200 },
  { ...visibleCase('hyperlink', 'Control+K', '.asc-window', async t => { await t.editTitle(); }), wait: 1200 },
  { id: 'comment', keys: 'Control+Alt+M', setup: async t => { await t.selectShape(); },
    wait: 1200, check: async t => (await t.ev(() => { const a = document.activeElement; return !!(a && a.tagName === 'TEXTAREA' && $(a).closest('[id*=comment], [class*=comment]').length); })) ? true : 'no comment field' },
  { id: 'undo', keys: 'Control+Z', setup: async t => { await t.clickCanvas(); await t.press('Escape'); t._n = await t.count(); await t.press('Control+M'); },
    check: async t => eq(await t.count(), t._n, 'slides after undo') },
  { id: 'redo', keys: 'Control+Y', setup: async t => { await t.clickCanvas(); await t.press('Escape'); t._n = await t.count(); await t.press('Control+M'); await t.press('Control+Z'); },
    check: async t => eq(await t.count(), t._n + 1, 'slides after redo'), teardown: async t => { await t.press('Control+Z'); } },
  { id: 'next-slide', keys: 'PageDown', setup: async t => { await t.goSlide(0); await t.clickCanvas(); await t.press('Escape'); },
    check: async t => eq(await t.current(), 1, 'current slide') },
  { id: 'prev-slide', keys: 'PageUp', setup: async t => { await t.goSlide(2); await t.clickCanvas(); await t.press('Escape'); },
    check: async t => eq(await t.current(), 1, 'current slide') },
  visibleCase('slideshow-f5', 'F5', '#pe-preview', async t => { await t.clickCanvas(); }),
  { id: 'end-show', keys: ['F5', 'Escape'], setup: async t => { await t.clickCanvas(); },
    check: async t => (await t.visible('#pe-preview')) ? 'slide show still open' : true },
  { id: 'show-current', keys: 'Shift+F5', setup: async t => { await t.goSlide(1); await t.clickCanvas(); await t.spy('StartDemonstration'); },
    check: async t => (await t.visible('#pe-preview')) ? true : 'no slide show' },
  visibleCase('print', 'Control+P', '#panel-print', async t => { await t.clickCanvas(); }),
  { id: 'save', keys: 'Control+S', setup: async t => { await t.editTitle(); await t.page.keyboard.type('x'); await t.spy('asc_Save'); },
    check: async t => (await t.spied('asc_Save')) > 0 ? true : 'asc_Save not called', teardown: async t => { await t.press('Control+Z'); await t.closeAll(); } },
  visibleCase('save-as', 'Control+Shift+S', '#file-menu-panel', async t => { await t.clickCanvas(); }),
  // ---- presentations
  spyCase('zoom-in', 'Control+Equal', 'zoomIn', async t => { await t.clickCanvas(); await t.press('Escape'); }),
  spyCase('zoom-out', 'Control+Minus', 'zoomOut', async t => { await t.clickCanvas(); await t.press('Escape'); }),
  spyCase('zoom-fit', 'Control+Alt+O', 'zoomFitToPage', async t => { await t.clickCanvas(); }),
  { id: 'duplicate-slide', keys: 'Control+Shift+D', setup: async t => { await t.clickCanvas(); await t.press('Escape'); t._n = await t.count(); },
    wait: 1500, check: async t => eq(await t.count(), t._n + 1, 'slides'), teardown: async t => { await t.press('Control+Z'); } },
  // ---- objects
  { id: 'copy-paste-format', keys: ['Control+Shift+C'], setup: async t => { await t.editTitle(); await t.press(t.mod + '+B'); },
    check: async t => {
      const [x, y] = await t.slideCenter();
      await t.page.mouse.click(x, y + 60); await t.wait(300); await t.press(t.mod + '+A'); await t.press(t.mod + '+Shift+V');
      // the toolbar shows the new formatting once the text is selected again
      await t.press('Escape'); await t.press('Escape'); await t.page.mouse.click(x, y + 60); await t.wait(300); await t.press(t.mod + '+A');
      return eq(await t.tb('tb.btnBold.pressed'), true, 'subtitle bold after paste formatting');
    }, teardown: async t => { for (let i = 0; i < 3; i++) await t.press(t.mod + '+Z'); } },
  spyCase('bring-forward', 'Control+Shift+BracketRight', 'shapes_bringForward', async t => { await t.selectShape(); }),
  spyCase('send-backward', 'Control+Shift+BracketLeft', 'shapes_bringBackward', async t => { await t.selectShape(); }),
  { ...spyCase('rotate-right', 'Alt+ArrowRight', 'ShapeApply', async t => { await t.selectShape(); }), teardown: async t => { await t.press('Control+Z'); } },
  { ...spyCase('rotate-left', 'Alt+ArrowLeft', 'ShapeApply', async t => { await t.selectShape(); }), teardown: async t => { await t.press('Control+Z'); } },
  { id: 'grow-font', keys: 'Control+Shift+Period', setup: async t => { await t.editTitle(); t._s = parseFloat(await t.tb('tb.cmbFontSize.getValue()')); },
    check: async t => { const s = parseFloat(await t.tb('tb.cmbFontSize.getValue()')); return s > t._s ? true : `font size ${t._s} -> ${s}`; },
    teardown: async t => { await t.press('Control+Z'); await t.closeAll(); } },
  { id: 'shrink-font', keys: 'Control+Shift+Comma', setup: async t => { await t.editTitle(); t._s = parseFloat(await t.tb('tb.cmbFontSize.getValue()')); },
    check: async t => { const s = parseFloat(await t.tb('tb.cmbFontSize.getValue()')); return s < t._s ? true : `font size ${t._s} -> ${s}`; },
    teardown: async t => { await t.press('Control+Z'); await t.closeAll(); } },
  { id: 'equation', keys: 'Alt+Equal', setup: async t => { await t.editTitle(); await t.press('End'); },
    check: async t => (await t.ev(() => PE.getController('Main').api.getSelectedElements().some(e => e.get_ObjectType() === Asc.c_oAscTypeSelectElement.Math))) ? true : 'no equation',
    teardown: async t => { await t.press('Control+Z'); await t.closeAll(); } },
  // ---- text
  spyCase('change-case', 'Shift+F3', 'asc_ChangeTextCase', async t => { await t.editTitle(); }),
  { id: 'clear-format', keys: 'Control+Space', setup: async t => { await t.editTitle(); await t.press('Control+B'); },
    check: async t => eq(await t.tb('tb.btnBold.pressed'), false, 'bold after reset'), teardown: async t => { await t.press('Control+Z'); await t.press('Control+Z'); await t.closeAll(); } },
  align('center', 'Control+E', 2),
  align('right', 'Control+R', 0),
  align('justify', 'Control+J', 3),
  align('left', 'Control+L', 1),
  spyCase('demote', 'Alt+Shift+ArrowRight', 'IncreaseIndent', async t => { await t.goSlide(1); const [x, y] = await t.slideCenter(); await t.page.mouse.click(x, y + 20); await t.wait(300); }),
  spyCase('promote', 'Alt+Shift+ArrowLeft', 'DecreaseIndent', async t => { await t.goSlide(1); const [x, y] = await t.slideCenter(); await t.page.mouse.click(x, y + 20); await t.wait(300); await t.press('Tab'); }),
  // ---- find
  visibleCase('find', 'Control+F', '.search-bar, #left-panel-search', async t => { await t.clickCanvas(); }),
  { ...visibleCase('replace', 'Control+H', '#left-panel-search, .search-bar', async t => { await t.clickCanvas(); }), mac: ['Control+H'] },
  // ---- slide order (slide selected in the thumbnails)
  { id: 'move-slide-start', keys: 'Control+Shift+ArrowUp', setup: async t => { await t.clickThumb(1); },
    check: async t => eq(await t.current(), 0, 'moved slide position'), teardown: async t => { await t.press('Control+Z'); } },
  { id: 'move-slide-down', keys: 'Control+ArrowDown', setup: async t => { await t.clickThumb(0); },
    check: async t => eq(await t.current(), 1, 'moved slide position'), teardown: async t => { await t.press(t.mod + '+Z'); } },
  { id: 'move-slide-up', keys: 'Control+ArrowUp', setup: async t => { await t.clickThumb(1); },
    check: async t => eq(await t.current(), 0, 'moved slide position'), teardown: async t => { await t.press(t.mod + '+Z'); } },
  { id: 'move-slide-end', keys: 'Control+Shift+ArrowDown', setup: async t => { await t.clickThumb(0); },
    check: async t => eq(await t.current(), (await t.count()) - 1, 'moved slide position'), teardown: async t => { await t.press('Control+Z'); } },
  // ---- views and ribbon
  spyCase('presenter-view', 'Alt+F5', 'StartDemonstration', async t => { await t.clickCanvas(); }),
  spyCase('guides', 'Alt+F9', 'asc_setShowGuides', async t => { await t.clickCanvas(); }),
  spyCase('gridlines', 'Shift+F9', 'asc_setShowGridlines', async t => { await t.clickCanvas(); }),
  { id: 'ribbon-collapse', keys: 'Control+F1', setup: async t => { await t.clickCanvas(); t._f = await t.tb('tb.isCompact()'); },
    check: async t => eq(await t.tb('tb.isCompact()'), !t._f, 'ribbon folded'), teardown: async t => { await t.press('Control+F1'); } },
  { id: 'tell-me', keys: 'Alt+Q', mac: null, setup: async t => { await t.clickCanvas(); },
    check: async t => (await t.ev(() => document.activeElement && document.activeElement.classList.contains('elx-search-input'))) ? true : 'search box not focused' },
  visibleCase('keytips', 'Alt', '.hint-section [data-hint-title], .hint-item, .hint-active', async t => { await t.clickCanvas(); }),
  { id: 'file-tab', keys: ['Alt', 'F'], setup: async t => { await t.clickCanvas(); },
    check: async t => (await t.visible('#file-menu-panel')) ? true : 'File menu not open' },
  { id: 'insert-tab', keys: ['Alt', 'N'], setup: async t => { await t.clickCanvas(); },
    check: async t => eq(await t.tb('tb.isTabActive("ins")'), true, 'Insert tab active') },
  { id: 'slideshow-tab', keys: ['Alt', 'S'], setup: async t => { await t.clickCanvas(); },
    check: async t => eq(await t.tb('tb.isTabActive("slideshow")'), true, 'Slide Show tab active') },
  { id: 'design-tab', keys: ['Alt', 'G'], setup: async t => { await t.clickCanvas(); },
    check: async t => eq(await t.tb('tb.isTabActive("design")'), true, 'Design tab active') },
  { id: 'transitions-tab', keys: ['Alt', 'K'], setup: async t => { await t.clickCanvas(); },
    check: async t => eq(await t.tb('tb.isTabActive("transit")'), true, 'Transitions tab active') },
  { id: 'view-tab', keys: ['Alt', 'W'], setup: async t => { await t.clickCanvas(); },
    check: async t => eq(await t.tb('tb.isTabActive("view")'), true, 'View tab active') },
  // ---- delivering (slide show running)
  { ...spyCase('show-next', ['F5', 'n'], 'DemonstrationNextSlide', async t => { await t.goSlide(0); await t.clickCanvas(); }), wait: 600 },
  { ...spyCase('show-prev', ['F5', 'PageDown', 'p'], 'DemonstrationPrevSlide', async t => { await t.goSlide(0); await t.clickCanvas(); }), wait: 600 },
  { ...spyCase('show-goto', ['F5', '3', 'Enter'], 'DemonstrationGoToSlide', async t => { await t.goSlide(0); await t.clickCanvas(); }), wait: 600 },
  visibleCase('show-black', ['F5', 'b'], '#elx-show-blank', async t => { await t.goSlide(0); await t.clickCanvas(); }),
  // last: grouping changes the slide's objects
  { id: 'group', keys: 'Control+G', setup: async t => { await t.goSlide(0); await t.clickCanvas(); await t.press('Control+A'); },
    check: async t => { const n = await t.ev(() => PE.getController('Main').api.getSelectedElements().filter(e => e.get_ObjectType() === Asc.c_oAscTypeSelectElement.Shape).length);
      return n === 1 ? true : `${n} shapes selected after grouping`; }, teardown: async t => { await t.press('Control+Z'); await t.closeAll(); } },
  // ---- keys added in elixir/xlppt
  textCase('para-down', 'Control+ArrowDown', threeParas, async t => eq(await paraIndex(t), 1, 'paragraph')),
  textCase('para-up', ['Control+End', 'Control+ArrowUp', 'Control+ArrowUp'], threeParas, async t => eq(await paraIndex(t), 1, 'paragraph')),
  textCase('select-para-end', 'Control+Shift+ArrowDown', threeParas, async t => eq(await selectedText(t), 'one', 'selected text')),
  textCase('select-para-start', ['Control+End', 'Control+Shift+ArrowUp'], threeParas, async t => eq(await selectedText(t), 'three', 'selected text')),
  textCase('move-para-down', 'Alt+Shift+ArrowDown', threeParas, async t => eq((await paraTexts(t)).join(','), 'two,one,three', 'paragraphs'), ['Control+Shift+ArrowDown']),
  textCase('move-para-up', ['Control+End', 'Alt+Shift+ArrowUp'], threeParas, async t => eq((await paraTexts(t)).join(','), 'one,three,two', 'paragraphs'), ['Meta+End', 'Control+Shift+ArrowUp']),
  { ...visibleCase('selection-pane', 'Alt+F10', '#elx-task-pane[data-pane=selection]', async t => { await t.goSlide(0); await t.clickCanvas(); }), mac: ['Alt+F10'],
    teardown: async t => { await t.ev(() => $('#elx-task-pane .elx-tp-close').click()); await t.closeAll(); } },
  { id: 'first-shape', keys: 'Control+Alt+Digit5', mac: null, setup: async t => { await t.goSlide(0); await t.clickCanvas(); await t.press('Escape'); },
    check: async t => eq(await t.ev(l => eval(l).GetCurrentController().selectedObjects.length, logic), 1, 'selected objects') },
  { id: 'regroup', keys: 'Control+Shift+J',
    setup: async t => { await t.goSlide(0); await historyBase(t); await t.clickCanvas(); await t.press(t.mod + '+A'); await t.press(t.mod + '+G'); await t.press(t.mod + '+Shift+G'); await t.clickCanvas(); },
    check: async t => { const n = await t.ev(l => { const d = eval(l), s = d.GetCurrentSlide(); return s.cSld.spTree.length + ':' + s.cSld.spTree[0].getObjectType() + ':' + JSON.stringify(d.elixirLastUngrouped ? d.elixirLastUngrouped.ids : null); }, logic);
      return n.startsWith('1:') + (await t.ev(() => AscDFH.historyitem_type_GroupShape)) ? true : `slide objects ${n}`; }, teardown: undoToBase },
  { id: 'find-next', keys: 'Shift+F4', setup: async t => { await t.goSlide(1); await t.clickCanvas(); await t.ev(() => { const api = PE.getController('Main').api; const p = new AscCommon.CSearchSettings(); p.put_Text('a'); api.asc_findText(p, true); window.__elxFind = 0; const o = api.asc_findText; api.asc_findText = function () { window.__elxFind++; return o.apply(this, arguments); }; }); },
    check: async t => (await t.ev(() => window.__elxFind)) > 0 ? true : 'Find not repeated',
    teardown: async t => { await t.ev(() => { const api = PE.getController('Main').api; delete api.asc_findText; api.asc_endFindText(); }); } },
  showCase('show-pen', 'Control+P', async t => eq(await t.ev(() => PE.getController('Main').api.isInkDrawerOn()), true, 'pen on')),
  showCase('show-eraser', 'Control+E', async t => eq(await t.ev(() => PE.getController('Main').api.isInkDrawerOn()), true, 'eraser on')),
  showCase('show-laser', 'Control+L', async t => eq(await t.ev(() => $('#pe-preview').hasClass('elx-pointer-laser')), true, 'laser pointer')),
  { ...showCase('show-hide-pointer', 'Control+H', async t => eq(await t.ev(() => $('#pe-preview').hasClass('elx-pointer-hidden')), true, 'pointer hidden')), mac: ['F5', 'Control+H'] },
  showCase('show-arrow', ['Control+L', 'Control+A'], async t => eq(await t.ev(() => !$('#pe-preview').hasClass('elx-pointer-laser') && !PE.getController('Main').api.isInkDrawerOn()), true, 'arrow pointer')),
  { id: 'cycle-panes', keys: [], setup: async t => { await t.goSlide(0); await t.clickCanvas(); await t.press('Escape'); },
    check: async t => {
      const where = () => t.ev(() => { const a = document.activeElement; if (a && $(a).closest('#toolbar').length) return 'ribbon'; if (a && $(a).closest('#statusbar').length) return 'status'; return PE.getController('Main').api.asc_GetPaneFocus(); });
      const seen = [];
      for (const k of ['F6', 'F6', 'F6', 'F6', 'Shift+F6']) { await t.press(k); seen.push(await where()); }
      return eq(seen.join(','), 'thumbnails,ribbon,status,slide,status', 'panes');
    }, teardown: async t => { await t.ev(() => PE.getController('Main').api.asc_SetPaneFocus('slide')); } },
  { ...spyCase('show-erase', ['F5', 'e'], 'asc_EraseAllInksOnSlide', async t => { await t.goSlide(0); await t.clickCanvas(); }), wait: 600 },
];
void SUB;
