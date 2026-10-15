// Success criteria of the "clean up" task. before/after: tools/eval/lib.mjs snapshots.
// Block roles in input.docx:
const TITLE = 0, SUBTITLE = 1, SECTIONS = [2, 4, 9, 11], SUBSECTIONS = [5, 7], BODY = [3, 6, 8, 10, 12];
const level = s => { const m = /^Heading (\d)$/.exec(s || ""); return m ? +m[1] : (s === "Title" ? 0 : null); };
export function check(before, after, run) {
  const r = [];
  const b = after.blocks;
  const add = (name, pass, detail) => r.push({ name, pass: !!pass, detail });
  add("same blocks and texts", b.length === before.blocks.length && before.blocks.every((x, i) => b[i].text === x.text), "");
  if (b.length !== before.blocks.length) return r;
  const secLv = SECTIONS.map(i => level(b[i].style)), subLv = SUBSECTIONS.map(i => level(b[i].style));
  add("section titles share one heading level", secLv.every(l => l !== null && l >= 1 && l === secLv[0]), SECTIONS.map(i => b[i].style).join(", "));
  add("subsection titles one level below", subLv.every(l => l !== null && l === secLv[0] + 1), SUBSECTIONS.map(i => b[i].style).join(", "));
  const tl = level(b[TITLE].style);
  add("document title is Title or a heading above the sections", tl !== null && tl < secLv[0], b[TITLE].style);
  add("body paragraphs in Normal", BODY.every(i => b[i].style === "Normal"), BODY.map(i => b[i].style).join(", "));
  add("subtitle line in Normal or Subtitle", ["Normal", "Subtitle"].includes(b[SUBTITLE].style), b[SUBTITLE].style);
  const rev = after.revisions["Elixir AI"] || [];
  add("style changes recorded as tracked changes", rev.includes("ParaPr"), rev.length + " revisions");
  return r;
}
