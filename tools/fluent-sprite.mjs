// Build the SVG sprite of the home page from Microsoft Fluent UI System Icons
// (MIT, https://github.com/microsoft/fluentui-system-icons).
// Only the icons listed below are vendored. Usage:
//   node tools/fluent-sprite.mjs <out.svg> [ref]
// Icons are fetched from raw.githubusercontent.com at <ref> (a commit, default main).
import { writeFileSync } from 'node:fs';

const ICONS = {
  // id in the sprite: [Fluent folder, file name]
  home: ['Home', 'ic_fluent_home_24_regular'],
  'home-f': ['Home', 'ic_fluent_home_24_filled'],
  add: ['Add', 'ic_fluent_add_24_regular'],
  'add-f': ['Add', 'ic_fluent_add_24_filled'],
  open: ['Folder Open', 'ic_fluent_folder_open_24_regular'],
  'open-f': ['Folder Open', 'ic_fluent_folder_open_24_filled'],
  word: ['Document Text', 'ic_fluent_document_text_24_regular'],
  'word-f': ['Document Text', 'ic_fluent_document_text_24_filled'],
  cell: ['Table', 'ic_fluent_table_24_regular'],
  'cell-f': ['Table', 'ic_fluent_table_24_filled'],
  slide: ['Slide Text', 'ic_fluent_slide_text_24_regular'],
  'slide-f': ['Slide Text', 'ic_fluent_slide_text_24_filled'],
  pdf: ['Document PDF', 'ic_fluent_document_pdf_24_regular'],
  'pdf-f': ['Document PDF', 'ic_fluent_document_pdf_24_filled'],
  file: ['Document', 'ic_fluent_document_24_regular'],
  search: ['Search', 'ic_fluent_search_24_regular'],
  more: ['More Horizontal', 'ic_fluent_more_horizontal_24_regular'],
  download: ['Arrow Download', 'ic_fluent_arrow_download_24_regular'],
  delete: ['Delete', 'ic_fluent_delete_24_regular'],
  upload: ['Arrow Upload', 'ic_fluent_arrow_upload_24_regular'],
  wrench: ['Wrench', 'ic_fluent_wrench_24_regular'],
  dismiss: ['Dismiss', 'ic_fluent_dismiss_24_regular'],
  'new-tab': ['Open', 'ic_fluent_open_24_regular'],
  warning: ['Warning', 'ic_fluent_warning_24_regular'],
  cloud: ['Cloud', 'ic_fluent_cloud_24_regular'],
  'cloud-f': ['Cloud', 'ic_fluent_cloud_24_filled'],
  // two-tone Office/OneDrive yellow (TONES below)
  folder: ['Folder', 'ic_fluent_folder_24_filled'],
  laptop: ['Laptop', 'ic_fluent_laptop_24_regular'],
  'laptop-f': ['Laptop', 'ic_fluent_laptop_24_filled'],
  person: ['Person', 'ic_fluent_person_24_regular'],
  edit: ['Edit', 'ic_fluent_edit_24_regular'],
  'sign-out': ['Sign Out', 'ic_fluent_sign_out_24_regular'],
  link: ['Plug Connected', 'ic_fluent_plug_connected_24_regular'],
  check: ['Checkmark', 'ic_fluent_checkmark_24_regular'],
  chevron: ['Chevron Right', 'ic_fluent_chevron_right_24_regular'],
  lock: ['Lock Closed', 'ic_fluent_lock_closed_24_regular'],
};

// Fixed colours for some filled icons, one fill per sub-path in order: the
// folder is a tab (darker) and a body (lighter), like OneDrive and Office folders.
const TONES = { folder: ['#e8a317', '#ffc83d'] };

const [out, ref = 'main'] = process.argv.slice(2);
if (!out) { console.error('usage: node tools/fluent-sprite.mjs <out.svg> [ref]'); process.exit(1); }
const base = `https://raw.githubusercontent.com/microsoft/fluentui-system-icons/${ref}/assets`;
const symbols = [];
for (const [id, [folder, name]] of Object.entries(ICONS)) {
  const url = `${base}/${encodeURIComponent(folder)}/SVG/${name}.svg`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const svg = await res.text();
  const viewBox = svg.match(/viewBox="([^"]+)"/)[1];
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
    .replace(/fill="#212121"/g, 'fill="currentColor"').replace(/\s*\n\s*/g, '').trim();
  if (TONES[id]) {
    const parts = inner.match(/ d="([^"]+)"/)[1].split(/(?=M)/);
    if (parts.length !== TONES[id].length) throw new Error(`${id}: ${parts.length} sub-paths`);
    symbols.push(`<symbol id="i-${id}" viewBox="${viewBox}">${parts.map((d, i) => `<path d="${d}" fill="${TONES[id][i]}"/>`).join('')}</symbol>`);
    continue;
  }
  symbols.push(`<symbol id="i-${id}" viewBox="${viewBox}">${inner}</symbol>`);
}
writeFileSync(out, `<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">`
  + `<!-- Fluent UI System Icons, (c) Microsoft Corporation, MIT License (see fluent/LICENSE); ref ${ref} -->`
  + `${symbols.join('')}</svg>\n`);
console.log(`${symbols.length} icons -> ${out}`);
