#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Draws the Borders icons of the ElixirOffice ribbon (Home > Borders split button, its drop-down,
// Table Design > Borders, and the same glyphs in the spreadsheet editor).
//
// Why custom: Fluent's border_* icons are rounded outlines whose "active" edge is not distinguishable
// from the dashed ones at 20 px, so Bottom, Top, Left, Right and No borders looked identical. These
// follow Word: a square of dots (the edges that are off), the edges that are on drawn solid and
// 2 px thick, the same for the inner lines (cross). Everything sits on whole pixels of the 20 px
// grid (1 px dots, 2 px lines) so it stays crisp at 100% and 150% and is the same square in all ten
// variants. Fill only (class icon-fill-gray-primary) so the theme colours it in light and dark.
//
// Usage: node tools/fluent-icons/gen-borders.mjs
// Writes custom/common/btn-border-*.svg (picked up by gen.mjs) and the same files into
// branding/web-apps/theme/elixiroffice/assets/icons/toolbar/ so no full regeneration is needed.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const outTheme = path.join(repo, 'branding/web-apps/theme/elixiroffice/assets/icons/toolbar');

const L = 2, R = 18, T = 2, B = 18;          // 16 x 16 square, 2..18
const dot = (x, y) => `M${x} ${y}h1v1h-1z`;
// edge dots (pinwheel so that the four corners are all filled)
const dots = {
  top:    () => range(L, R - 1).map(x => dot(x, T)),
  right:  () => range(T, B - 1).map(y => dot(R - 1, y)),
  bottom: () => range(L + 1, R).map(x => dot(x, B - 1)),
  left:   () => range(T + 1, B).map(y => dot(L, y)),
  hor:    () => range(L + 1, R - 1).map(x => dot(x, 9)),
  ver:    () => range(T + 1, B - 1).map(y => dot(9, y)),
};
function range(a, b) { const r = []; for (let i = a; i < b; i += 2) r.push(i); return r; }
const solid = {
  top: [L, T, 16, 2], bottom: [L, B - 2, 16, 2], left: [L, T, 2, 16], right: [R - 2, T, 2, 16],
  hor: [L, 9, 16, 2], ver: [9, T, 2, 16],
};
const rect = ([x, y, w, h]) => `<rect class="icon-fill-gray-primary" x="${x}" y="${y}" width="${w}" height="${h}"/>`;

// which of the six lines are on
const VARIANTS = {
  'btn-border-bottom':    ['bottom'],
  'btn-border-top':       ['top'],
  'btn-border-left':      ['left'],
  'btn-border-right':     ['right'],
  'btn-border-no':        [],
  'btn-border-all':       ['top', 'bottom', 'left', 'right', 'hor', 'ver'],
  'btn-border-out':       ['top', 'bottom', 'left', 'right'],
  'btn-border-inside':    ['hor', 'ver'],
  'btn-border-insidehor': ['hor'],
  'btn-border-insidevert': ['ver'],
};

function small(on) {
  const off = Object.keys(dots).filter(k => !on.includes(k));
  const d = off.flatMap(k => dots[k]()).join('');
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 24 24" width="24" height="24" fill="none">' +
    `<!-- ElixirOffice: Borders glyph drawn for the ribbon (edges on = solid 2 px, edges off = dots), AGPL-3.0 -->` +
    (d ? `<path class="icon-fill-gray-primary" opacity=".5" d="${d}"/>` : '') +
    on.map(k => rect(solid[k])).join('') + '</svg>\n';
}

// 28 px slot (24 px Fluent grid, 3..21 square): the Borders button of the Table Design tab = all borders
function big() {
  const a = 3, b = 21, w = 2;
  const r = (x, y, ww, hh) => `<rect class="icon-fill-gray-primary" x="${x}" y="${y}" width="${ww}" height="${hh}"/>`;
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 28 28" width="28" height="28" fill="none">' +
    '<!-- ElixirOffice: Borders glyph drawn for the ribbon, AGPL-3.0 -->' +
    r(a, a, b - a, w) + r(a, b - w, b - a, w) + r(a, a, w, b - a) + r(b - w, a, w, b - a) + r(11, a, w, b - a) + r(a, 11, b - a, w) + '</svg>\n';
}

let n = 0;
const put = (rel, svg) => {
  for (const base of [path.join(here, 'custom'), outTheme]) {
    const f = path.join(base, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, svg);
  }
  n++;
};
for (const [id, on] of Object.entries(VARIANTS)) put(`common/${id}.svg`, small(on));
put('documenteditor/big/btn-elx-borders.svg', big());
console.log(`${n} icons written`);
