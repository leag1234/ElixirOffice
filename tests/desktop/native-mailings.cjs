// SPDX-License-Identifier: AGPL-3.0-only
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const cp = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {launch, stop, editable, fixture, root} = require('./harness.cjs');

const hash = bytes => crypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex');

(async () => {
    assert(process.env.EO_DESKTOP_EXECUTABLE, 'Own built desktop executable required');
    const file = await fixture(path.join(root, 'desktop/assets/templates/new.docx'));
    let env;
    try {
        env = await launch({file, profile: 'mailings-native-' + Date.now(), executable: process.env.EO_DESKTOP_EXECUTABLE});
        await editable(env);
        const frame = env.page.frames().find(candidate => candidate.url().includes('/documenteditor/main/'));
        assert(frame, 'Word editor frame missing');
        const mailingsTab = frame.locator('#toolbar a[data-tab=mailings]');
        await mailingsTab.waitFor({state: 'visible', timeout: 10000});
        await mailingsTab.click();
        await frame.locator('#elx-mm-finish').waitFor({state: 'visible', timeout: 10000});
        await env.page.evaluate(() => {
            window.EOMailMergeActions = [];
            EOLocalSession.api.asc_registerCallback('asc_onEndAction', (_type, id) => EOMailMergeActions.push(id));
            const api = EOLocalSession.api;
            const csv = new TextEncoder().encode('Name,City\nAlice,Paris\nBob,Lyon\n');
            api.mailMergeFileData = {fileType: 'csv', data: csv};
            const win = EOLocalSession.win;
            api.downloadAs(win.Asc.c_oAscAsyncAction.MailMergeLoadFile,
                new win.Asc.asc_CDownloadOptions(win.Asc.c_oAscFileType.JSON));
        });
        await env.page.waitForFunction(() => EOLocalSession.api.asc_GetReceptionsCount() === 2 || window.EOLocalFailure, null, {timeout: 120000});
        assert.equal(await env.page.evaluate(() => window.EOLocalFailure || null), null,
            JSON.stringify({
                page: await env.page.evaluate(() => ({actions: window.EOMailMergeActions, errors: window.EOLocalFailure})),
                browserErrors: env.errors,
                requests: env.requests.slice(-20)
            }));
        const result = await env.page.evaluate(async () => {
            const {api, controller, win} = EOLocalSession;
            const logic = api.WordControl.m_oLogicDocument;
            logic.MoveCursorToEndPos(false);
            api.asc_AddMailMergeField('Name');
            const sourceBefore = logic.GetAllParagraphs().map(paragraph => paragraph.GetText()).join('\n');
            api.asc_PreviewMailMergeResult(0);
            const preview = logic.GetAllParagraphs().map(paragraph => paragraph.GetText()).join('\n');
            api.asc_EndPreviewMailMergeResult();
            const merged = logic.Get_MailMergedDocument(0, 1);
            const state = await controller.snapshot(merged);
            const docx = await win.EOWasmConvert.convert(state.bytes, state.format, 'docx', {resources: state.resources});
            if (!win.AscCommon.ClientPdf) await new Promise((resolve, reject) => {
                const element = win.document.createElement('script');
                element.src = '/example/local-assets/sdkjs/common/clientpdf/clientpdf.js';
                element.onload = resolve;element.onerror = reject;win.document.head.appendChild(element);
            });
            const one = logic.Get_MailMergedDocument(0, 0);
            const two = logic.Get_MailMergedDocument(1, 1);
            const options = document => ({fileType: win.Asc.c_oAscFileType.PDF, oDocumentMailMerge: document});
            const pdfAll = await win.AscCommon.ClientPdf.build(api, options(merged));
            const pdfOne = await win.AscCommon.ClientPdf.build(api, options(one));
            const pdfTwo = await win.AscCommon.ClientPdf.build(api, options(two));
            return {
                fields: api.asc_GetMailMergeFieldsNameList(), count: api.asc_GetReceptionsCount(), preview,
                sourceBefore,
                sourceAfter: logic.GetAllParagraphs().map(paragraph => paragraph.GetText()).join('\n'),
                sourceSame: api.WordControl.m_oLogicDocument === logic,
                docx: Array.from(docx),
                pdfAll: Array.from(pdfAll.bytes), pdfOne: Array.from(pdfOne.bytes), pdfTwo: Array.from(pdfTwo.bytes),
                backends: [pdfAll.stats.backend, pdfOne.stats.backend, pdfTwo.stats.backend],
                pendingPictures: controller.hasPendingImages(), failure: window.EOLocalFailure || null
            };
        });
        assert.deepEqual(result.fields, ['Name', 'City']);
        assert.equal(result.count, 2);
        assert.match(result.preview, /Alice/);
        assert.equal(result.sourceAfter, result.sourceBefore);
        assert.equal(result.sourceSame, true);
        assert.deepEqual(Buffer.from(result.docx).subarray(0, 2), Buffer.from('PK'));
        for (const pdf of [result.pdfAll, result.pdfOne, result.pdfTwo]) assert.equal(Buffer.from(pdf).subarray(0, 4).toString(), '%PDF');
        assert.notEqual(hash(result.pdfOne), hash(result.pdfTwo));
        const outputDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'eo-mailings-output-'));
        try {
            const outputs = {
                docx: path.join(outputDirectory, 'combined.docx'),
                all: path.join(outputDirectory, 'combined.pdf'),
                one: path.join(outputDirectory, 'alice.pdf'),
                two: path.join(outputDirectory, 'bob.pdf')
            };
            await Promise.all([
                fs.writeFile(outputs.docx, Buffer.from(result.docx)),
                fs.writeFile(outputs.all, Buffer.from(result.pdfAll)),
                fs.writeFile(outputs.one, Buffer.from(result.pdfOne)),
                fs.writeFile(outputs.two, Buffer.from(result.pdfTwo))
            ]);
            const docxXml = cp.execFileSync('unzip', ['-p', outputs.docx, 'word/document.xml'], {encoding: 'utf8'});
            const pdfText = name => cp.execFileSync('pdftotext', [outputs[name], '-'], {encoding: 'utf8'});
            const combinedPdf = pdfText('all'), alicePdf = pdfText('one'), bobPdf = pdfText('two');
            assert.match(docxXml, /Alice/);assert.match(docxXml, /Bob/);
            assert.match(combinedPdf, /Alice/);assert.match(combinedPdf, /Bob/);
            assert.match(alicePdf, /Alice/);assert.doesNotMatch(alicePdf, /Bob/);
            assert.match(bobPdf, /Bob/);assert.doesNotMatch(bobPdf, /Alice/);
        } finally {
            await fs.rm(outputDirectory, {recursive: true, force: true});
        }
        assert(result.backends.every(value => ['wasm', 'js'].includes(value)));
        assert.equal(result.pendingPictures, false);
        assert.equal(result.failure, null);
        const external = env.requests.filter(request => !request.url.startsWith('eoapp:') && !request.url.startsWith('blob:') && !request.url.startsWith('data:'));
        assert.deepEqual(external, []);
        assert.deepEqual(env.errors, []);
        await fs.writeFile(path.join(root, 'results/native-mailings.json'), JSON.stringify({
            fields: result.fields, count: result.count, previewHasAlice: true,
            docxBytes: result.docx.length, pdfBytes: [result.pdfAll.length, result.pdfOne.length, result.pdfTwo.length],
            backends: result.backends, outputTextVerified: true, sourceStable: true, externalRequests: external.length
        }, null, 2) + '\n');
        console.log('PASS native offline Mailings CSV import, preview, merged DOCX, one PDF and per-record PDFs');
    } finally {
        if (env) await stop(env);
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
