# SPDX-License-Identifier: AGPL-3.0-only
import hashlib
import importlib.util
from pathlib import Path
import tempfile
import subprocess
import json
import unittest

source = Path(__file__).resolve().parents[2] / "tools/release/appimage_update.py"
spec = importlib.util.spec_from_file_location("appimage_update", source)
update = importlib.util.module_from_spec(spec)
spec.loader.exec_module(update)


class ExternalUpdate(unittest.TestCase):
    def test_channels_are_explicit_and_cannot_inject_a_transport(self):
        self.assertEqual(update.update_information("latest-all"), "gh-releases-zsync|leag1234|elixiroffice|latest-all|ElixirOffice-*x86_64.AppImage.zsync")
        with self.assertRaises(ValueError):
            update.update_information("latest|other")

    def test_zsync_bytes_name_and_rolling_table_must_match(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            image = root / "public.bin"
            image.write_bytes(b"public synthetic bytes")
            header = "zsync: 0.6.2\nFilename: public.bin\nURL: public.bin\nBlocksize: 2048\nLength: %d\nHash-Lengths: 1,2,4\nSHA-1: %s\n\n" % (image.stat().st_size, hashlib.sha1(image.read_bytes()).hexdigest())
            control = root / "public.bin.zsync"
            control.write_bytes(header.encode() + b"0" * 6)
            update.verify_zsync(image, control)
            image.write_bytes(b"stale public fixture")
            with self.assertRaisesRegex(ValueError, "bytes"):
                update.verify_zsync(image, control)
            image.write_bytes(b"public synthetic bytes")
            control.write_bytes(header.replace("Filename: public.bin", "Filename: stale.bin").encode() + b"0" * 6)
            with self.assertRaisesRegex(ValueError, "filename"):
                update.verify_zsync(image, control)
            control.write_bytes(header.encode() + b"0" * 5)
            with self.assertRaisesRegex(ValueError, "rolling-block"):
                update.verify_zsync(image, control)

    def test_an_unreviewed_pinned_builder_cannot_prepare_tools(self):
        with tempfile.TemporaryDirectory() as directory:
            command = ["python3", str(source), "--prepare-only", "--cache", directory,
                       "--image", "sha256:" + "0" * 64]
            result = subprocess.run(command, capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("reviewed manifest", result.stderr)
            self.assertEqual(list(Path(directory).iterdir()), [])

    def test_tool_manifest_has_exact_content_pins_and_licences(self):
        x = update.pins(source.with_name("appimage-tools.json"))
        self.assertEqual(x["channel"], "latest-all")
        self.assertEqual(x["files"]["zsync.deb"]["version"], "0.6.2-5")
        self.assertIn("runtime.LICENSE", x["files"])
        for name in ("file", "libmagic1", "libmagic-mgc"):
            self.assertEqual(x["files"][name + ".deb"]["version"], "1:5.44-3")
            self.assertRegex(x["file_copyright_sha256"][name], "^[0-9a-f]{64}$")

    def test_file_environment_uses_verified_private_cache(self):
        env = update.tool_environment(Path("/verified"), Path("/owned-home"))
        self.assertTrue(env["PATH"].startswith("/verified/file-tools/usr/bin:/verified/zsync/usr/bin:"))
        self.assertEqual(env["LD_LIBRARY_PATH"], "/verified/file-tools/usr/lib/x86_64-linux-gnu")
        self.assertEqual(env["MAGIC"], "/verified/file-tools/usr/lib/file/magic.mgc")


    def launcher_fixture(self, root):
        (root / 'org.elixiroffice.desktop.desktop').write_text('[Desktop Entry]\nExec=AppRun --no-sandbox %U\nMimeType=' + ';'.join(x for x in update.MIME_TYPES if x != 'application/pdf') + ';\n')
        launcher = root / 'AppRun'
        launcher.write_text('#!/bin/bash\nargs=("$@")\nBIN="$APPDIR/stub"\nexport EO_LAUNCH_ENV=preserved\ntrap atexit EXIT\nHAVE_NO_SANDBOX=0\nif [ $HAVE_NO_SANDBOX -eq 0 ] && ! unshare -Ur true 2>/dev/null ; then\n  NO_SANDBOX=(--no-sandbox)\nfi\n\natexit()\n{\n exec "$BIN" "${NO_SANDBOX[@]}" "${args[@]}"\n}\n')
        launcher.chmod(0o755)
        (root / 'stub').write_text('#!/bin/bash\nprintf "env=%s\\n" "$EO_LAUNCH_ENV"\nprintf "arg=%s\\n" "$@"\n')
        (root / 'stub').chmod(0o755)
        return launcher

    def test_launcher_fallback_is_conditional_warns_and_preserves_arguments(self):
        import os
        for userns_exit in (0, 1):
            with self.subTest(userns_exit=userns_exit), tempfile.TemporaryDirectory(prefix='eo launcher ') as directory:
                root = Path(directory); launcher = self.launcher_fixture(root)
                # Production inventory is sorted; omit PDF rather than an arbitrary MIME type.
                desktop = root / 'org.elixiroffice.desktop.desktop'
                desktop.write_text('[Desktop Entry]\nExec=AppRun --no-sandbox %U\nMimeType=' + ';'.join(x for x in update.MIME_TYPES if x != 'application/pdf') + ';\n')
                receipt = update.prepare_launcher(root)
                self.assertEqual(len(receipt['mime_types']), 19)
                self.assertIn('application/pdf', receipt['mime_types'])
                self.assertIn('Exec=AppRun %U\n', desktop.read_text())
                self.assertFalse(any(flag in desktop.read_text() for flag in update.FORBIDDEN_FLAGS))
                bin_dir = root / 'bin'; bin_dir.mkdir()
                (bin_dir / 'unshare').write_text('#!/bin/bash\nexit ' + str(userns_exit) + '\n'); (bin_dir / 'unshare').chmod(0o755)
                env = {**os.environ, 'APPDIR': str(root), 'PATH': str(bin_dir)}
                result = subprocess.run([str(launcher), 'file:///public/document%20one.docx'], env=env, capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn('env=preserved\n', result.stdout)
                self.assertIn('arg=file:///public/document%20one.docx\n', result.stdout)
                self.assertEqual('arg=--no-sandbox\n' in result.stdout, userns_exit != 0)
                self.assertEqual(result.stderr, update.SANDBOX_WARNING + '\n' if userns_exit else '')
                for flag in (*update.FORBIDDEN_FLAGS, *(x + '=true' for x in update.FORBIDDEN_FLAGS)):
                    rejected = subprocess.run([str(launcher), flag], env=env, capture_output=True, text=True)
                    self.assertEqual(rejected.returncode, 64)
                    self.assertNotIn('env=preserved', rejected.stdout)
                # Missing unshare is also unavailable, with the same explicit warning.
                (bin_dir / 'unshare').unlink()
                missing = subprocess.run([str(launcher)], env=env, capture_output=True, text=True)
                self.assertEqual(missing.returncode, 0)
                self.assertEqual(missing.stderr, update.SANDBOX_WARNING + '\n')

    def test_launcher_rejects_unknown_metadata_without_rewriting(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); self.launcher_fixture(root)
            desktop = root / 'org.elixiroffice.desktop.desktop'
            original = desktop.read_text().replace('Exec=AppRun --no-sandbox %U', 'Exec=AppRun --disable-setuid-sandbox %U')
            desktop.write_text(original)
            with self.assertRaisesRegex(ValueError, 'Unrecognized upstream desktop'):
                update.prepare_launcher(root)
            self.assertEqual(desktop.read_text(), original)


if __name__ == "__main__":
    unittest.main()
