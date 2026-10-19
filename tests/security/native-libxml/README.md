# Bundled libxml native regression gate

Compile actual project amalgamations with AddressSanitizer and UndefinedBehaviorSanitizer. Use a new absolute fixture directory; the compile-time path and runner path must match.

~~~sh
cmake -S tests/security/native-libxml -B /owned/work/xml-build -G Ninja -DXMLROOT=/owned/core/DesktopEditor/xml -DEO_XML_FIXTURE_ROOT=/owned/work/xml-fixtures
cmake --build /owned/work/xml-build --parallel 2
python3 tests/security/native-libxml/run.py /owned/work/xml-build/xml-security /owned/work/xml-fixtures
~~~

The 12 cases cover ordinary/internal-entity parsing, external-entity positive controls, NOXXE for memory/reader/file/parameter entities, fresh external-entity subparsers, reused-context root-file loading, malformed-input default-logger suppression, and IDREF removal under the production feature configuration. A zero exit and empty captured streams are required; sanitizer failures cannot pass.

NOXXE applies to the built-in loader. Callers installing their own xmlSetExternalEntityLoader own its policy. These fixtures do not establish custom-loader containment, a complete upstream test suite, Wasm ABI correctness, Windows execution, or full converter/corpus acceptance.
