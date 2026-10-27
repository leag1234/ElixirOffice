# Original ElixirOffice Lazy API shim

This dependency-free implementation is original AGPL-3.0-only project code,
written from the published Lazy API contract and the pinned updater's consumer
call sites, not copied from upstream implementation code. The API source was
[the upstream readme at the published commit](https://github.com/develar/lazy-val/blob/b69ad4119f1b19bdab13c61ee2fcc88d46b89071/readme.md);
it specifies constructor(creator), readonly value and readonly hasValue.

The creator is evaluated once on successful return. Pending/rejected Promises
are cached by identity; falsy results are cached too. A synchronous throw leaves
the factory available for a later explicit retry. There are no runtime
dependencies, lifecycle scripts, file access, network calls or install hooks.

The full AGPL3 text is included verbatim from
[official SPDX license data v3.27.0](https://github.com/spdx/license-list-data/blob/v3.27.0/text/AGPL-3.0-only.txt);
SHA256 d8a6cc31abc16b6748c7a21f21611f5a1ec33f67d22ca23d7da1c19b95496bee.
The source header and package license select AGPL-3.0-only.

The npm override is scoped to electron-updater -> lazy-val. With the pinned
direct updater at node_modules/electron-updater, npm resolves its file spec
relative to that consumer, so file:../../vendor/lazy-val-shim reaches the owned
vendor directory. The root direct owned-package entry is file:vendor/lazy-val-shim.
A $root-reference incorrectly produced a nonexistent nested path in the initial
probe; it is not used. Tests enforce both committed alias targets.

The original registry lazy-val remains an unchanged build-only dependency for
electron-builder. It must never be included in the packaged production closure.
The packaged checker rejects any original registry module, missing/changed
notices, unreviewed runtime modules or a shadowing nested lazy-val. It checks
both owned aliases byte-for-byte, including this package manifest and LICENSE.
This route resolves the updater's runtime notice gap without inventing an
upstream copyright notice. Lead release review approves the route; implementation still
requires E review before integration.
