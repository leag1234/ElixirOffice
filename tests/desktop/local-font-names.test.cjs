// SPDX-License-Identifier: AGPL-3.0-only
"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const upstream = process.env.EO_UPSTREAM || path.join(require("node:os").homedir(), "elixiroffice/DocumentServer");
const web = process.env.EO_WEB_APPS || path.join(upstream, "web-apps");
const core = fs.readFileSync(path.join(web, "apps/common/main/lib/elixir-localfonts/Core.js"), "utf8");

function load() {
 const AscFonts = {g_font_infos: [], g_font_files: [], g_map_font_index: {}, g_fontApplication: {FontPickerMap: {}},
  CFontFileLoader: function (id) { this.Id = id; }, CFontInfo: function () { this.args = [...arguments]; }};
 const AscCommon = {g_font_loader: {}};
 const window = {AscFonts, AscCommon, Common: {}, console, localStorage: {getItem() {}, setItem() {}, removeItem() {}}};
 vm.runInNewContext(core, {window, AscFonts, define: (_d, f) => f(), AscCommon, performance, console, setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {}, navigator: {}});
 return {LF: window.Common.ElixirLocalFonts, AscFonts};
}
const face = (family, style, fullName, extra = {}) => ({family, style, fullName, postscriptName: (fullName || family).replace(/\s/g, ""), id: family + style, bytes: 10, ...extra});

test("localized family names from the font are registered for documents (#62)", () => {
 const {LF, AscFonts} = load();
 LF.fonts = [face("MS Gothic", "Regular", "MS Gothic", {aliases: ["ＭＳ ゴシック"]})];
 const added = LF.register();
 assert.ok(added.includes("MS Gothic"));
 assert.ok(added.includes("ＭＳ ゴシック"), "Japanese name registered");
 assert.notEqual(AscFonts.g_map_font_index["ＭＳ ゴシック"], undefined);
});

test("the full name of a bold face selects that face (#65)", () => {
 const {LF, AscFonts} = load();
 LF.fonts = [face("Open Sans", "Regular", "Open Sans Regular"), face("Open Sans", "Bold", "Open Sans Bold")];
 const added = LF.register();
 assert.ok(added.includes("Open Sans"));
 assert.ok(added.includes("Open Sans Bold"), "full name of the bold face registered");
 assert.notEqual(AscFonts.g_map_font_index["Open Sans Bold"], undefined);
 assert.equal(added.includes("Open Sans Regular"), false, "plain regular full name stays part of its family");
});
