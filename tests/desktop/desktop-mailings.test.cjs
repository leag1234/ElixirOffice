// SPDX-License-Identifier: AGPL-3.0-only
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const files = require('../../desktop/files.cjs');

const source = fs.readFileSync(path.resolve(__dirname, '../../desktop/renderer.js'), 'utf8');
const preload = fs.readFileSync(path.resolve(__dirname, '../../desktop/preload.cjs'), 'utf8');
const main = fs.readFileSync(path.resolve(__dirname, '../../desktop/main.cjs'), 'utf8');
const backstage = fs.readFileSync(path.resolve(__dirname, '../../desktop/backstage.js'), 'utf8');
const worker = fs.readFileSync(path.resolve(__dirname, '../../desktop/legacy-worker.js'), 'utf8');

test('desktop enables local Mailings and routes merged PDF through the client bundle', () => {
    assert.match(source, /ElixirLocal\.prepare\(main\.api,main,\{mailMerge:true\}\)/);
    assert.match(source, /buildPdf:buildLocalPdf/);
    assert.match(source, /if\(!frame\?\.AscCommon\?\.ClientPdf\)await script\(frame,'\/example\/local-assets\/sdkjs\/common\/clientpdf\/clientpdf\.js'\)/);
    assert.match(source, /AscCommon\.ClientPdf\.build\(api,Object\.assign\(\{\},downloadOptions,\{signal:signal\}\)\)/);
});

test('desktop selects local recipient files through a scoped native dialog', async () => {
    assert.match(source, /chooseMailMergeRecipients:chooseMailMergeRecipients/);
    assert.match(source, /eoDesktop\.mailMergeRecipients\(file\.token\)/);
    assert.match(preload, /mailMergeRecipients: token => ipcRenderer\.invoke\('eo:mail-merge-recipients', token\)/);
    assert.match(main, /handle\('mail-merge-recipients',token=>operation/);
    assert.match(main, /extensions:\['csv','xlsx','xls'\]/);
    assert.match(main, /files\.read\(result\.filePaths\[0\],\{maxBytes:20\*1024\*1024\}\)/);
    assert.match(main, /selected\.bytes\.length>20\*1024\*1024/);
    assert.match(main, /active\(token\);return \{name:path\.basename/);
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'eo-mailings-limit-'));
    const oversized = path.join(directory, 'recipients.csv');
    try {
        const handle = fs.openSync(oversized, 'w');
        try { fs.ftruncateSync(handle, 21 * 1024 * 1024); } finally { fs.closeSync(handle); }
        await assert.rejects(files.read(oversized, {maxBytes: 20 * 1024 * 1024}), /20 MiB/);
    } finally {
        fs.rmSync(directory, {recursive: true, force: true});
    }
});

test('desktop backstage preserves recipient import and merged output routing', () => {
    assert.match(backstage, /const localDownloadAs=main\.api\.downloadAs/);
    assert.match(backstage, /requested===win\.Asc\.c_oAscAsyncAction\.MailMergeLoadFile/);
    assert.match(backstage, /requested===win\.Asc\.c_oAscAsyncAction\.DownloadMerge\|\|options\?\.oDocumentMailMerge/);
    assert.match(backstage, /localDownloadAs\.call\(main\.api,requested,options\)/);
    assert.match(worker, /json:2056/);
});
