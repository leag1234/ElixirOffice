// Unit test of the client PDF writer (sdkjs common/clientpdf/eo-pdf.js) in Node, without an editor:
// a hand-made drawing-command stream drawn with a TrueType font, an OpenType CFF font, the second face
// of a TrueType collection, a symbol font by glyph id, a ligature glyph, paths, a gradient, a link,
// headings; then poppler checks the PDF (fonts embedded with the right types, text, rendering).
//   SDKJS=/srv/elixiroffice/DocumentServer/sdkjs node tests/client-pdf/writer.test.mjs
// Font files are taken from the host (FONT_TTF, FONT_OTF, FONT_TTC override them); never committed.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const SDKJS = process.env.SDKJS || path.join(os.homedir(), "elixiroffice/DocumentServer/sdkjs");
const fontkit = require(path.join(SDKJS, "common/clientpdf/vendor/fontkit/fontkit.umd.min.js"));
require(path.join(SDKJS, "common/clientpdf/eo-pdf.js"));
const EOPdf = globalThis.EOPdf;

const pick = (...c) => c.find(f => f && fs.existsSync(f));
const TTF = pick(process.env.FONT_TTF, path.join(os.homedir(), ".local/share/fonts/elixir-localfonts-test/FiraSans-Regular.ttf"), "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf");
const OTF = pick(process.env.FONT_OTF, "/usr/share/fonts/opentype/urw-base35/NimbusSans-Regular.otf");
const TTC = pick(process.env.FONT_TTC, "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc");
const SYM = pick(process.env.FONT_SYM, "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf");

let fails = 0;
const ok = (what, v, extra) => { console.log((v ? "ok   " : "FAIL ") + what + (v || extra === undefined ? "" : "  -> " + extra)); if (!v) fails++; };

// ---- stream encoder (sdkjs CMemory format) ----
class W {
  constructor() { this.b = []; }
  byte(v) { this.b.push(v & 255); return this; }
  int(v) { const x = Buffer.alloc(4); x.writeInt32LE(v | 0); this.b.push(...x); return this; }
  dbl(v) { return this.int(Math.round(v * 100000)); }
  str(s) { const x = Buffer.alloc(2); x.writeUInt16LE(s.length); this.b.push(...x); for (const c of s) { const y = Buffer.alloc(2); y.writeUInt16LE(c.charCodeAt(0)); this.b.push(...y); } return this; }
  bytes() { return new Uint8Array(this.b); }
}

const fonts = {};
function face(name, file, faceIndex = 0) { fonts[name] = { key: name, bytes: new Uint8Array(fs.readFileSync(file)), faceIndex }; }
face("Text", TTF); face("Cff", OTF); face("Sym", SYM);
if (TTC) face("Cjk", TTC, 1);

function glyphs(w, fontName, file, text, x, y, size, faceIndex = 0) {
  let f = fontkit.create(fs.readFileSync(file));
  if (f.fonts) f = f.fonts[faceIndex];
  const run = f.layout(text);
  w.byte(41).str(fontName).byte(42).dbl(size).byte(43).int(0);
  let cx = x;
  run.glyphs.forEach((g, i) => {
    w.byte(83).int(g.id).dbl(cx).dbl(y).int(g.codePoints.length);
    g.codePoints.forEach(cp => w.int(cp));
    cx += run.positions[i].xAdvance / f.unitsPerEm * size * 25.4 / 72;
  });
  return f;
}

const w = new W();
w.byte(163).int(1).str("Writer test");                                   // document info: title
w.byte(202).byte(200).dbl(210).byte(201).dbl(297);                      // page 1, A4
w.byte(22).int(0x202020);                                                // brush colour
glyphs(w, "Text", TTF, "Hello office fi ffl", 20, 30, 14);                // ligatures from the layout engine
glyphs(w, "Cff", OTF, "CFF outlines", 20, 45, 14);
if (TTC) glyphs(w, "Cjk", TTC, "日本語テキスト", 20, 60, 14, 1);
// a symbol by glyph id with its code point (like a Wingdings bullet resolved by the editor)
{ const f = fontkit.create(fs.readFileSync(SYM)); const g = f.glyphForCodePoint(0x2713); w.byte(41).str("Sym").byte(83).int(g.id).dbl(20).dbl(75).int(1).int(0x2713); }
// filled and stroked path, dashed, with alpha
w.byte(1).int(0x0000ff).byte(3).dbl(0.5).byte(4).byte(5).int(2).dbl(2).dbl(1).byte(22).int(0x00ff00).byte(24).byte(128);
w.byte(100).byte(91).dbl(20).dbl(90).byte(92).dbl(100).dbl(90).byte(92).dbl(100).dbl(110).byte(92).dbl(20).dbl(110).byte(97).byte(99).int(257).byte(98);
// linear gradient fill
w.byte(31).byte(0).byte(0).int(0).byte(0).dbl(110).dbl(0).dbl(190).dbl(0).byte(2).int(2).int(0).int(0xff0000ff | 0).int(100000).int(0xffff0000 | 0).byte(251);
w.byte(100).byte(91).dbl(110).dbl(90).byte(92).dbl(190).dbl(90).byte(92).dbl(190).dbl(110).byte(92).dbl(110).dbl(110).byte(97).byte(99).int(256).byte(98);
w.byte(21).int(1000);
// clip then reset
w.byte(121).int(0x20).byte(100).byte(91).dbl(0).dbl(0).byte(92).dbl(50).dbl(0).byte(92).dbl(50).dbl(50).byte(97).byte(122).int(0x20).byte(121).int(0x40);
// hyperlink and internal link to page 2
w.byte(160).dbl(20).dbl(25).dbl(60).dbl(6).str("https://example.org/").str("tip");
w.byte(161).dbl(20).dbl(40).dbl(60).dbl(6).dbl(10).dbl(20).int(1);
w.byte(203);
w.byte(202).byte(200).dbl(297).byte(201).dbl(210);                      // page 2, landscape
w.byte(22).int(0);
glyphs(w, "Text", TTF, "Second page", 20, 30, 12);
w.byte(203);
// headings (outline)
{ const h = new W(); h.int(2).int(0).int(0).dbl(20).dbl(30).str("Heading one").int(1).int(1).dbl(20).dbl(30).str("Sub heading");
  const body = h.bytes(); w.byte(169).int(body.length + 4); w.b.push(...body); }

