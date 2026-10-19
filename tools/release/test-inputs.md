# Frozen desktop test inputs

The release driver exports test sources from selected Git objects, independently of the current checkout. Inventory schema 1 keeps the original web-apps-only behavior, source blobs, optional notices and complete locale counts.

Schema 2 adds a required sdkjs_files list. The SDK revision comes from the sdkjs gitlink in the recorded DocumentServer commit, and each selected path comes from that SDK tree. The default inventory includes pdf/src/thumbnails.js. Absolute/parent/control-character paths, non-gitlink SDK entries, missing blobs and tracked symlinks fail before export. INPUTS.json records sdkjs_revision and each source blob ID, byte count and SHA256 alongside the unchanged web-apps data. The archive includes this source tree and its checksummed manifest.

The two actual-builder identity tests need electron-builder's installed app-builder-lib dependency. Developer source-only runs report an explicit skip if that package is absent. An installed but broken package still fails. Release environments set EO_RELEASE_REQUIRE_BUILDER=1, making a missing toolchain an error; Linux orchestration, the Windows container and the isolated Mac test command carry that flag. No packaging acceptance is inferred from a developer skip.

Validation for this candidate includes the real builder's Linux/Windows beforePack contexts, using the locked installed builder package and synthetic projects, without creating installer binaries. It is separate from running an actual release build.
