// Production portal: actual keyboard edit, saved DOCX, close and reopen.
// For the local-CA test only, Chromium trusts the supplied test certificate SPKI without system changes;
// Node fetch must use NODE_EXTRA_CA_CERTS, and curl separately verifies TLS.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import * as L from '../../tools/eval/lib.mjs';
const out = process.env.EO_SERVER_OUT;
assert(out, 'EO_SERVER_OUT is required');
assert(L.BASE !== 'http://localhost:8080', 'never use the lead instance');
const marker = 'EO_SERVER_REVIEW_' + Date.now();
const originalLaunch = L.chromium.launch.bind(L.chromium);
L.chromium.launch = async options => {
  const args = process.env.EO_TEST_CA_SPKI ? ['--ignore-certificate-errors-spki-list=' + process.env.EO_TEST_CA_SPKI, '--host-resolver-rules=MAP office-server-d.test 127.0.0.1'] : [];
  const browser = await originalLaunch({...options, args});
  const create = browser.newContext.bind(browser);
  browser.newContext = options => create(options);
  return browser;
};
let healthy = false;
for (let i=0;i<120;i++) {
  try {const r=await fetch(L.BASE+'/healthcheck'); if (r.ok && await r.text()==='true') {healthy=true;break;}} catch {}
  await new Promise(resolve=>setTimeout(resolve,1000));
}
assert(healthy, 'own production instance is healthy before editing');
const config = await (await fetch(L.BASE + '/elixir-ai/config.json')).json();
assert.equal(config.enabled, false);
const name = await L.uploadDocx(L.REPO + '/corpus/provisional/teachers/t01-fiche-fractions-cm1.docx');
const result = {name, marker, base: L.BASE, aiOff: true};
let session;
try {
  session = await L.launch();
  const f = await L.openEditor(session.page, name);
  await f.evaluate(() => {
    const d = Asc.editor.WordControl.m_oLogicDocument;
    d.RemoveSelection(); d.MoveCursorToStartPos(); d.UpdateInterface();
  });
  await L.focusEditor(f);
  await session.page.keyboard.type(marker);
  await session.page.keyboard.press('Control+s');
  const text = await L.cmd(f, 'Api.GetDocument().GetText({Numbering:false})');
  assert(text.includes(marker), 'real keyboard edit accepted');
  await f.waitForFunction(() => !Asc.editor.isDocumentModified(), null, {timeout:30000});
  assert.deepEqual(session.errors, [], 'no initial browser errors');
  await session.browser.close();
  session = null;
  let saved = false;
  for (let i = 0; i < 40; i++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const response = await fetch(L.BASE + '/example/download?fileName=' + encodeURIComponent(name),
      {headers: {Cookie:'uid=uid-1'}});
    if (response.ok) {
      fs.writeFileSync(out + '/saved.docx', Buffer.from(await response.arrayBuffer()));
      try {
        const xml = execFileSync('python3', ['-c',
          'import zipfile,sys,xml.etree.ElementTree as E; r=E.fromstring(zipfile.ZipFile(sys.argv[1]).read("word/document.xml")); print("".join(x.text or "" for x in r.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t")))',
          out + '/saved.docx'], {encoding:'utf8'});
        if (xml.includes(marker)) {saved = true; break;}
      } catch {}
    }
  }
  assert(saved, 'actual downloaded DOCX contains saved edit');
  session = await L.launch();
  const reopened = await L.openEditor(session.page, name);
  const final = await L.cmd(reopened, 'Api.GetDocument().GetText({Numbering:false})');
  assert(final.includes(marker), 'saved edit survives editor reopen');
  assert.deepEqual(session.errors, [], 'no browser errors');
  result.saved = true; result.reopened = true;
  fs.writeFileSync(out + '/lifecycle.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify({aiOff:true, saved:true, reopened:true}));
} finally {
  if (session) await session.browser.close();
}
