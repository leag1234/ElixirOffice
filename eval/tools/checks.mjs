// Helpers shared by the success criteria of the eval tasks (eval/tasks/*/check.mjs).
// before/after are tools/eval/lib.mjs snapshots; `final` is the document once changes are accepted.
export function criteria() {
  const r = [];
  r.add = (name, pass, detail) => { r.push({ name, pass: !!pass, detail: detail === undefined ? "" : String(detail) }); return !!pass; };
  return r;
}
export const paras = s => s.final.filter(b => b.type === "paragraph");
export const texts = s => paras(s).map(b => b.text.trim()).filter(Boolean);
export const norm = t => String(t || "").replace(/[’]/g, "'").replace(/\s+/g, " ").trim();
// the document did not change (final view, sections, comments)
export const unchanged = (a, b) => JSON.stringify(a.final) === JSON.stringify(b.final) && JSON.stringify(a.secs) === JSON.stringify(b.secs) && a.comments.length === b.comments.length;
// every original non-empty paragraph text is still there, in order
export function keptInOrder(before, after, only) {
  const want = (only || texts(before)).map(norm), have = texts(after).map(norm);
  let j = 0;
  for (const w of want) { while (j < have.length && have[j] !== w) j++; if (j >= have.length) return false; j++; }
  return true;
}
export const answerText = run => norm([run.summary, run.answer, run.status].join(" "));
export const near = (v, target, tol) => typeof v === "number" && Math.abs(v - target) <= tol;
export const tracked = (after, types) => { const rev = after.revisions["Elixir AI"] || []; return types.some(t => rev.includes(t)); };
