// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const network=require('./fixtures/deny-update-network.cjs')();
const {createWindowsSecurity}=require('../../desktop/update-windows-security.cjs');
test.after(()=>assert.equal(network.calls,0));
test('native ACL and durable move use fixed encoded source and data-only paths',async()=>{
 const calls=[],security=createWindowsSecurity({platform:'win32',systemRoot:'C:\\Windows',execFileSync(...args){calls.push(args);return 'OK';}});
 const secretPath='C:\\Users\\Synthetic\\quote\';$(echo danger)';assert.equal(await security.verify(secretPath,true),true);
 assert.equal(await security.replace(secretPath,secretPath+'-dest'),true);
 for(const [exe,args,options]of calls){assert.equal(exe,'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
  assert.deepEqual(args.slice(0,3),['-NoProfile','-NonInteractive','-EncodedCommand']);
  const source=Buffer.from(args[3],'base64').toString('utf16le');assert(!source.includes(secretPath));assert(source.includes('GetAccessRules')||source.includes('MoveFileEx'));
  assert.equal(options.shell,false);assert.equal(options.timeout,15000);assert.equal(options.maxBuffer,8192);assert(!('PATH' in options.env));assert(!('OPENAI_API_KEY' in options.env));}
 assert.equal(calls[0][2].env.EO_UPDATE_SOURCE,secretPath);
});
test('native security failure, noisy output and unsupported host fail closed',async()=>{
 for(const result of ['NO','OK\nunexpected']){const s=createWindowsSecurity({platform:'win32',systemRoot:'C:\\Windows',execFileSync:()=>result});assert.equal(await s.verify('C:\\safe',true),false);}
 const s=createWindowsSecurity({platform:'win32',systemRoot:'C:\\Windows',execFileSync(){throw Error('private path');}});assert.equal(await s.verify('C:\\safe',true),false);
 assert.throws(()=>createWindowsSecurity({platform:'linux'}));assert.throws(()=>createWindowsSecurity({platform:'win32',systemRoot:'relative'}));
});
test('NSIS registration checks only the pinned product GUID and exact install/uninstall paths',async()=>{
 const calls=[],s=createWindowsSecurity({platform:'win32',systemRoot:'C:\\Windows',execFileSync(exe,args,options){calls.push({source:Buffer.from(args[3],'base64').toString('utf16le'),options});return 'OK';}});
 assert.equal(await s.installed('C:\\Users\\Synthetic\\ElixirOffice'),true);
 const source=calls[0].source;
 assert(source.includes('5fa5daf2-a61b-5cb4-8b40-2391c8734adc'));
 assert(source.includes("Software\\5fa5daf2-a61b-5cb4-8b40-2391c8734adc"));
 assert(!source.includes('GetSubKeyNames'),'Never enumerate unrelated installed applications');
 assert(source.includes('InstallLocation'));assert(source.includes('UninstallString'));
 assert(!source.includes('C:\\Users\\Synthetic'));assert.equal(calls[0].options.env.EO_UPDATE_SOURCE,'C:\\Users\\Synthetic\\ElixirOffice');
 const {createRequire}=require('node:module'),path=require('node:path'),load=createRequire(path.resolve(__dirname,'../../desktop/package.json')),{UUID}=load('builder-util-runtime'),pkg=load('./package.json');
 assert.equal(UUID.v5(pkg.build.appId,UUID.parse('50e065bc-3134-11e6-9bab-38c9862bdaf3')),'5fa5daf2-a61b-5cb4-8b40-2391c8734adc');
 assert(!pkg.build.nsis.guid,'A configured NSIS GUID requires explicit eligibility migration');
});
