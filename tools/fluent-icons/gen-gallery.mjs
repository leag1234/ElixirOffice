#!/usr/bin/env node
// Generates the data of the Insert > Icons gallery (DE.Views.IconsDialog) from
// Microsoft's Fluent UI System Icons (MIT, https://github.com/microsoft/fluentui-system-icons).
//
// Usage: node tools/fluent-icons/gen-gallery.mjs <@fluentui/svg-icons package/icons dir>
//
// Reads gallery.json (category -> Fluent base names) and writes
// branding/web-apps/theme/elixiroffice/assets/img/icons-gallery/icons.json, deployed by
// web-apps build/scripts/deploy-theme-images.js to apps/common/main/resources/img/.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const src = process.argv[2];
if (!src || !fs.existsSync(src)) {
  console.error('usage: node gen-gallery.mjs <@fluentui/svg-icons package/icons dir>');
  process.exit(1);
}
const spec = JSON.parse(fs.readFileSync(path.join(here, 'gallery.json'), 'utf8'));
const out = { license: 'Fluent UI System Icons, Copyright (c) Microsoft Corporation, MIT License', size: 24, categories: [] };
const missing = [];
let n = 0;
for (const [id, names] of Object.entries(spec)) {
  if (id.startsWith('_')) continue;
  const icons = [];
  for (const name of names) {
    const file = path.join(src, `${name}_24_filled.svg`);
    if (!fs.existsSync(file)) { missing.push(name); continue; }
    const svg = fs.readFileSync(file, 'utf8');
    const paths = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map(m => m[1]);
    if (!paths.length) { missing.push(name); continue; }
    icons.push({ n: name, d: paths });
    n++;
  }
  out.categories.push({ id, icons });
}
const dir = path.join(repo, 'branding', 'web-apps', 'theme', 'elixiroffice', 'assets', 'img', 'icons-gallery');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'icons.json'), JSON.stringify(out));
fs.copyFileSync(path.join(here, 'LICENSE'), path.join(dir, 'LICENSE'));
console.log(`${n} icons in ${out.categories.length} categories`);
if (missing.length) console.error('missing (skipped): ' + missing.join(', '));
