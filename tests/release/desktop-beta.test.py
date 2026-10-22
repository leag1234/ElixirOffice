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
import xml.etree.ElementTree as ET

source = Path(__file__).resolve().parents[2] / "tools/release/desktop_beta.py"
spec = importlib.util.spec_from_file_location("desktop_beta", source)
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)

class ReleaseInputs(unittest.TestCase):
    def test_assembly_builds_pinned_desktop_fallbacks_and_preserves_their_notices(self):
        driver = object.__new__(release.Build)
        driver.product = source.parents[2]
        driver.work = Path("/owned S3 build")
        driver.upstream = Path("/owned upstream")
        driver.args = SimpleNamespace(cache="/owned cache", font_tool_image="sha256:public-test",
                                      font_tool_root="/font-tool")
        driver.env = {"PATH": "/portable/node:/usr/bin:/bin"}
        driver.plan = {"full_runtime": {"path": "/full-runtime"}, "pdf_runtime": {"path": "/pdf-runtime"}}
        phases = []
        class ReachedResources(Exception):
            pass
        def run(name, command, env=None, cwd=None):
            phases.append((name, [str(arg) for arg in command], dict(env or driver.env)))
            if name == "resources":
                raise ReachedResources()
        driver.run = run
        with self.assertRaises(ReachedResources):
            driver.assemble()
        names = [phase[0] for phase in phases]
        self.assertLess(names.index("desktop-fallbacks"), names.index("fonts"))
        build = next(phase for phase in phases if phase[0] == "desktop-fallbacks")
        self.assertIn(str(driver.product / "tools/desktop/fallback-fonts.py"), build[1])
        self.assertIn("fonttools==4.58.0", phases[1][1])
        for name in ("fonts", "themes", "resources"):
            phase = next(p for p in phases if p[0] == name)
            self.assertEqual(phase[2]["DESKTOP_FALLBACKS"], str(driver.work / "desktop-fallbacks"))
        resources = next(p for p in phases if p[0] == "resources")[1]
        sources = [resources[i + 1] for i, item in enumerate(resources) if item == "--font-source"]
        self.assertIn(str(driver.work / "desktop-fallbacks"), sources)

    def build_python(self):
        helper = source.parents[2] / "tools/desktop/build-python.py"
        spec = importlib.util.spec_from_file_location("build_python", helper)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def test_build_python_commands_are_private_and_ignore_user_pip_configuration(self):
        helper = self.build_python()
        root, cache = Path("/owned source"), Path("/owned cache")
        commands = helper.commands(root, cache, "/usr/bin/python3")
        self.assertEqual(commands[0], ["/usr/bin/python3", "-m", "venv",
                                      "--without-pip", str(cache / "python")])
        for command in commands[1:]:
            self.assertEqual(command[:5], [str(cache / "python/bin/python3"),
                                          "-m", "pip", "--isolated", "install"])
            self.assertNotIn("--user", command)
        self.assertIn("--no-index", commands[1])
        self.assertIn("--no-deps", commands[1])
        self.assertEqual(commands[1][-1], str(cache / "pip/pip-25.2-py3-none-any.whl"))
        self.assertEqual(commands[2][-2:], ["-r", str(root / "tools/desktop/requirements.txt")])
        self.assertEqual(commands[2][commands[2].index("--cache-dir") + 1], str(cache / "pip"))
        env = helper.clean_environment(cache, "/portable/node:/usr/bin:/bin")
        self.assertEqual(env, {"HOME": str(cache / "home"), "TMPDIR": str(cache / "tmp"),
                               "PATH": "/portable/node:/usr/bin:/bin", "PYTHONDONTWRITEBYTECODE": "1"})
        self.assertNotIn("PYTHONPATH", env)

    def test_platform_wrappers_select_private_python_before_verification_and_npm(self):
        mac = (source.parents[2] / "tools/desktop/mac.sh").read_text()
        setup = mac.index('python3 "$ROOT/tools/desktop/build-python.py" "$ROOT" "$MAC_BUILD_CACHE"')
        activate = mac.index('export PATH="$MAC_BUILD_CACHE/python/bin:$PATH"')
        self.assertLess(setup, activate)
        self.assertLess(activate, mac.index('tests/desktop/verify-resources.py'))
        self.assertLess(activate, mac.index('npm run test'))
        self.assertIn('env -i HOME="$MAC_BUILD_CACHE/home"', mac[:activate])
        windows = (source.parents[2] / "tools/desktop/windows.sh").read_text()
        self.assertLess(windows.index('build-python.py /project /work'),
                        windows.index('export PATH="/work/python/bin:$PATH"'))
        self.assertLess(windows.index('export PATH="/work/python/bin:$PATH"'),
                        windows.index('npm ci; npm run test; npm run package:windows'))

    def test_build_python_rejects_changed_cached_bootstrap_before_execution(self):
        helper = self.build_python()
        with tempfile.TemporaryDirectory() as folder:
            cache = Path(folder) / "cache"
            wheel = cache / "pip/pip-25.2-py3-none-any.whl"
            wheel.parent.mkdir(parents=True)
            wheel.write_bytes(b"not the approved bootstrap")
            with patch.object(helper.subprocess, "run") as run:
                with self.assertRaisesRegex(RuntimeError, "bootstrap checksum"):
                    helper.provision(Path(folder), cache)
                run.assert_not_called()

    def test_build_python_rejects_a_symlinked_cache(self):
        helper = self.build_python()
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            target = root / "other"
            target.mkdir()
            cache = root / "cache"
            cache.symlink_to(target, target_is_directory=True)
            with self.assertRaisesRegex(RuntimeError, "symbolic link"):
                helper.provision(root, cache)
            self.assertEqual(list(target.iterdir()), [])

    def test_final_pdf_units_have_frozen_upstream_inputs(self):
        inventory = json.loads((source.parent / "desktop-test-inputs.json").read_text())
        required = {
            "apps/common/main/lib/elixir-local/Pdf.js",
            "apps/common/main/lib/elixir-local/PdfMessages.js",
            "apps/common/main/lib/elixir-local/PdfWriter.js",
            "apps/pdfeditor/main/app/controller/Main.js",
        }
        self.assertTrue(required <= set(inventory["files"]))
        self.assertEqual(len(inventory["files"]), len(set(inventory["files"])))


    def test_release_notes_identify_candidate_and_final_without_relabelling(self):
        template=(source.parent/"desktop-release-notes.md").read_text()
        identity={"version":"0.2.1-rc.42","build_number":42,"product_revision":"a"*40,"channel":"rc"}
        candidate=release.render_release_notes(template,identity)
        self.assertIn("release candidate",candidate);self.assertIn("Build 42",candidate);self.assertNotIn("{{",candidate)
        final=release.render_release_notes(template,{**identity,"version":"0.2.1","build_number":43,"channel":"final"})
        self.assertIn("final version rebuilt",final);self.assertIn("Build 43",final);self.assertNotIn("0.2.1-rc.42",final)
        with self.assertRaises(ValueError):release.render_release_notes("{{UNKNOWN}}",identity)

    def test_candidate_appimage_names_keep_existing_convention(self):
        self.assertEqual(release.appimage_names("0.2.1-rc.42"),("ElixirOffice-0.2.1-rc.42-x86_64.AppImage","ElixirOffice-0.2.1-rc.42-x86_64.AppImage.zsync"))
        with self.assertRaises(ValueError):release.appimage_names("0.2.1-rc.0")
        with self.assertRaises(ValueError):release.appimage_names("../0.2.1")

    def test_published_version_cannot_be_repackaged(self):
        package = json.loads((source.parents[2] / "desktop/package.json").read_text())
        self.assertEqual(release.validate_desktop_version(package), package["version"])
        with tempfile.TemporaryDirectory() as folder:
            inventory = Path(folder) / "published.json"
            import datetime
            inventory.write_text(json.dumps({"schema":1,"repository":"leag1234/elixiroffice","complete":True,"fetched_at":datetime.datetime.now(datetime.timezone.utc).isoformat(),"versions":["0.1.0","0.2.0"]}))
            for version in ["0.1.0", "0.2.0"]:
                with self.assertRaisesRegex(ValueError, "already published"):
                    release.validate_desktop_version({**package, "version": version}, inventory)
        lock = json.loads((source.parents[2] / "desktop/package-lock.json").read_text())
        self.assertEqual(lock["version"], package["version"])
        self.assertEqual(lock["packages"][""]["version"], package["version"])
        metainfo = ET.parse(source.parents[2] / "tools/flatpak/org.elixiroffice.desktop.metainfo.xml")
        entry = metainfo.find("./releases/release")
        self.assertEqual(entry.attrib["version"], "0.2.1")
        self.assertEqual(entry.attrib["date"], "2026-10-15")
        notes = (source.parent / "desktop-beta3-release-notes.md").read_text()
        self.assertTrue(notes.startswith("# ElixirOffice 0.2.0 beta (desktop)"))
        self.assertIn("`v0.2.0`", notes)
        for suffix in ("x86_64.AppImage", "x86_64.AppImage.zsync", "linux-amd64.deb", "win-x64.exe", "mac-arm64.dmg", "x86_64.flatpak"):
            self.assertIn("ElixirOffice-0.2.0-" + suffix, notes)


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
            build.plan = {"build_identity":{"version":"0.2.1-rc.42","build_number":42}}
            (build.product / "desktop/build-info.json").write_text(json.dumps(build.plan["build_identity"]))
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
            template_sources = {
                "branding/example/nodejs/public/elixir/brand/templates/templates.json": b'{"templates":[]}',
                "branding/example/nodejs/public/elixir/brand/templates/ar/letterhead.docx": b"public localized source",
                "branding/example/nodejs/public/elixir/brand/templates/ar/letterhead.png": b"public source preview",
                "branding/desktop-templates/templates.json": b'{"templates":[]}',
                "branding/desktop-templates/template-sources.json": b'{"license":"CC0-1.0","files":[]}',
                "branding/desktop-templates/ur/letterhead.docx": b"public desktop localized source",
                "branding/desktop-templates/ur/letterhead.png": b"public desktop source preview",
                "tools/example/template-layouts/letterhead.docx": b"public source layout",
                "tools/example/template-layouts/localized/ur/letterhead.docx": b"public unshipped unit variant",
            }
            for name, data in template_sources.items():
                file = build.product / name
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_bytes(data)
            stale_cache = build.product / "tools/example/template-layouts/__pycache__/stale.pyc"
            stale_cache.parent.mkdir()
            stale_cache.write_bytes(b"unrelated build cache")
            archive = build.archive()
            with tarfile.open(archive) as exported:
                self.assertEqual(json.load(exported.extractfile("desktop/build-info.json")),build.plan["build_identity"])
                self.assertEqual(exported.extractfile("tools/release/desktop-test-inputs.json").read(), selected_inventory.read_bytes())
                self.assertEqual(exported.extractfile("test-tools/playwright-core/package.json").read(), dependency.read_bytes())
                name = "cache/home/elixiroffice/DocumentServer/" + str(core.relative_to(build.test_upstream))
                self.assertEqual(exported.extractfile(name).read(), core.read_bytes())
                self.assertTrue(exported.getmember("cache/home/elixiroffice/DocumentServer/INPUTS.json").isfile())
                for name in manifest["files"]:
                    self.assertTrue(exported.getmember("desktop/assets/" + name).isfile())
                self.assertNotIn("desktop/dist/stale.exe", exported.getnames())
                for name, data in template_sources.items():
                    self.assertTrue(exported.getmember(name).isfile())
                    self.assertEqual(exported.extractfile(name).read(), data)
                self.assertNotIn(str(stale_cache.relative_to(build.product)), exported.getnames())
            self.assertEqual(release.verify_archive_resources(archive, assets), len(manifest["files"]))
            build.args.node = root / "configured-node/bin/node"
            build.args.node.parent.mkdir(parents=True)
            build.args.node.write_bytes(b"public node fixture")
            (build.args.node.parent.parent / "LICENSE").write_text("public node license fixture")
            with tarfile.open(build.archive(include_assets=False)) as exported:
                for name, data in template_sources.items():
                    self.assertEqual(exported.extractfile(name).read(), data)
                self.assertNotIn("desktop/assets/desktop-manifest.json", exported.getnames())

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
            # Preserve the original web-only schema contract alongside schema-2 SDK tests.
            inventory["schema"] = 1
            inventory.pop("sdkjs_files", None)
            inventory_file = root / "legacy-inventory.json"
            inventory_file.write_text(json.dumps(inventory))

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
            manifest = release.export_test_upstream(root, recorded, "recorded-DS", destination, inventory_file)
            exported = destination / "web-apps/apps/common/main/lib/elixir-ai/Core.js"
            self.assertEqual(exported.read_text(), "recorded public connector")
            self.assertEqual(manifest["web_apps_revision"], recorded)
            self.assertEqual(manifest["documentserver_revision"], "recorded-DS")
            self.assertEqual(manifest["files"][str(exported.relative_to(destination))]["git_blob"], core_blob)
            self.assertEqual(sorted(p.name for p in (destination / "web-apps/apps/documenteditor/main/locale").iterdir()), sorted(["en.json", "fr.json", *extra]))
            self.assertEqual(manifest["locale_count"], 135)
            self.assertEqual(manifest["locale_counts"], {name:45 for name in inventory["locales"]})
            self.assertEqual(manifest["inventory_sha256"], release.digest(inventory_file))
            self.assertEqual(len(manifest["files"]), len(inventory["files"]) + sum(inventory["locales"].values()) + 1)
            for name in inventory["files"]:
                self.assertEqual((destination / "web-apps" / name).read_bytes(), subprocess.check_output(["git", "-C", repo, "show", recorded + ":" + name]))
            self.assertEqual(manifest["manifest_sha256"], release.digest(destination / "INPUTS.json"))
            for name, expected in manifest["files"].items():
                self.assertEqual(release.digest(destination / name), expected["sha256"])
            git("rm", "apps/spreadsheeteditor/main/locale/fr.json")
            git("rm", "apps/documenteditor/main/locale/untracked.json")
            git("commit", "-m", "incomplete public inventory")
            with self.assertRaisesRegex(ValueError, "45"):
                release.export_test_upstream(root, git("rev-parse", "HEAD"), "recorded-DS", root / "incomplete-export", inventory_file)
            git("checkout", recorded, "--", "apps/spreadsheeteditor/main/locale/fr.json")
            git("rm", "apps/common/main/lib/elixir-ai/View.js")
            git("commit", "-m", "incomplete required source inventory")
            with self.assertRaisesRegex(ValueError, "Missing recorded"):
                release.export_test_upstream(root, git("rev-parse", "HEAD"), "recorded-DS", root / "missing-view-export", inventory_file)
            with self.assertRaises(FileExistsError):
                release.export_test_upstream(root, recorded, "recorded-DS", destination, inventory_file)

    def test_appimage_update_inventory_is_paired_and_excludes_updater_feeds(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            image, control = release.appimage_names("0.2.0")
            self.assertEqual(image, "ElixirOffice-0.2.0-x86_64.AppImage")
            (root / image).write_bytes(b"public fixture")
            with self.assertRaisesRegex(ValueError, "Missing"):
                release.public_artifact_names(root)
            (root / control).write_bytes(b"public control fixture")
            (root / "ElixirOffice-0.2.0-linux-amd64.deb").write_bytes(b"unchanged deb")
            (root / "builder-effective-config.yaml").write_text("internal build-only receipt")
            names = release.public_artifact_names(root)
            self.assertIn(image, names)
            self.assertIn(control, names)
            self.assertNotIn("builder-effective-config.yaml", names)
            inventory = release.checksum_inventory(root, names)
            self.assertEqual(set(inventory), set(names))
            self.assertIn(control, (root / "SHA256SUMS").read_text())
            for feed in ["latest-linux.yml", "beta-linux.yml", "app-update.yml"]:
                (root / feed).write_text("unwanted updater feed")
                with self.assertRaisesRegex(ValueError, "updater feed"):
                    release.public_artifact_names(root)
                (root / feed).unlink()
            alias = root / "ElixirOffice-0.2.0-win-x64.exe"
            alias.symlink_to(root / image)
            with self.assertRaisesRegex(ValueError, "regular"):
                release.public_artifact_names(root)
            alias.unlink()
            alias.mkdir()
            with self.assertRaisesRegex(ValueError, "regular"):
                release.public_artifact_names(root)
            alias.rmdir()
            (root / image).unlink()
            with self.assertRaisesRegex(ValueError, "Orphan"):
                release.public_artifact_names(root)

    def test_appimage_update_config_cannot_infer_an_application_feed(self):
        package = json.loads((source.parents[1] / "../desktop/package.json").resolve().read_text())
        release.validate_update_packaging(package)
        self.assertEqual(package["build"]["artifactName"], "ElixirOffice-${version}-${os}-${arch}.${ext}")
        package["build"]["linux"]["publish"] = {"provider": "github"}
        with self.assertRaisesRegex(ValueError, "feeds"):
            release.validate_update_packaging(package)

    def test_build_environment_is_an_allowlist(self):
        env = release.clean_environment("/owned/node/bin/node", "/owned/cache")
        self.assertEqual(set(env), {"PATH", "HOME", "LANG", "LC_ALL", "npm_config_cache", "PYTHONDONTWRITEBYTECODE", "EO_RELEASE_REQUIRE_BUILDER"})
        self.assertEqual(env["EO_RELEASE_REQUIRE_BUILDER"], "1")
        self.assertEqual(env["PATH"], "/owned/node/bin:/usr/local/bin:/usr/bin:/bin")

    def test_runtime_defaults_are_source_resolved_and_explicit_locations_remain(self):
        args = release.parser().parse_args(["--product-rev", "main", "--documentserver-rev", "elixir/dev", "--build-number", "42", "--channel", "rc", "--published-versions", "/owned/published.json", "--build-ledger", "/owned/ledger.json"])
        self.assertIsNone(args.full_runtime)
        self.assertEqual(args.wasm_artifacts, Path.home() / "elixiroffice/wasm-artifacts")
        other = release.parser().parse_args(["--product-rev", "main", "--documentserver-rev", "elixir/dev", "--full-runtime", "/tmp/explicit", "--build-number", "42", "--channel", "rc", "--published-versions", "/owned/published.json", "--build-ledger", "/owned/ledger.json"])
        self.assertEqual(other.full_runtime, Path("/tmp/explicit"))

    def test_host_and_tool_paths_are_explicit_or_environment_configured(self):
        base = ["--product-rev", "main", "--documentserver-rev", "elixir/dev", "--build-number", "42", "--channel", "rc", "--published-versions", "/owned/published.json", "--build-ledger", "/owned/ledger.json"]
        with patch.dict(os.environ, {}, clear=True):
            args = release.parser().parse_args(base)
            self.assertIsNone(args.mac_root)
            self.assertIsNone(args.linux_root)
            self.assertIsNone(args.linux_host)
            self.assertIsNone(args.playwright_core)
            self.assertEqual(args.node, "node")
        configured = {"EO_RELEASE_MAC_ROOT": "/srv/mac/release-beta2",
                      "EO_RELEASE_LINUX_ROOT": "/srv/linux/release-beta2",
                      "EO_RELEASE_LINUX_HOST": "builder@linux",
                      "EO_RELEASE_PLAYWRIGHT_CORE": "/srv/tools/playwright-core",
                      "EO_RELEASE_NODE": "/srv/tools/bin/node"}
        with patch.dict(os.environ, configured, clear=True):
            args = release.parser().parse_args(base)
            self.assertEqual(args.mac_root, configured["EO_RELEASE_MAC_ROOT"])
            self.assertEqual(args.linux_host, configured["EO_RELEASE_LINUX_HOST"])
            self.assertEqual(args.playwright_core, Path(configured["EO_RELEASE_PLAYWRIGHT_CORE"]))
            override = release.parser().parse_args(base + ["--linux-root", "/srv/other/release-beta2",
                                                          "--playwright-core", "/srv/other/playwright-core"])
            self.assertEqual(override.linux_root, "/srv/other/release-beta2")
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
        self.assertEqual(release.output_path("2026-10-12", "D-preview"), Path("/srv/elixiroffice/release/desktop-0.2.0-2026-10-12-D-preview"))
        for label in ["../prod", "x;touch canary", "x/y"]:
            with self.assertRaises(ValueError):
                release.output_path("2026-10-12", label)
        with self.assertRaises(ValueError):
            release.endpoint("-oProxyCommand=bad", "/tmp/owned")
        with self.assertRaises(ValueError):
            release.endpoint("gael@linux", "/tmp/../other")
        self.assertEqual(release.endpoint("user@mac", "/srv/owned/release-beta2")["root"], "/srv/owned/release-beta2")
        for root in ("/Users/user/Own Folder", "/srv/elixiroffice/bench/local-gaps-D", "/tmp/owned"):
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


class HostPreflight(unittest.TestCase):
    font = "sha256:" + "1" * 64
    windows = "electronuserland/builder@sha256:" + "2" * 64
    appimage = "sha256:" + "3" * 64
    def plan(self, targets=("linux", "windows", "mac")):
        return {"targets": list(targets), "font_tool_image": self.font,
                "windows_image": self.windows, "appimage_update": {"image": self.appimage}}
    def answer(self, command, **kwargs):
        if command == ["python3", "-m", "pip", "--version"]:
            return subprocess.CompletedProcess(command, 0, "pip 25.2 from /owned/python\n", "")
        if command == ["python3", "-m", "pip", "--help"]:
            return subprocess.CompletedProcess(command, 0, "Options: --python <python>\n", "")
        image = command[-1]
        return subprocess.CompletedProcess(command, 0, (image if image.startswith("sha256:") else "sha256:" + "4" * 64) + "\n", "")
    def test_success_checks_all_required_images_with_clean_environment(self):
        env = {"PATH": "/owned/bin:/usr/bin:/bin"}
        with patch.object(release.subprocess, "run", side_effect=self.answer) as run:
            result = release.host_preflight(self.plan(), env)
        self.assertEqual(set(result["docker_images"]), {"font_tool", "windows_builder", "appimage_builder"})
        self.assertTrue(result["python_pip"]["supports_python_option"])
        self.assertEqual(len(run.call_args_list), 5)
        for call in run.call_args_list:
            self.assertIs(call.kwargs["env"], env)
            self.assertEqual(call.kwargs["timeout"], 20)
            self.assertTrue(call.kwargs["capture_output"])
            self.assertNotIn("pull", call.args[0])
            self.assertNotIn("install", call.args[0])
    def test_missing_pip_and_each_missing_image_are_reported_together(self):
        def missing(command, **kwargs):
            return subprocess.CompletedProcess(command, 1, "", "not found")
        with patch.object(release.subprocess, "run", side_effect=missing):
            with self.assertRaises(ValueError) as error:
                release.host_preflight(self.plan(), {})
        message = str(error.exception)
        for value in ("python3 -m pip", self.font, self.windows, self.appimage):
            self.assertIn(value, message)
        self.assertNotIn("not found", message)
    def test_old_pip_without_python_option_stops_before_build(self):
        def old(command, **kwargs):
            if command[-1] == "--help":
                return subprocess.CompletedProcess(command, 0, "Options: --isolated", "")
            return self.answer(command, **kwargs)
        with patch.object(release.subprocess, "run", side_effect=old):
            with self.assertRaisesRegex(ValueError, "python_option"):
                release.host_preflight(self.plan(), {})
    def test_mac_export_does_not_require_windows_or_appimage_builders(self):
        with patch.object(release.subprocess, "run", side_effect=self.answer) as run:
            result = release.host_preflight(self.plan(("mac",)), {})
        self.assertEqual(set(result["docker_images"]), {"font_tool"})
        self.assertEqual(len(run.call_args_list), 3)
    def test_linux_does_not_require_windows_builder(self):
        with patch.object(release.subprocess, "run", side_effect=self.answer):
            result = release.host_preflight(self.plan(("linux",)), {})
        self.assertEqual(set(result["docker_images"]), {"font_tool", "appimage_builder"})
    def test_same_image_roles_are_inspected_once(self):
        plan = self.plan(("linux",))
        plan["appimage_update"]["image"] = self.font
        with patch.object(release.subprocess, "run", side_effect=self.answer) as run:
            result = release.host_preflight(plan, {})
        self.assertEqual(len(run.call_args_list), 3)
        self.assertEqual(len(result["docker_images"]), 2)
    def test_wrong_local_content_id_for_sha256_pin_is_rejected(self):
        def wrong(command, **kwargs):
            if command[0] == "docker":
                return subprocess.CompletedProcess(command, 0, "sha256:" + "9" * 64, "")
            return self.answer(command, **kwargs)
        with patch.object(release.subprocess, "run", side_effect=wrong):
            with self.assertRaisesRegex(ValueError, "font_tool"):
                release.host_preflight(self.plan(("mac",)), {})
    def test_mutable_or_option_like_image_is_rejected_without_docker_call(self):
        for image in ("builder:latest", "--help", "sha256:bad"):
            plan = self.plan(("mac",))
            plan["font_tool_image"] = image
            with patch.object(release.subprocess, "run", side_effect=self.answer) as run:
                with self.assertRaisesRegex(ValueError, "immutable image pin"):
                    release.host_preflight(plan, {})
                self.assertFalse(any(c.args[0][0] == "docker" for c in run.call_args_list))
    def test_missing_executable_and_timeout_are_actionable_failures(self):
        for error in (FileNotFoundError(), subprocess.TimeoutExpired(["docker"], 20)):
            with patch.object(release.subprocess, "run", side_effect=error):
                with self.assertRaisesRegex(ValueError, "preflight failed"):
                    release.host_preflight(self.plan(), {})
    def test_execution_failure_does_not_create_outputs_or_reserve_build_number(self):
        with tempfile.TemporaryDirectory() as folder:
            driver = object.__new__(release.Build)
            driver.plan, driver.env = self.plan(), {}
            driver.out = Path(folder) / "not-created"
            driver.info = {}
            with patch.object(release, "host_preflight", side_effect=ValueError("missing pip")), \
                    patch.object(release.build_identity, "reserve") as reserve:
                with self.assertRaisesRegex(ValueError, "missing pip"):
                    driver.execute()
                reserve.assert_not_called()
            self.assertFalse(driver.out.exists())

if __name__ == "__main__":
    unittest.main()
