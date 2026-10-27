// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=process.env.EO_NODE_SOURCE;
assert(root&&path.isAbsolute(root)&&path.normalize(root)===root,'Explicit EO_NODE_SOURCE required');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const node=read('src/node_version.h'),uv=read('deps/uv/include/uv/version.h'),win=read('deps/uv/include/uv/win.h'),impl=read('deps/uv/src/win/fs.c');
assert.match(node,/#define NODE_MAJOR_VERSION 24\b/);assert.match(node,/#define NODE_MINOR_VERSION 22\b/);assert.match(node,/#define NODE_PATCH_VERSION 0\b/);
assert.match(uv,/#define UV_VERSION_MAJOR 1\b/);assert.match(uv,/#define UV_VERSION_MINOR 52\b/);assert.match(uv,/#define UV_VERSION_PATCH 1\b/);
assert.match(win,/#define UV_FS_O_EXLOCK\s+0x10000000\b/);
const use=impl.indexOf('UV_FS_O_EXLOCK');assert(use>=0);assert.match(impl.slice(use,use+600),/share\s*=\s*0\s*;/);
console.log(JSON.stringify({verdict:'PASS',node:'24.22.0',uv:'1.52.1',flag:'0x10000000',share:'none'}));