const writer = new EOPdf.Writer({
  fontkit, producer: "ElixirOffice",
  getFont: async (name) => fonts[name] || null,
  getImage: async () => null,
});
await writer.feed(w.bytes());
const pdf = await writer.finish();
const out = path.join(os.tmpdir(), "eo-writer-test.pdf");
fs.writeFileSync(out, pdf);
const sh = (c, a) => { try { return execFileSync(c, a, { encoding: "utf8" }); } catch (e) { return String(e.stdout || "") + String(e.stderr || ""); } };

const info = sh("pdfinfo", [out]);
ok("PDF 1.7, 2 pages, title, producer", /PDF version:\s+1\.7/.test(info) && /Pages:\s+2/.test(info) && /Title:\s+Writer test/.test(info) && /Producer:\s+ElixirOffice/.test(info), info);
{ const sz = sh("pdfinfo", ["-f", "1", "-l", "2", out]);
  ok("page sizes (portrait then landscape)", /Page\s+1 size:\s+595\.\d+ x 841\.\d+/.test(sz) && /Page\s+2 size:\s+841\.\d+ x 595\.\d+/.test(sz), sz); }
const pf = sh("pdffonts", [out]);
ok("TrueType subset embedded (CID TrueType)", /CID TrueType\s+Identity-H\s+yes\s+yes\s+yes/.test(pf), pf);
ok("CFF font embedded as CID Type 0C", /CID Type 0C\s+Identity-H\s+yes\s+yes\s+yes/.test(pf), pf);
ok("all fonts embedded with ToUnicode", pf.split("\n").slice(2).filter(Boolean).every(l => / yes\s+yes\s+yes\s+\d+\s+0\s*$/.test(l)), pf);
const txt = sh("pdftotext", [out, "-"]);
ok("ligature glyphs give their letters back (office, ffl)", /office/.test(txt) && /ffl/.test(txt), txt);
ok("CFF text extracted", /CFF outlines/.test(txt));
if (TTC) ok("collection face 1 (CJK) text extracted", /日本語テキスト/.test(txt), txt);
ok("symbol drawn by glyph id is searchable (U+2713)", txt.includes("✓"));
ok("second page text", /Second page/.test(txt));
ok("link annotations", /example\.org/.test(sh("pdfinfo", ["-url", out])));
const ppm = path.join(os.tmpdir(), "eo-writer-test");
sh("pdftoppm", ["-r", "30", "-png", out, ppm]);
ok("pdftoppm renders both pages", fs.existsSync(ppm + "-1.png") && fs.existsSync(ppm + "-2.png"));
{
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync("pdftoppm", ["-r", "30", "-png", out, ppm + "-chk"], { encoding: "utf8" });
  ok("no error from poppler while rendering", !/Error/i.test(r.stderr), r.stderr.slice(0, 300));
}
ok("glyph and path counts", writer.stats.glyphs > 30 && writer.stats.paths === 2 && writer.stats.gradients === 1, JSON.stringify(writer.stats));

// unsupported content -> explicit error code (the editor falls back to the server)
{
  const u = new W(); u.byte(202).byte(162).int(8).int(0);
  const wr = new EOPdf.Writer({ fontkit, getFont: async () => null });
  let code = null; try { await wr.feed(u.bytes()); } catch (e) { code = e.eoUnsupported && e.code; }
  ok("form fields: Unsupported('form-fields')", code === "form-fields", code);
  const m = new W(); m.byte(202).byte(41).str("Nope").byte(83).int(3).dbl(1).dbl(1).int(0);
  const wm = new EOPdf.Writer({ fontkit, getFont: async () => null });
  code = null; try { await wm.feed(m.bytes()); } catch (e) { code = e.eoUnsupported && e.code; }
  ok("missing font: Unsupported('font-missing')", code === "font-missing", code);
}
console.log(fails ? fails + " failed checks" : "0 failed checks");
process.exit(fails ? 1 : 0);
