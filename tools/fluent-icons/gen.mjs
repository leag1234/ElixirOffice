#!/usr/bin/env node
// Generates the ElixirOffice web-apps toolbar icons from Microsoft's
// Fluent UI System Icons (MIT, https://github.com/microsoft/fluentui-system-icons).
//
// Usage:
//   npm pack @fluentui/svg-icons@<version> && tar xzf fluentui-svg-icons-*.tgz
//   node tools/fluent-icons/gen.mjs <path to package/icons>
//
// Reads map.json (web-apps sprite id -> Fluent icon) and writes
// branding/web-apps/theme/elixiroffice/assets/icons/toolbar/<scope>/[big/]<id>.svg,
// which web-apps build/scripts/deploy-sprites.js substitutes for the stock
// icons of the same id when building with THEME=elixiroffice.
//
// Sizes: "small" slots are 24px boxes -> Fluent 20px regular, centred 1:1
// (viewBox -2 -2 24 24); "big" slots are 28px boxes -> Fluent 24px regular,
// centred 1:1 (viewBox -2 -2 28 28).
// Style: "regular" by default; paths get class="icon-fill-gray-primary" so the
// theme colours them (light/dark) like the stock icons. An entry
//   { "name": "<regular>", "color": true | "<colour icon name>" }
// uses the multicolour "Color" style instead (<name>_<size>_color.svg, kept
// with its own fills and gradients, ids made unique per sprite symbol), for the
// most visible ribbon commands, like the colour accents of Office ribbons.
// Without a colour variant at that size the regular icon is used.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const src = process.argv[2];
if (!src || !fs.existsSync(src)) {
  console.error('usage: node gen.mjs <@fluentui/svg-icons package/icons dir>');
  process.exit(1);
}
const out = path.join(repo, 'branding', 'web-apps', 'theme', 'elixiroffice', 'assets', 'icons', 'toolbar');
const map = JSON.parse(fs.readFileSync(path.join(here, 'map.json'), 'utf8'));

const SIZES = {
  small: { fluent: 20, viewBox: '-2 -2 24 24', box: 24, sub: '' },
  big:   { fluent: 24, viewBox: '-2 -2 28 28', box: 28, sub: 'big' },
};

fs.rmSync(out, { recursive: true, force: true });
let n = 0;
const missing = [];
const noColor = [];
let nColor = 0;
for (const [key, val] of Object.entries(map)) {
  if (key.startsWith('_')) continue;
  const [scope, size, id] = key.split('/');
  const sz = SIZES[size];
  if (!sz) throw new Error(`bad size in ${key}`);
  const spec = typeof val === 'string' ? { name: val } : val;
  const colorName = spec.color === true ? spec.name : spec.color;
  const colorFile = colorName && path.join(src, `${colorName}_${sz.fluent}_color.svg`);
  const useColor = !!(colorFile && fs.existsSync(colorFile));
  if (colorName && !useColor) noColor.push(`${key} -> ${colorName}_${sz.fluent}_color`);
  const file = useColor ? colorFile : path.join(src, `${spec.name}_${sz.fluent}_regular.svg`);
  if (!fs.existsSync(file)) { missing.push(`${key} -> ${spec.name}`); continue; }
  let svg = fs.readFileSync(file, 'utf8');
  let inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  if (useColor) {
    // all symbols share one inline sprite: gradient ids must be unique
    const pre = `elx-${scope}-${id}-`;
    inner = inner.replace(/id="([^"]+)"/g, `id="${pre}$1"`).replace(/url\(#([^)]+)\)/g, `url(#${pre}$1)`);
    const res = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${spec.viewBox || sz.viewBox}" width="${sz.box}" height="${sz.box}" fill="none">` +
      `<!-- Fluent UI System Icons: ${colorName}_${sz.fluent}_color (MIT, Microsoft) -->${inner}</svg>\n`;
    const dir = path.join(out, scope, sz.sub);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${id}.svg`), res);
    n++; nColor++;
    continue;
  }
  if (spec.cut) {
    // keep the path data before the given sub-path (drops e.g. a built-in colour bar)
    inner = inner.replace(/d="([^"]*)"/, (m, d) => `d="${d.slice(0, d.indexOf(spec.cut))}"`);
  }
  inner = inner.replace(/<(path|circle|rect|ellipse|polygon)\b/g, '<$1 class="icon-fill-gray-primary"');
  const vb = spec.viewBox || sz.viewBox;
  const res = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${sz.box}" height="${sz.box}" fill="none">` +
    `<!-- Fluent UI System Icons: ${spec.name}_${sz.fluent}_regular (MIT, Microsoft) -->${inner}</svg>\n`;
  const dir = path.join(out, scope, sz.sub);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${id}.svg`), res);
  n++;
}
// Icons drawn for ElixirOffice where Fluent has no equivalent (custom/<scope>/[big/]<id>.svg): copied as-is
const custom = path.join(here, 'custom');
const copyCustom = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) { copyCustom(f); continue; }
    if (!e.name.endsWith('.svg')) continue;
    const dst = path.join(out, path.relative(custom, f));
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(f, dst);
    n++;
  }
};
fs.existsSync(custom) && copyCustom(custom);
fs.copyFileSync(path.join(here, 'LICENSE'), path.join(out, 'LICENSE'));
fs.writeFileSync(path.join(out, 'README.md'),
  'Generated by tools/fluent-icons/gen.mjs from Microsoft Fluent UI System Icons\n' +
  '(https://github.com/microsoft/fluentui-system-icons, MIT, see LICENSE).\n' +
  'Do not edit by hand: change tools/fluent-icons/map.json and regenerate.\n');
console.log(`${n} icons written to ${path.relative(repo, out)} (${nColor} in the Color style)`);
if (noColor.length) console.error('no Color variant (regular used):\n  ' + noColor.join('\n  '));
if (missing.length) { console.error('missing:\n  ' + missing.join('\n  ')); process.exit(2); }
