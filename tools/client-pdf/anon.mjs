// SPDX-License-Identifier: AGPL-3.0-only
// Shared helper for the private corpus (docs/client-pdf.md, docs/fidelity.md): the same rule as
// tools/fidelity/corpus_anon.py. A corpus is private with --private, EO_PRIVATE_CORPUS=1 or a path
// containing "corpus-private". Then every id a tool prints or writes is anonId(relative path), and
// every error text goes through makeScrubber() so that no file name appears in any output.
import crypto from "crypto";
import fs from "fs";
import path from "path";

export const SALT = "elixiroffice-private-corpus/v1";

export function anonId(rel) {
  const r = rel.split("\\").join("/");
  return "doc-" + crypto.createHash("sha256").update(SALT + "\0" + r, "utf8").digest("hex").slice(0, 10);
}

export function isPrivate(p, flag = false) {
  if (flag || process.env.EO_PRIVATE_CORPUS === "1") return true;
  let real;
  try { real = fs.realpathSync(p); } catch { real = path.resolve(p); }
  return real.includes("corpus-private");
}

// Replaces every known file name (path, base name, stem, URL-encoded forms) by its id.
export function makeScrubber(rels) {
  const pairs = new Map();
  for (const rel of rels) {
    const aid = anonId(rel);
    const base = path.posix.basename(rel);
    const stem = base.replace(/\.[^.]*$/, "");
    const quoted = rel.split("/").map(encodeURIComponent).join("/");
    for (const s of [rel, base, quoted, encodeURIComponent(base)]) if (s) pairs.set(s, aid);
    if (stem.length >= 3) pairs.set(stem, aid); // shorter stems would mangle ordinary text
  }
  const sorted = [...pairs].sort((a, b) => b[0].length - a[0].length);
  return (text) => {
    let t = String(text);
    for (const [s, aid] of sorted) t = t.split(s).join(aid);
    return t;
  };
}
