// Success criteria of the "list to table" task. before/after: tools/eval/lib.mjs snapshots.
const ITEMS = [
  ["Mme Martin", "Groupe A", "Salle 12"], ["M. Dubois", "Groupe B", "Salle 14"], ["Mme Leroy", "Groupe C", "Salle 3"],
  ["M. Moreau", "Groupe D", "Gymnase"], ["Mme Petit", "Groupe E", "CDI"]
];
export function check(before, after, run) {
  const r = [];
  const add = (name, pass, detail) => r.push({ name, pass: !!pass, detail });
  const tables = after.blocks.filter(x => x.type === "table");
  add("exactly one table", tables.length === 1, String(tables.length));
  const t = tables[0];
  if (!t) return r;
  add("table placed where the list was (block 2)", t.i === 2, String(t.i));
  add("6 rows x 3 columns", t.rows === 6 && t.cells.every(c => c.length === 3), t.rows + "x" + (t.cells[0] || []).length);
  const head = t.cells[0] || [];
  add("header row: 3 non-empty labels, not a data row", head.length === 3 && head.every(Boolean) && !ITEMS.some(it => it.join("|") === head.join("|")), head.join(" | "));
  add("header row marked as repeating table header", t.header, String(t.header));
  add("data rows match the list items in order", ITEMS.every((it, i) => (t.cells[i + 1] || []).join("|") === it.join("|")), t.cells.slice(1).map(c => c.join("/")).join("; "));
  const rev = after.revisions["Elixir AI"] || [];
  add("list removed as a tracked deletion", rev.includes("TextRem") && rev.includes("ParaRem"), "");
  add("table recorded as a tracked insertion", rev.includes("RowsAdd") || rev.includes("TextAdd"), "");
  const keep = [0, 1, before.blocks.length - 1];
  add("other paragraphs unchanged", keep.every(i => after.blocks.some(x => x.text === before.blocks[i].text && x.style === before.blocks[i].style)), "");
  return r;
}
