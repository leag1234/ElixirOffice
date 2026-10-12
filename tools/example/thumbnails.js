// SPDX-License-Identifier: AGPL-3.0-only
// Render first-page thumbnails of the start-page templates with the document
// server's own converter (no other renderer needed). Runs INSIDE a dev
// container (node is there), against the brand overlay already deployed:
//   node thumbnails.js <templates dir> [jwt secret]
// For each entry of <dir>/templates.json, POSTs a conversion request
// (outputtype png, thumbnail first page) to http://localhost/converter and
// writes <dir>/<thumb>. The template is fetched by the document server from
// http://localhost/example/elixir/brand/templates/<file>.
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const [dir, secret = process.env.JWT_SECRET] = process.argv.slice(2);
if (!dir || !secret) { console.error('usage: node thumbnails.js <dir> [jwt secret]'); process.exit(1); }

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const sign = (payload) => {
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest());
  return `${head}.${body}.${sig}`;
};
const request = (url, method, body) => new Promise((resolve, reject) => {
  const req = http.request(url, { method, headers: body ? { 'Content-Type': 'application/json', Accept: 'application/json' } : {} }, (res) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
  });
  req.on('error', reject);
  if (body) req.write(body);
  req.end();
});

(async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'templates.json'), 'utf8'));
  for (const tpl of manifest.templates) {
    if (!tpl.thumb) continue;
    const src = fs.readFileSync(path.join(dir, tpl.file));
    const thumbnail = { aspect: 1, first: true, width: 264, height: 374 };
    const params = {
      async: false,
      filetype: path.extname(tpl.file).slice(1),
      outputtype: 'png',
      // the converter caches by key: include the thumbnail settings
      key: crypto.createHash('sha1').update(src).update(JSON.stringify(thumbnail)).digest('hex').slice(0, 20),
      title: tpl.file,
      url: `http://localhost/example/elixir/brand/templates/${encodeURIComponent(tpl.file)}`,
      thumbnail,
    };
    params.token = sign(params);
    const res = await request('http://localhost/converter', 'POST', JSON.stringify(params));
    const out = JSON.parse(res.body.toString());
    if (!out.endConvert || !out.fileUrl) throw new Error(`${tpl.file}: ${res.body}`);
    const img = await request(out.fileUrl.replace(/^https?:\/\/[^/]+/, 'http://localhost'), 'GET');
    if (img.status !== 200) throw new Error(`${tpl.file}: download ${img.status}`);
    fs.writeFileSync(path.join(dir, tpl.thumb), img.body);
    console.log(`${tpl.thumb} ${img.body.length} bytes`);
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
