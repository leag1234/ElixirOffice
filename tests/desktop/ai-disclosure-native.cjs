// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const {launch,stop,editable,fixture,root}=require('./harness.cjs'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
(async()=>{
 const env=await launch({file:await fixture('sample.docx'),profile:'ai-disclosure-'+Date.now()});
 try{
  await editable(env);const frame=env.page.frames().find(f=>f.url().includes('/documenteditor/main/'));
  await frame.locator('#file[role=tab]').click();await frame.locator('#fm-btn-settings').click();
  const settings=await env.page.evaluate(()=>EODesktopStrings.settings);
  await env.page.locator('.desktop-options button').filter({hasText:'Elixir — '+settings}).click();
  const form=frame.locator('.elixir-ai-cfg:visible');await form.waitFor();
  const text=await form.innerText(),language=(await env.page.evaluate(()=>eoDesktop.locale())).language;
  assert.equal(typeof language,'string');
  assert.match(text,/encrypted by your operating system|chiffrée par votre système/);
  assert.match(text,/never shown again|ne sera jamais réaffichée/);
  assert.doesNotMatch(text,/localStorage|in clear text|en clair|stored only in this browser|dans ce navigateur/i);
  assert.equal(await frame.evaluate(()=>typeof window.eoDesktopAI),'object');
  assert.equal(await frame.locator('#elixir-ai-key:visible').inputValue(),'');
  await env.page.screenshot({path:path.join(root,'results','ai-disclosure-'+process.platform+'.png')});
  await fs.writeFile(path.join(root,'results','ai-disclosure-'+process.platform+'.json'),JSON.stringify({language,text,errors:env.errors},null,2));
  assert.deepEqual(env.errors,[]);console.log('PASS actual packaged desktop AI encrypted-key disclosure, no browser/plaintext message',language);
 }finally{await stop(env)}
})().catch(error=>{console.error(error);process.exitCode=1});
