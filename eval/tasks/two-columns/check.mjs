// Success criteria of the "two columns" task. before/after: tools/eval/lib.mjs snapshots.
export function check(before, after, run) {
  const r = [];
  const b = after.blocks;
  const add = (name, pass, detail) => r.push({ name, pass: !!pass, detail });
  add("same blocks, texts and styles", b.length === before.blocks.length &&
      before.blocks.every((x, i) => b[i] && b[i].text === x.text && b[i].style === x.style), "");
  if (b.length !== before.blocks.length) return r;
  const body = [3, 4, 5, 6];
  add("section body (blocks 3-6) in 2 columns", body.every(i => b[i].cols === 2), body.map(i => b[i].cols).join(","));
  add("section heading (block 2) in 1 or 2 columns", [1, 2].includes(b[2].cols), String(b[2].cols));
  const outside = [0, 1, 7, 8, 9];
  add("content outside the selection stays in 1 column", outside.every(i => b[i].cols === 1), outside.map(i => b[i].cols).join(","));
  const first = b[2].cols === 2 ? 2 : 3;
  add("continuous section breaks (no new page)", b[first].secType === "continuous" && b[7].secType === "continuous", b[first].secType + "/" + b[7].secType);
  add("UI says the change is not trackable", run.untrackedNote, run.untrackedNote ? "shown" : "missing");
  return r;
}
