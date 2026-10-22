# Desktop release host preflight

Planning and execution both check host prerequisites before creating release outputs or reserving a build number. Execution repeats the check because host state may change after planning. The selected source, build identity, published-version guard and reviewed runtime/image pins remain authoritative.

The Python check uses the same python3 and clean environment as assembly. The pip module must be callable and support its --python option, which assembly uses to install into the private environment. A successful import alone is insufficient. An absent module or older pip stops with an actionable error; the preflight never installs anything or changes system Python.

Docker image inspection resolves the exact immutable image references: the font-tool image for every target, the Windows builder when Windows is selected, and the AppImage builder when Linux is selected. Digest-only references must resolve to that exact content ID; registry digest references may have a distinct image content ID, which is recorded. A missing image or unavailable Docker daemon stops before work begins. The preflight never pulls, builds or re-pins an image. Duplicate image references are inspected once.

The result records pip version/capability and image content IDs in the plan and build information. No inherited credential or Docker daemon selection variables are added to the clean environment. A successful check is not package, native-platform or publication acceptance.

Regression checks: tests/release/desktop-beta.test.py covers missing pip, absent --python support, every missing image, target selection, deduplication, invalid/mutable refs, wrong local content ID, unavailable executables/timeouts and failure before output creation or allocation. No release is built by these tests.
