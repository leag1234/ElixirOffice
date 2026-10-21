# ODF CBC padding source regressions

The runner compiles the production ODFEncryptor and produces 61 synthetic cases.
Independent Node crypto checks AES-CBC without automatic padding, the W3C terminal
padding length, raw-DEFLATE roundtrip, plaintext size and compressed-data checksum.

Coverage includes AES-128/SHA-1 and AES-256/SHA-256 for all 16 compressed-size
residues, empty and larger inputs, a non-CBC aligned control, and three eight-part
sets labelled ODT/ODS/ODP. Fixed keys, salts, IVs and passwords are test data only.
These part sets exercise the shared writer function; they are not complete ODF
packages and do not qualify native application or matched Wasm behavior.

Run inside the project's offline native container, bounded to two CPUs, 4 GiB
and a Node heap of at most 2048 MiB. Mount core and dependency inputs read-only.

    python3 tests/odf-padding/build-native.py --core /core --native-libs /native --native-build /cache/x2t-parity2 --thirdparty /cache/3rdParty/install --node /node/bin/node --out /work/padding-baseline

The output directory must be new. The unchanged writer is expected to fail six
aligned cases. Build the candidate into a separate output directory, adding
--baseline /work/padding-baseline/fixtures to compare aligned ciphertext prefixes.
The candidate must pass all61; each eight-part control must pass8/8.

Commands, source/dependency hashes, executable, linker map, fixture manifest and
all independent results are retained. The writer is compiled directly, without
duplicate-symbol selection or a cached ODF writer implementation.
