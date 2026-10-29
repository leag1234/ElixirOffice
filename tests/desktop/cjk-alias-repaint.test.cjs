// SPDX-License-Identifier: AGPL-3.0-only
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const tool = fs.readFileSync(path.resolve(__dirname, '../../tools/desktop/cjk-font-ranges.py'), 'utf8');
const match = tool.match(/LAZY_LOADER = r'''([\s\S]*?)'''/);
assert(match);
const loader = match[1].replace('__CJK_TRIGGER_RANGES__', '[[4352,4607]]');
const alias = 'Elixir Fallback CJK SC';
const target = 'Noto Sans CJK SC';

function fixture(policyFirst) {
    const bundled = {m_wsFontName: alias, fontId: 'bundled-sc', localFontData: false};
    const system = {m_wsFontName: target, fontId: 'system-sc', localFontData: true};
    const substitute = {m_wsFontName: 'Liberation Sans', fontId: 'substitute', localFontData: false};
    let systemEnabled = false;
    const app = {
        FontPickerMap: {[alias]: bundled},
        GetFontFileWeb(name) {
            return this.FontPickerMap[name] || (name === alias ? bundled : systemEnabled && name === target ? system : substitute);
        }
    };
    const installPolicy = () => {
        const original = app.GetFontFileWeb;
        app.GetFontFileWeb = function(name, style) {
            return original.call(this, systemEnabled && name === alias ? target : name, style);
        };
        app.GetFontFileWeb.eoDesktopPolicy = true;
        app.FontPickerMap = {};
    };
    const picker = {getFontsByString() {}, getFontsByString2() {}, getFontBySymbol() {}};
    const window = {
        AscFonts: {FontPickerByCharacter: picker, g_fontApplication: app},
        Asc: {editor: {asc_enterText() {}, DocInfo: {get_OfflineApp: () => true}}},
        AscCommon: {g_font_loader: {}},
        Common: {}
    };
    const context = vm.createContext({window, performance: {now: () => 0}, setTimeout() {}});
    if (policyFirst) installPolicy();
    vm.runInContext(loader, context);
    if (!policyFirst) installPolicy();
    return {app, bundled, system, enableSystem() { systemEnabled = true; app.FontPickerMap = {}; }};
}

for (const policyFirst of [false, true]) {
    test('CJK repair preserves real bundled and system identity with policy hook ' + (policyFirst ? 'first' : 'last'), () => {
        const state = fixture(policyFirst);
        assert.equal(state.app.GetFontFileWeb(alias), state.bundled);
        assert.equal(state.app.GetFontFileWeb(target), state.bundled);
        state.app.FontPickerMap = {};
        assert.equal(state.app.GetFontFileWeb(alias), state.bundled);
        assert.equal(state.app.GetFontFileWeb(target), state.bundled);
        state.enableSystem();
        assert.equal(state.app.GetFontFileWeb(alias), state.system);
        assert.equal(state.app.GetFontFileWeb(target), state.system);
        assert.equal(state.app.GetFontFileWeb(target).m_wsFontName, target);
        assert.equal(state.app.GetFontFileWeb(target).localFontData, true);
    });
}
