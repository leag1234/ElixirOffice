// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
const sdk = process.env.EO_SDKJS || path.join(process.env.HOME, 'elixiroffice/wt/w1/sdkjs');
const source = fs.readFileSync(path.join(sdk, 'common/clientpdf/clientpdf.js'), 'utf8');
const version = '0123456789ab-abcdef012345-st';
async function scenario(mode) {
  const requests = [];
  const context = {
    URL, Promise, Uint8Array, Map, setTimeout, clearTimeout,
    window: { location: { href: 'http://localhost/web-apps/apps/documenteditor/main/index.html' } },
    AscCommon: {},
    fetch: async url => {
      requests.push(url);
      if (mode === 'network') throw new Error('offline');
      if (url.endsWith('current.json')) return { ok: mode !== 'absent', json: async () => ({artifact_version: mode === 'invalid' ? '../escape' : version}) };
      return { ok: true, json: async () => ({artifact_version: version, build_flags: {module_kind: mode === 'full' ? 'full' : 'pdf'}}) };
    }
  };
  vm.runInNewContext(source, context);
  const cp = context.window.AscCommon.ClientPdf;
  assert.equal(cp.getBackend(), 'js');
  const found = await Promise.all([cp.discoverRuntime(), cp.discoverRuntime()]);
  assert.deepEqual(found, [mode === 'present', mode === 'present']);
  await cp.discoverRuntime();
  assert.equal(requests.length, ['present', 'full'].includes(mode) ? 2 : 1);
  cp.setBackend('wasm');
  assert.equal(cp.getBackend(), mode === 'present' ? 'wasm' : 'js');
  cp.setBackend('js');
  assert.equal(cp.getBackend(), 'js');
}
for (const mode of ['present', 'absent', 'invalid', 'full', 'network']) await scenario(mode);
console.log('runtime discovery: present, absent, invalid, wrong kind, network failure and session caching pass');
