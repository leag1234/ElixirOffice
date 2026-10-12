// SPDX-License-Identifier: AGPL-3.0-only
// Exercise the production entrypoint: off -> managed mock -> off, by recreation.
// Reads only this test installation's generated private env; never emits its contents.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import {execFileSync} from 'node:child_process';
const dir = process.env.EO_SERVER_INSTALL;
const lab = process.env.EO_SERVER_LAB;
const project = process.env.EO_SERVER_PROJECT;
const base = process.env.EO_BASE;
assert(dir && lab && project && base, 'explicit own installation required');
assert(project === 'eo-server-d', 'test is restricted to session D project');
const file = dir + '/server.env';
const original = fs.readFileSync(file, 'utf8');
const fakeKey = 'server-D-mock-only';
const calls = [];
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    calls.push({auth:req.headers.authorization, cookie:req.headers.cookie,
      forwarded:req.headers['x-forwarded-for'], body:JSON.parse(body)});
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({choices:[{message:{role:'assistant', content:'ok'}}]}));
  });
});
await new Promise(resolve => server.listen(18889, '0.0.0.0', resolve));
const update = values => {
  let text = original;
  for (const [key, value] of Object.entries(values)) {
    text = text.replace(new RegExp('^'+key+'=.*$', 'm'), key+'='+value);
  }
  fs.writeFileSync(file, text, {mode:0o600});
};
const recreate = async () => {
  execFileSync('docker', ['compose','-p',project,'--env-file',file,
    '-f',dir+'/docker-compose.yml','-f',lab,'up','-d','--force-recreate','documentserver'],
    {stdio:'pipe'});
  for (let i=0;i<120;i++) {
    try {
      const response = await fetch(base+'/healthcheck');
      if (response.ok && await response.text()==='true') return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve,1000));
  }
  throw new Error('owned production instance did not become healthy');
};
try {
  const off = await (await fetch(base+'/elixir-ai/config.json')).json();
  assert.equal(off.enabled,false);
  assert.equal(calls.length,0);
  update({ELIXIR_AI_BASE_URL:'http://172.17.0.1:18889/v1',
    ELIXIR_AI_MODEL:'mock-model', ELIXIR_AI_API_KEY:fakeKey});
  await recreate();
  const response = await fetch(base+'/elixir-ai/config.json');
  const config = await response.text();
  assert.equal(JSON.parse(config).enabled,true);
  assert(!config.includes(fakeKey), 'managed key absent from browser config');
  const chat = await fetch(base+'/elixir-ai/v1/chat/completions', {
    method:'POST', headers:{'Content-Type':'application/json',Cookie:'browser-probe=discard'},
    body:JSON.stringify({model:'mock-model',messages:[{role:'user',content:'ok'}]})});
  assert.equal(chat.status,200);
  assert.equal(calls.length,1);
  assert.equal(calls[0].auth,'Bearer '+fakeKey);
  assert.equal(calls[0].cookie,undefined);
  assert.equal(calls[0].forwarded,undefined);
  update({ELIXIR_AI_BASE_URL:'',ELIXIR_AI_MODEL:'',ELIXIR_AI_API_KEY:''});
  await recreate();
  assert.equal((await (await fetch(base+'/elixir-ai/config.json')).json()).enabled,false);
  assert.equal(calls.length,1);
  console.log(JSON.stringify({off:true, managed:true, keyHidden:true,
    cookiesDiscarded:true, forwardedIpDiscarded:true, offAfterRecreate:true}));
} finally {
  fs.writeFileSync(file,original,{mode:0o600});
  // Ensure credentials used only for the mock cannot remain active after a test failure.
  await recreate();
  await new Promise(resolve => server.close(resolve));
}
