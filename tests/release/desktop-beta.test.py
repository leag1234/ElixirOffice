# SPDX-License-Identifier: AGPL-3.0-only
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import tarfile
import shutil
from unittest.mock import patch
import unittest
from types import SimpleNamespace
import os

source = Path(__file__).resolve().parents[2] / "tools/release/desktop_beta.py"
spec = importlib.util.spec_from_file_location("desktop_beta", source)
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)

class ReleaseInputs(unittest.TestCase):
    def test_archive_places_upstream_inputs_in_mac_isolated_home(self):
        # Public fixtures test export layout only, never a packaged-app gate.
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            build = release.Build.__new__(release.Build)
            build.work = root / "work"
            build.product = root / "product"
            build.driver = root / "driver"
            build.test_upstream = root / "recorded-upstream"
            for path in (build.work / "fixtures", build.product / "desktop",
                         build.product / "tools/desktop", build.product / "tests/desktop",
                         build.driver, root / "configured-tools/playwright-core"):
                path.mkdir(parents=True)
            dependency = root / "configured-tools/playwright-core/package.json"
            dependency.write_text('{"name":"playwright-core","fixture":"explicit dependency"}')
            for name in ("packaged-smoke.cjs", "remote-build.sh"):
                (build.driver / name).write_text("public archive fixture")
            shutil.copyfile(source.parent / "desktop-test-inputs.json", build.driver / "desktop-test-inputs.json")
            core = build.test_upstream / "web-apps/apps/common/main/lib/elixir-ai/Core.js"
            core.parent.mkdir(parents=True)
            core.write_text("recorded public connector bytes")
            assets = build.product / "desktop/assets"
            manifest = {"files": {}}
            for name in ("web-apps/apps/documenteditor/mobile/dist/js/mobile.js", "sdkjs/common/runtime.js"):
                file = assets / name
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_bytes(("public resource " + name).encode())
                manifest["files"][name] = {"bytes": file.stat().st_size, "sha256": release.digest(file)}
            (assets / "desktop-manifest.json").write_text(json.dumps(manifest))
            output = build.product / "desktop/dist/stale.exe"
            output.parent.mkdir()
            output.write_bytes(b"public stale build output")
            (build.test_upstream / "INPUTS.json").write_text('{"schema":1}')
            build.args = SimpleNamespace(playwright_core=root / "configured-tools/playwright-core")
            self.assertEqual(build.test_inventory(), build.driver / "desktop-test-inputs.json")
            selected_inventory = build.product / "tools/release/desktop-test-inputs.json"
            selected_inventory.parent.mkdir(parents=True)
            selected_inventory.write_bytes((build.driver / "desktop-test-inputs.json").read_bytes() + b"\n")
            archive = build.archive()
            with tarfile.open(archive) as exported:
                self.assertEqual(exported.extractfile("tools/release/desktop-test-inputs.json").read(), selected_inventory.read_bytes())
                self.assertEqual(exported.extractfile("test-tools/playwright-core/package.json").read(), dependency.read_bytes())
                name = "cache/home/elixiroffice/DocumentServer/" + str(core.relative_to(build.test_upstream))
                self.assertEqual(exported.extractfile(name).read(), core.read_bytes())
                self.assertTrue(exported.getmember("cache/home/elixiroffice/DocumentServer/INPUTS.json").isfile())
                for name in manifest["files"]:
                    self.assertTrue(exported.getmember("desktop/assets/" + name).isfile())
                self.assertNotIn("desktop/dist/stale.exe", exported.getnames())
            self.assertEqual(release.verify_archive_resources(archive, assets), len(manifest["files"]))

    def test_upstream_export_uses_recorded_blobs_not_ambient_head(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            repo = root / "web-apps"
            repo.mkdir()
            def git(*args):
                return subprocess.check_output(["git", "-C", repo, *args], text=True).strip()
            git("init", "-b", "main")
            git("config", "user.name", "Public export fixture")
            git("config", "user.email", "fixture@example.invalid")
            core = repo / "apps/common/main/lib/elixir-ai/Core.js"
            locale = repo / "apps/documenteditor/main/locale"
            core.parent.mkdir(parents=True)
            locale.mkdir(parents=True)
            inventory = json.loads((source.parent / "desktop-test-inputs.json").read_text())
            for name in inventory["files"]:
                file = repo / name
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_text("recorded public input " + name)
            (repo / "LICENSE").write_text("public test license fixture")
            core.write_text("recorded public connector")
            core.chmod(0o755)
            (locale / "en.json").write_text('{"version":"recorded"}')
            (locale / "fr.json").write_text('{}')
            extra = ["unit%02d.json" % index for index in range(43)]
            for name in extra:
                (locale / name).write_text("{}")
            for directory in inventory["locales"]:
                target = repo / directory
                target.mkdir(parents=True, exist_ok=True)
                for name in ["en.json", "fr.json", *extra]:
                    if not (target / name).exists():(target / name).write_text("{}")
            git("add", ".")
            git("commit", "-m", "recorded public inputs")
            recorded = git("rev-parse", "HEAD")
            core_blob = git("rev-parse", "HEAD:apps/common/main/lib/elixir-ai/Core.js")
            core.write_text("different ambient connector")
            (locale / "untracked.json").write_text("{}")
            git("add", ".")
            git("commit", "-m", "different ambient inputs")
            destination = root / "export"
            manifest = release.export_test_upstream(root, recorded, "recorded-DS", destination)
            exported = destination / "web-apps/apps/common/main/lib/elixir-ai/Core.js"
            self.assertEqual(exported.read_text(), "recorded public connector")
            self.assertEqual(manifest["web_apps_revision"], recorded)
            self.assertEqual(manifest["documentserver_revision"], "recorded-DS")
            self.assertEqual(manifest["files"][str(exported.relative_to(destination))]["git_blob"], core_blob)
            self.assertEqual(sorted(p.name for p in (destination / "web-apps/apps/documenteditor/main/locale").iterdir()), sorted(["en.json", "fr.json", *extra]))
            self.assertEqual(manifest["locale_count"], 135)
            self.assertEqual(manifest["locale_counts"], {name:45 for name in inventory["locales"]})
            self.assertEqual(manifest["inventory_sha256"], release.digest(source.parent / "desktop-test-inputs.json"))
            self.assertEqual(len(manifest["files"]), 142)
            for name in inventory["files"]:
                self.assertEqual((destination / "web-apps" / name).read_bytes(), subprocess.check_output(["git", "-C", repo, "show", recorded + ":" + name]))
            self.assertEqual(manifest["manifest_sha256"], release.digest(destination / "INPUTS.json"))
            for name, expected in manifest["files"].items():
                self.assertEqual(release.digest(destination / name), expected["sha256"])
            git("rm", "apps/spreadsheeteditor/main/locale/fr.json")
            git("rm", "apps/documenteditor/main/locale/untracked.json")
            git("commit", "-m", "incomplete public inventory")
            with self.assertRaisesRegex(ValueError, "45"):
                release.export_test_upstream(root, git("rev-parse", "HEAD"), "recorded-DS", root / "incomplete-export")
            git("checkout", recorded, "--", "apps/spreadsheeteditor/main/locale/fr.json")
            git("rm", "apps/common/main/lib/elixir-ai/View.js")
            git("commit", "-m", "incomplete required source inventory")
            with self.assertRaisesRegex(ValueError, "Missing recorded"):
                release.export_test_upstream(root, git("rev-parse", "HEAD"), "recorded-DS", root / "missing-view-export")
            with self.assertRaises(FileExistsError):
                release.export_test_upstream(root, recorded, "recorded-DS", destination)

    def test_build_environment_is_an_allowlist(self):
        env = release.clean_environment("/owned/node/bin/node", "/owned/cache")
        self.assertEqual(set(env), {"PATH", "HOME", "LANG", "LC_ALL", "npm_config_cache", "PYTHONDONTWRITEBYTECODE"})
        self.assertEqual(env["PATH"], "/owned/node/bin:/usr/local/bin:/usr/bin:/bin")

    def test_runtime_defaults_are_source_resolved_and_explicit_locations_remain(self):
        args = release.parser().parse_args(["--product-rev", "main", "--documentserver-rev", "elixir/dev"])
        self.assertIsNone(args.full_runtime)
        self.assertEqual(args.wasm_artifacts, Path.home() / "elixiroffice/wasm-artifacts")
        other = release.parser().parse_args(["--product-rev", "main", "--documentserver-rev", "elixir/dev", "--full-runtime", "/tmp/explicit"])
        self.assertEqual(other.full_runtime, Path("/tmp/explicit"))

    def test_host_and_tool_paths_are_explicit_or_environment_configured(self):
        base = ["--product-rev", "main", "--documentserver-rev", "elixir/dev"]
        with patch.dict(os.environ, {}, clear=True):
            args = release.parser().parse_args(base)
            self.assertIsNone(args.mac_root)
            self.assertIsNone(args.test_desktop_root)
            self.assertIsNone(args.test_desktop_host)
            self.assertIsNone(args.playwright_core)
            self.assertEqual(args.node, "node")
        configured = {"EO_RELEASE_MAC_ROOT": "/srv/mac/release-beta2",
                      "EO_RELEASE_TEST_DESKTOP_ROOT": "/srv/linux/release-beta2",
                      "EO_RELEASE_TEST_DESKTOP_HOST": "builder@linux",
                      "EO_RELEASE_PLAYWRIGHT_CORE": "/srv/tools/playwright-core",
                      "EO_RELEASE_NODE": "/srv/tools/bin/node"}
        with patch.dict(os.environ, configured, clear=True):
            args = release.parser().parse_args(base)
            self.assertEqual(args.mac_root, configured["EO_RELEASE_MAC_ROOT"])
            self.assertEqual(args.test_desktop_host, configured["EO_RELEASE_TEST_DESKTOP_HOST"])
            self.assertEqual(args.playwright_core, Path(configured["EO_RELEASE_PLAYWRIGHT_CORE"]))
            override = release.parser().parse_args(base + ["--test-desktop-root", "/srv/other/release-beta2",
                                                          "--playwright-core", "/srv/other/playwright-core"])
            self.assertEqual(override.test_desktop_root, "/srv/other/release-beta2")
            self.assertEqual(override.playwright_core, Path("/srv/other/playwright-core"))
        for root in (None, "", "/", "/home/builder", "/srv/work/../release-beta2"):
            with self.assertRaises(ValueError):
                release.endpoint("builder@linux", root)

    def test_pdf_pin_uses_recorded_dedicated_or_legacy_layout(self):
        with tempfile.TemporaryDirectory() as folder:
            repo = Path(folder)
            def git(*args):
                return subprocess.check_output(["git", "-C", repo, *args], text=True).strip()
            git("init", "-b", "main")
            git("config", "user.name", "Public pin fixture")
            git("config", "user.email", "fixture@example.invalid")
            legacy = repo / "tools/wasm/runtime-release.json"
            legacy.parent.mkdir(parents=True)
            legacy.write_text(json.dumps({"artifact_version": "old-pdf", "manifest_sha256": "1" * 64}))
            git("add", ".")
            git("commit", "-m", "public legacy PDF pin")
            old = git("rev-parse", "HEAD")
            selected, path = release.pdf_source_pin(repo, old)
            self.assertEqual(selected["artifact_version"], "old-pdf")
            self.assertEqual(path, "tools/wasm/runtime-release.json")
            legacy.write_text(json.dumps({"artifact_version": "new-full", "manifest_sha256": "2" * 64}))
            dedicated = legacy.with_name("pdf-runtime-release.json")
            dedicated.write_text(json.dumps({"artifact_version": "new-pdf", "manifest_sha256": "3" * 64}))
            git("add", ".")
            git("commit", "-m", "public split full and PDF pins")
            selected, path = release.pdf_source_pin(repo, git("rev-parse", "HEAD"))
            self.assertEqual(selected["artifact_version"], "new-pdf")
            self.assertEqual(path, "tools/wasm/pdf-runtime-release.json")
            # The selected revision wins even with a different file in ambient HEAD.
            self.assertEqual(release.pdf_source_pin(repo, old)[0]["artifact_version"], "old-pdf")
            dedicated.write_text("invalid JSON")
            git("add", ".")
            git("commit", "-m", "public malformed dedicated pin")
            with self.assertRaises(json.JSONDecodeError):
                release.pdf_source_pin(repo, git("rev-parse", "HEAD"))

    def test_pdf_kind_is_strict_for_both_pin_layouts(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            repo = root / "repo"
            repo.mkdir()
            def git(*args):
                return subprocess.check_output(["git", "-C", repo, *args], text=True).strip()
            git("init", "-b", "main")
            git("config", "user.name", "Public kind fixture")
            git("config", "user.email", "fixture@example.invalid")
            runtime = root / "runtime"
            runtime.mkdir()
            artifacts = {}
            for name in release.ARTIFACTS:
                file = runtime / name
                file.write_bytes(("public kind fixture " + name).encode())
                artifacts[name] = {"bytes": file.stat().st_size, "sha256": release.digest(file)}
            def commit_pin(layout, kind):
                manifest = {"artifact_version": "public-kind-" + kind,
                            "build_flags": {"module_kind": kind}, "artifacts": artifacts}
                (runtime / "manifest.json").write_text(json.dumps(manifest))
                pin = {"artifact_version": manifest["artifact_version"],
                       "manifest_sha256": release.digest(runtime / "manifest.json")}
                path = repo / "tools/wasm" / layout
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(json.dumps(pin))
                git("add", ".")
                git("commit", "-m", "public " + layout + " " + kind)
                return git("rev-parse", "HEAD")
            for layout in ("runtime-release.json", "pdf-runtime-release.json"):
                if layout == "pdf-runtime-release.json":
                    commit_pin("runtime-release.json", "pdf")
                revision = commit_pin(layout, "pdf")
                selected, source = release.pdf_source_pin(repo, revision)
                self.assertEqual(source, "tools/wasm/" + layout)
                self.assertEqual(release.verify_runtime(runtime, selected, "pdf")["artifact_version"], "public-kind-pdf")
                revision = commit_pin(layout, "full")
                selected, source = release.pdf_source_pin(repo, revision)
                with self.assertRaisesRegex(ValueError, "kind mismatch"):
                    release.verify_runtime(runtime, selected, "pdf")

    def test_runtime_all_six_bytes_pin_and_corruption(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            artifacts = {}
            for name in release.ARTIFACTS:
                data = ("public fixture " + name).encode()
                (root / name).write_bytes(data)
                artifacts[name] = {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
            manifest = {"artifact_version": "public-unit-release", "artifacts": artifacts}
            (root / "manifest.json").write_text(json.dumps(manifest))
            pin = {"artifact_version": manifest["artifact_version"], "manifest_sha256": release.digest(root / "manifest.json")}
            self.assertEqual(release.verify_runtime(root, pin)["artifacts"], artifacts)
            (root / "x2t.wasm").write_bytes(b"corruption")
            with self.assertRaisesRegex(ValueError, "checksum mismatch"):
                release.verify_runtime(root, pin)
            with self.assertRaisesRegex(ValueError, "source pin"):
                release.verify_runtime(root, {**pin, "artifact_version": "different"})
            # This verifies the verifier with public bytes, not a mocked build gate.

    def test_missing_pinned_runtime_is_not_replaced_by_another_release(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaises(FileNotFoundError):
                release.verify_runtime(Path(folder) / "missing-source-pin",
                    {"artifact_version": "missing-source-pin", "manifest_sha256": "0" * 64})

    def test_remote_helper_rejects_drifted_test_inventory(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            inputs = root / "cache/home/elixiroffice/DocumentServer"
            inputs.mkdir(parents=True)
            manifest = inputs / "INPUTS.json"
            manifest.write_text(json.dumps({"inventory_sha256": "0" * 64, "files": {}}))
            inventory = root / "tools/release/desktop-test-inputs.json"
            inventory.parent.mkdir(parents=True)
            inventory.write_text('{"schema":1,"fixture":"different inventory"}')
            result = subprocess.run(["/bin/bash", source.parent / "remote-build.sh",
                                     "linux", root, "no", release.digest(manifest)],
                                    env=release.clean_environment("/usr/bin/node", root),
                                    text=True, capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Desktop test inventory mismatch", result.stderr)

    def test_mac_architecture_failure_has_a_clear_message(self):
        with tempfile.TemporaryDirectory() as folder:
            result = subprocess.run(["/bin/bash", source.parent / "remote-build.sh",
                                     "mac", folder, "no", "0" * 64],
                                    env=release.clean_environment("/usr/bin/node", folder),
                                    text=True, capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Mac release requires", result.stderr)

    def test_missing_artifact_is_not_a_checksum_success(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "one.AppImage").write_bytes(b"public unit payload")
            with self.assertRaisesRegex(ValueError, "Missing"):
                release.checksum_inventory(root, ["one.AppImage", "missing.dmg"])
            self.assertFalse((root / "SHA256SUMS").exists())
            inventory = release.checksum_inventory(root, ["one.AppImage"])
            self.assertEqual(inventory["one.AppImage"]["sha256"], release.digest(root / "one.AppImage"))
            subprocess.run(["sha256sum", "-c", "SHA256SUMS"], cwd=root, check=True, capture_output=True)

    def test_date_label_and_ssh_arguments_are_bounded(self):
        self.assertEqual(release.output_path("2026-10-12", "D-preview"), Path("/data/elixiroffice/release/beta2-2026-10-12-D-preview"))
        for label in ["../prod", "x;touch canary", "x/y"]:
            with self.assertRaises(ValueError):
                release.output_path("2026-10-12", label)
        with self.assertRaises(ValueError):
            release.endpoint("-oProxyCommand=bad", "/tmp/owned")
        with self.assertRaises(ValueError):
            release.endpoint("gael@test-desktop", "/tmp/../other")
        self.assertEqual(release.endpoint("user@mac", "/srv/owned/release-beta2")["root"], "/srv/owned/release-beta2")
        for root in ("/Users/user/Own Folder", "$EO_WORK/bench/local-gaps-D", "/tmp/owned"):
            with self.assertRaises(ValueError):
                release.endpoint("user@mac", root)

    def test_only_integrated_revisions_and_no_shell_expansion(self):
        with tempfile.TemporaryDirectory() as folder:
            repo = Path(folder)
            def git(*args):
                return subprocess.check_output(["git", "-C", repo, *args], text=True).strip()
            git("init", "-b", "main")
            git("config", "user.name", "Public unit fixture")
            git("config", "user.email", "fixture@example.invalid")
            (repo / "public.txt").write_text("public fixture")
            git("add", "public.txt")
            git("commit", "-m", "public baseline")
            baseline = git("rev-parse", "HEAD")
            git("checkout", "-b", "unintegrated")
            (repo / "public.txt").write_text("unintegrated public fixture")
            git("commit", "-am", "public unintegrated")
            self.assertEqual(release.revision(repo, "main", "main"), baseline)
            with self.assertRaises(subprocess.CalledProcessError):
                release.revision(repo, "unintegrated", "main")
            with self.assertRaises((ValueError, subprocess.CalledProcessError)):
                release.revision(repo, "main;touch canary", "main")
            self.assertFalse((repo / "canary").exists())

if __name__ == "__main__":
    unittest.main()
