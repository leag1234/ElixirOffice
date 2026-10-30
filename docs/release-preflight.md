# Desktop release host preflight

Planning and execution both check host prerequisites before creating release outputs or reserving a build number. Execution repeats the check because host state may change after planning. The selected source, build identity, published-version guard and reviewed runtime/image pins remain authoritative.

The Python check uses the same python3 and clean environment as assembly. The pip module must be callable and support its --python option, which assembly uses to install into the private environment. A successful import alone is insufficient. An absent module or older pip stops with an actionable error; the preflight never installs anything or changes system Python.

Docker image inspection resolves the exact immutable image references: the font-tool image for every target, the Windows builder when Windows is selected, and the AppImage builder when Linux is selected. Digest-only references must resolve to that exact content ID; registry digest references may have a distinct image content ID, which is recorded. A missing image or unavailable Docker daemon stops before work begins. The preflight never pulls, builds or re-pins an image. Duplicate image references are inspected once.

The result records pip version/capability and image content IDs in the plan and build information. No inherited credential or Docker daemon selection variables are added to the clean environment. A successful check is not package, native-platform or publication acceptance.

Regression checks: tests/release/desktop-beta.test.py covers missing pip, absent --python support, every missing image, target selection, deduplication, invalid/mutable refs, wrong local content ID, unavailable executables/timeouts and failure before output creation or allocation. No release is built by these tests.
## Persistent AppImage raw tools

Linux release planning also requires every file in the reviewed
tools/release/appimage-tools.json manifest. The default raw store is
/srv/elixiroffice/cache/release-tools/appimage/<manifest-SHA256>. Its namespace
uses the entire manifest, so a future pin change cannot silently reuse an old
set. --appimage-tool-cache selects another root under
/srv/elixiroffice/cache/release-tools; --cache remains disposable build caching
and does not change the raw store.

Both planning and execution read all eight pinned regular files and verify
their exact size and SHA-256 before output creation or build reservation.
Missing, truncated, changed, symlinked or nonregular inputs abort with the file
names and an instruction to restore the exact reviewed bytes. The check never
creates the store, changes permissions, downloads files or extracts tools.
Execution rechecks the manifest itself against the plan.

Packaging copies only those raw inputs into the release worktree's
appimage-tools directory. Existing wrong files are rejected rather than
overwritten; each copied file is rechecked before exclusive publication. Extraction and receipts are
build-local. The persistent store is never mounted into the builder or changed
by packaging. Release preparation uses --cached-tools-only and network=none;
it cannot fall back to a moving upstream download after allocating a build.
If a raw input disappears after the full check, cached-only preparation aborts
with its name before any network request or extraction.
The standalone updater's explicit preparation workflow remains available for
reviewed provisioning outside the release chain; its downloads still require
the unchanged exact pins.

### Retention and restoration

Keep the complete /srv/elixiroffice/cache/release-tools tree outside all task
and release-directory cleanup sweeps. The provisioned AppImage root contains
a .release-tool-cache-protected marker. Retain each manifest namespace still
needed by a supported release; the marker is a retention contract, not an OS
access-control boundary. Current raw inputs are read-only files. Never move
this store into /srv/elixiroffice/wt or reuse it as a derived extraction cache.

Restore missing inputs only from already retained bytes independently verified
against the current manifest (or a separately reviewed provisioning attempt).
The stage_cached_tools(source, destination, manifest) helper checks the full
source set first, rejects aliases/nesting, copies only the raw allowlist and
rechecks copied bytes before exclusive publication. Do not restore extracted
directories or receipts as evidence that raw files are correct. A pin change
requires a new namespace and provenance review, not an exception to the check.

Regression checks in tests/release/tool-cache.test.py cover missing/corrupt
inputs, symlinks/directories/FIFOs, read-only verification, copying without hard
links to the persistent files, changed-copy rejection, disjoint paths,
preallocation failure, target selection, build-local derived caches and
network-free release preparation, including a pin disappearing after successful
verification. These tests allocate no release number and
build no installer.

## Mac input test-helper completeness

The private Mac input and asset-free test input include the selected Product's
`tools/desktop-updates/` source directory as well as `tools/desktop/`. Desktop
unit tests import `signed-metadata.cjs`; exporting the tests without that helper
previously required a frozen-source supplement during the 0.3.2 Mac gate. The
archive regression compares the actual exported README and helper bytes with
the selected source in both transport modes, retains resource/build-identity
checks, and rejects helper caches (`node_modules`, `.git`, `__pycache__`). This
exports test support only; it does not enable or package a runtime updater.

Existing released inputs and their qualification remain immutable. This fix
applies to newly prepared inputs after independent review and lead integration;
unit archive checks do not qualify a physical Mac application or DMG.

## Protected Docker images

The [protected image inventory](release-protected-images.json) records concrete
release and QA prerequisites, including their restoration inputs. Never delete
those images as task cleanup. Before any image cleanup, reconcile this inventory
with current recipes and every retained or active release/build/QA preflight.
Add a newly selected image reference and its resolved content ID before use.
Images selected through QA environment variables are covered by the same rule.

The checked-in list is a minimum inventory, not an allowlist for deletion of
other images. A tag, running container or recent use is not required for an image
to remain necessary. Keep both a registry reference and its resolved content ID
when they differ. Docker's daemon storage and temporary layers may be on a
different filesystem from release outputs; measure both before large jobs.
Do not use unscoped image or builder pruning as release cleanup.

On 29 October 2026, missing font-tool and AppImage-builder images stopped the
0.5.0 plan before allocation. The font-tool image was restored at its exact
existing content ID. The original AppImage builder was still present on Hardy:
its config and six layer diff IDs matched the retained transfer proof.
Exporting and loading that original restored the exact Fire content ID
sha256:4ed7b16d6e94e9dd6bd55a1e6123f010e976c5bb6125df5322129173038fbffd;
no source or tool pin changed. Both transferred archives were removed after
verification; the protected images and compact receipts were retained.

If an image is missing, restore exact reviewed bytes and check the actual image
ID, config and layer identity. A different ID requires a separate, reviewed
equivalence decision and pin change. A tag alone is not proof, and a preflight
must continue to refuse a missing or mismatched image.
