// SPDX-License-Identifier: AGPL-3.0-only
"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const upstream = process.env.EO_UPSTREAM || path.join(require("node:os").homedir(), "elixiroffice/DocumentServer");
const dir = path.join(upstream, "sdkjs/common/wasm-convert");

test("the converter loads the runtime its release pin names", () => {
 const pin = JSON.parse(fs.readFileSync(path.join(dir, "runtime-release.json"), "utf8"));
 const api = fs.readFileSync(path.join(dir, "api.js"), "utf8");
 const defaults = [...api.matchAll(/["\x27]runtime\/([A-Za-z0-9._-]+)\/["\x27]/g)].map(m => m[1]);
 assert.ok(defaults.length >= 1, "api.js must name a default runtime");
 assert.deepEqual([...new Set(defaults)], [pin.artifact_version]);
});
