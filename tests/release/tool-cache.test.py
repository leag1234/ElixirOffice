# SPDX-License-Identifier: AGPL-3.0-only
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "tools/release" / (name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module
update, release = load("appimage_update"), load("desktop_beta")

class ToolCache(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="eo raw cache ")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.raw = self.root / "persistent"
        self.raw.mkdir()
        self.manifest = copy.deepcopy(update.pins(ROOT / "tools/release/appimage-tools.json"))
        for name, item in self.manifest["files"].items():
            data = ("public synthetic " + name).encode()
            (self.raw / name).write_bytes(data)
            item.update(bytes=len(data), sha256=hashlib.sha256(data).hexdigest())
        self.dest = self.root / "owned-build" / "tools"
    def snapshot(self):
        return {p.name: (p.read_bytes(), p.stat().st_mode, p.stat().st_mtime_ns)
                for p in self.raw.iterdir()}
    def test_complete_verification_is_read_only_and_checks_every_pin(self):
        before = self.snapshot()
        result = update.verify_cached_tools(self.raw, self.manifest)
        self.assertEqual(result, self.manifest["files"])
        self.assertEqual(self.snapshot(), before)
    def test_missing_corrupt_and_wrong_size_files_are_all_reported(self):
        names = list(self.manifest["files"])
        (self.raw / names[0]).unlink()
        p = self.raw / names[1]; p.write_bytes(b"x" * p.stat().st_size)
        (self.raw / names[2]).write_bytes(b"short")
        with self.assertRaises(ValueError) as caught:
            update.verify_cached_tools(self.raw, self.manifest)
        for name in names[:3]: self.assertIn(name, str(caught.exception))
        self.assertIn("restore", str(caught.exception).lower())
    def test_missing_root_does_not_create_it(self):
        path = self.root / "absent"
        with self.assertRaises(ValueError): update.verify_cached_tools(path, self.manifest)
        self.assertFalse(path.exists())
    def test_symlink_file_symlink_parent_directory_and_fifo_are_rejected(self):
        name = next(iter(self.manifest["files"]))
        path = self.raw / name; path.unlink(); path.symlink_to(self.root / "missing")
        with self.assertRaises(ValueError): update.verify_cached_tools(self.raw, self.manifest)
        path.unlink(); path.mkdir()
        with self.assertRaises(ValueError): update.verify_cached_tools(self.raw, self.manifest)
        path.rmdir(); os.mkfifo(path)
        with self.assertRaises(ValueError): update.verify_cached_tools(self.raw, self.manifest)
        link = self.root / "linked"; link.symlink_to(self.raw, target_is_directory=True)
        with self.assertRaises(ValueError): update.verify_cached_tools(link, self.manifest)
        with self.assertRaises(ValueError): update.verify_cached_tools(link / "nested", self.manifest)
    def test_staging_copies_only_raw_allowlist_and_preserves_persistent_files(self):
        before = self.snapshot()
        (self.raw / "untrusted-receipt.json").write_text("not an input")
        update.stage_cached_tools(self.raw, self.dest, self.manifest)
        self.assertEqual(set(p.name for p in self.dest.iterdir()), set(self.manifest["files"]))
        self.assertEqual(update.verify_cached_tools(self.dest, self.manifest), self.manifest["files"])
        self.assertEqual({k:v for k,v in self.snapshot().items() if k in before}, before)
        self.assertNotEqual((self.raw / next(iter(before))).stat().st_ino,
                            (self.dest / next(iter(before))).stat().st_ino)
    def test_staging_rejects_missing_source_before_destination_creation(self):
        (self.raw / next(iter(self.manifest["files"]))).unlink()
        with self.assertRaises(ValueError): update.stage_cached_tools(self.raw, self.dest, self.manifest)
        self.assertFalse(self.dest.exists())
    def test_staging_rejects_alias_nested_target_and_changed_existing_destination(self):
        for target in [self.raw, self.raw / "nested", self.raw.parent]:
            with self.assertRaises(ValueError): update.stage_cached_tools(self.raw, target, self.manifest)
        self.dest.mkdir(parents=True); name = next(iter(self.manifest["files"]))
        (self.dest / name).write_bytes(b"changed")
        with self.assertRaises(ValueError): update.stage_cached_tools(self.raw, self.dest, self.manifest)
        self.assertEqual((self.dest / name).read_bytes(), b"changed")
    def test_cached_only_prepare_never_downloads_or_runs_tools_on_missing_input(self):
        (self.raw / next(iter(self.manifest["files"]))).unlink()
        with patch.object(update.urllib.request, "urlopen") as network, patch.object(update.subprocess, "run") as run:
            with self.assertRaises(ValueError): update.prepare(self.raw, self.manifest, allow_download=False)
        network.assert_not_called(); run.assert_not_called()
    def test_cached_only_prepare_never_downloads_if_verified_pin_disappears(self):
        name = next(iter(self.manifest["files"]))
        verify = update.verify_cached_tools
        def remove_after_verification(cache, manifest):
            result = verify(cache, manifest)
            (cache / name).unlink()
            return result
        error = None
        with patch.object(update, "verify_cached_tools", side_effect=remove_after_verification) as verified, \
             patch.object(update.urllib.request, "urlopen", side_effect=RuntimeError("NETWORK ATTEMPT")) as network, \
             patch.object(update.subprocess, "run") as run:
            try:
                update.prepare(self.raw, self.manifest, allow_download=False)
            except Exception as caught:
                error = caught
        verified.assert_called_once_with(self.raw, self.manifest)
        network.assert_not_called()
        run.assert_not_called()
        self.assertIsInstance(error, ValueError)
        self.assertIn(name, str(error))
        self.assertIn("missing", str(error).lower())
    def test_release_preparation_uses_task_owned_copies_and_no_network(self):
        pins = self.root / "pins.json"; pins.write_text(json.dumps(self.manifest))
        argv = ["appimage_update.py", "--pins", str(pins), "--tool-cache", str(self.raw),
                "--cache", str(self.dest), "--prepare-only"]
        with patch.object(sys, "argv", argv), patch.object(update, "owned", return_value=self.dest),              patch.object(update.subprocess, "run") as run:
            update.main()
        self.assertEqual(len(run.call_args_list), 1)
        command = run.call_args.args[0]
        self.assertIn("--network=none", command)
        self.assertIn("--cached-tools-only", command)
        self.assertNotIn("--network=bridge", command)
        self.assertEqual(update.verify_cached_tools(self.dest, self.manifest), self.manifest["files"])
    def test_changed_copy_is_rejected_before_publishing_any_raw_input(self):
        before = self.snapshot()
        def changed(input_file, output, length):
            output.write(b"changed during copy")
        with patch.object(update.shutil, "copyfileobj", side_effect=changed):
            with self.assertRaisesRegex(ValueError, "Staged tool differs"):
                update.stage_cached_tools(self.raw, self.dest, self.manifest)
        self.assertEqual(list(self.dest.iterdir()), [])
        self.assertEqual(self.snapshot(), before)
    def test_packaging_passes_persistent_source_and_uses_a_build_local_derived_cache(self):
        driver = object.__new__(release.Build)
        driver.product = self.root / "product"; (driver.product / "desktop").mkdir(parents=True)
        (driver.product / "desktop/package.json").write_text("{}")
        driver.args = SimpleNamespace(targets=["linux"], cache="/disposable", node="/node")
        driver.work, driver.driver = self.root / "build", self.root / "frozen-driver"
        driver.info, driver.plan = {}, self.plan()
        captured = []
        class ReachedUpdate(Exception): pass
        def run(name, command, **kwargs):
            if name == "appimage-external-update":
                captured.extend(command); raise ReachedUpdate()
        driver.run = run
        with patch.object(release, "validate_desktop_version", return_value="0.3.2"), self.assertRaises(ReachedUpdate):
            driver.packages()
        self.assertEqual(captured[captured.index("--tool-cache")+1], str(self.raw))
        self.assertEqual(captured[captured.index("--cache")+1], driver.work / "appimage-tools")
    def test_non_linux_preflight_does_not_read_the_appimage_cache(self):
        plan = self.plan(); plan["targets"] = ["mac"]
        with patch.object(release.subprocess, "run", side_effect=self.healthy), \
             patch.object(release.appimage_update, "verify_cached_tools") as raw:
            result = release.host_preflight(plan, {})
        raw.assert_not_called(); self.assertNotIn("appimage_tools", result)
    def healthy(self, command, **kwargs):
        if command[-1] == "--version": return subprocess.CompletedProcess(command, 0, "pip25.2", "")
        if command[-1] == "--help": return subprocess.CompletedProcess(command, 0, "--python", "")
        return subprocess.CompletedProcess(command, 0, command[-1], "")
    def plan(self):
        return {"targets":["linux"], "font_tool_image":"sha256:"+"1"*64,
                "appimage_update":{"image":"sha256:"+"2"*64, "channel":"latest-all", "tool_cache":str(self.raw),
                "pins_sha256":release.digest(ROOT / "tools/release/appimage-tools.json")}}
    def test_execution_rechecks_raw_cache_before_output_and_reservation(self):
        for failure in ["missing", "corrupt"]:
            with self.subTest(failure=failure):
                name = next(iter(self.manifest["files"])); path = self.raw / name
                path.write_bytes(b"changed")
                if failure == "missing": path.unlink()
                driver = object.__new__(release.Build)
                driver.plan, driver.env, driver.info = self.plan(), {}, {}
                driver.out = self.root / ("never-created-" + failure)
                with patch.object(release.subprocess, "run", side_effect=self.healthy),                      patch.object(release.appimage_update, "pins", return_value=self.manifest),                      patch.object(release.build_identity, "reserve") as reserve:
                    with self.assertRaises(ValueError): driver.execute()
                reserve.assert_not_called(); self.assertFalse(driver.out.exists())
    def test_planning_failure_creates_no_output_or_build_reservation(self):
        pw = self.root / "pw"; pw.mkdir(); (pw / "package.json").write_text("{}")
        ledger = self.root / "ledger.json"; ledger.write_text("unchanged ledger")
        output = self.root / "never-planned"
        args = release.parser().parse_args(["--product-rev","main","--documentserver-rev","elixir/dev",
            "--build-number","42","--channel","rc","--published-versions",str(self.root/"inventory"),
            "--build-ledger",str(ledger),"--playwright-core",str(pw),"--targets","linux","--build-only"])
        package = json.loads((ROOT/"desktop/package.json").read_text())
        full = {"artifact_version":"public-full", "manifest_sha256":"1"*64}
        pdf = {"artifact_version":"public-pdf", "manifest_sha256":"2"*64}
        def pin(repo, revision, path):
            return package if path == "desktop/package.json" else full
        (self.raw / next(iter(self.manifest["files"]))).unlink()
        with patch.object(release, "revision", return_value="a"*40), \
             patch.object(release, "pin", side_effect=pin), \
             patch.object(release, "gitlinks", return_value={"sdkjs":"b"*40}), \
             patch.object(release, "git", return_value=(ROOT/"desktop/build-identity.cjs").read_text()), \
             patch.object(release, "capture", return_value=json.dumps({"version":"0.3.2-rc.42"})), \
             patch.object(release.build_identity, "published", return_value={}), \
             patch.object(release.build_identity, "allocation"), \
             patch.object(release.build_identity, "reserve") as reserve, \
             patch.object(release, "pdf_source_pin", return_value=(pdf, "public-pin.json")), \
             patch.object(release, "verify_runtime", side_effect=[full,pdf]), \
             patch.object(release, "output_path", return_value=output), \
             patch.object(release, "appimage_tool_cache", return_value=self.raw), \
             patch.object(release.appimage_update, "pins", return_value=self.manifest), \
             patch.object(release.subprocess, "run", side_effect=self.healthy):
            with self.assertRaisesRegex(ValueError, "restore"):
                release.make_plan(args)
        reserve.assert_not_called()
        self.assertFalse(output.exists())
        self.assertEqual(ledger.read_text(), "unchanged ledger")
    def test_success_records_tools_and_changed_manifest_is_rejected(self):
        plan = self.plan()
        with patch.object(release.subprocess, "run", side_effect=self.healthy),              patch.object(release.appimage_update, "pins", return_value=self.manifest):
            result = release.host_preflight(plan, {})
            self.assertEqual(result["appimage_tools"]["files"], self.manifest["files"])
            plan["appimage_update"]["pins_sha256"] = "0"*64
            with self.assertRaises(ValueError): release.host_preflight(plan, {})
    def test_default_is_persistent_and_independent_of_per_build_cache(self):
        args = release.parser().parse_args(["--product-rev","main","--documentserver-rev","elixir/dev",
            "--build-number","42","--channel","rc","--published-versions","/owned/published.json",
            "--build-ledger","/owned/ledger.json","--cache","/srv/elixiroffice/cache/disposable"])
        self.assertEqual(args.appimage_tool_cache, Path("/srv/elixiroffice/cache/release-tools/appimage"))
        cache = release.appimage_tool_cache(args.appimage_tool_cache)
        self.assertEqual(cache.parent, args.appimage_tool_cache)
        self.assertEqual(cache.name, release.digest(ROOT / "tools/release/appimage-tools.json"))
        with self.assertRaises(ValueError): release.appimage_tool_cache(Path("/srv/elixiroffice/wt/disposable"))
        with self.assertRaises(ValueError): release.appimage_tool_cache(Path("/srv/elixiroffice/cache/disposable"))

if __name__ == "__main__":
    unittest.main()
