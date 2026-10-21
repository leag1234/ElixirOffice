# ODS chart cache source regressions

Synthetic tests exercise typed worksheet fallback, sparse caches, ordinary worksheet bindings, cache-name collisions, supplied tables and bounded repeat/range/count/index expansion. No external document is included.

Run in the offline native build container with two CPUs, 4 GiB RAM/swap and Node heap at most 2048 MiB; mount source and retained dependencies read-only:

```sh
python3 tests/odf-charts/build-native.py --core /core --native-build /cache/x2t-parity2 --thirdparty /cache/3rdParty/install --native-libs /native --out /work/chart-native
```

The output must be new. Commands, source/header/archive hashes, linker map, executable and every behavioral verdict are retained. Allocation controls have their own 512 MiB address-space limit and five-second timeout. One chart shares a one-million-entry cache budget across series, domains, labels and categories, charged before allocation. Exact count/index boundaries, cumulative sparse inputs, chart reset, rejected references and rejected bound-source/cache-name collisions have separate controls. Large writer controls inspect real admission and retained metadata before table materialization; small rejected-role cases finalize complete output.

Selected production objects precede cached unity archives, using explicit duplicate-symbol selection. Unchanged table and base conversion-context units are rebuilt so cached inlined visitors/constructors cannot execute older code. This is source-unit evidence; matched converter/Wasm/editor checks remain separate.

The cache representation follows LibreOffice's [chart exporter](https://github.com/LibreOffice/core/blob/master/xmloff/source/chart/SchXMLExport.cxx) and [table importer](https://github.com/LibreOffice/core/blob/master/xmloff/source/chart/SchXMLTableContext.cxx). Original literal endpoint spelling is retained; only an actual worksheet/cache-name collision requires a different generated table name.

Raw and extended ODF results are explicitly separate. The accepted extended gate removes only `calcext:value-type` diagnostically; every other schema failure remains fatal. With Python lxml and the official ODF 1.3 schemas:

```sh
python3 tests/odf-charts/check-schema.py --matrix /work/chart-native/matrix --schema /schemas --output /work/chart-schema.json
```

The JSON preserves raw errors even when `result=PASS_EXTENDED`.

Prepare the three small ordinary/password/cache-name fixtures using a separate CBC source tree:

```sh
python3 tests/odf-charts/build-owner-fixtures.py --cbc-core /cbc-core --native-build /cache/x2t-parity2 --thirdparty /cache/3rdParty/install --native-libs /native --node /node/bin/node --matrix /work/chart-native/matrix --out /work/owner-build
python3 tests/odf-charts/check-owner-schema.py --fixtures /work/owner-build/fixtures --schema /schemas --output /work/owner-schema.json
```

The password is public test data (`synthetic-padding`); salts and IVs are random per part. An XML comment produces an aligned compressed part. Independent Node crypto checks all eight plaintext/cipher pairs. The standard package wrapper is synthetic; this does not qualify the complete runtime exporter or its manifest serializer.

For a separate native LibreOffice check, use a UNO-enabled Python and a throw-away profile. On macOS the bundled launcher can be used:

```sh
/Applications/LibreOffice.app/Contents/Resources/python check-libreoffice.py --lo /Applications/LibreOffice.app/Contents/MacOS/soffice --fixtures . --out /tmp/eo-lo-chart-check-unique
```

The output folder must be new. On other installations pass `--python` or `LO_PYTHON` for the UNO-enabled interpreter. The script loads only the three hashed fixtures, supplies the test password, exports XLSX and checks exact chart values and worksheet identities. It terminates the owned LibreOffice instance and removes its own temporary profile. No installed profile or personal document is used. Actual LibreOffice acceptance is separate from source tests.

Worksheet/cache-name comparisons ignore case; literal scatter and bubble domains must follow cache-table renaming. Shared domain/category ranges count once per retained OOXML series copy because each series owns its cache. Pivot exhaustion omits the complete cache. Separate synthetic controls cover the within-budget and exhausted shared-role cases.
