import importlib.util
from pathlib import Path
import tempfile
import json
import stat
import unittest
from unittest.mock import patch
from types import SimpleNamespace
ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("backup", ROOT / "deploy/server/backup.py")
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)
class BackupSafety(unittest.TestCase):
    def test_checksum_and_manifest_rejection(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp); names = {"data":"test_data"}
            files = [*backup.FILES, "data.tar"]
            for name in files:
                (out / name).write_bytes(b"test contents")
            manifest = {"project":"test", "volumes":names,
                        "sha256":{name:backup.digest(out / name) for name in files}}
            backup.restore_validated(manifest, out, "test", names)
            (out / "data.tar").write_bytes(b"corrupted")
            with self.assertRaisesRegex(ValueError, "checksum"):
                backup.restore_validated(manifest, out, "test", names)
            with self.assertRaisesRegex(ValueError, "project"):
                backup.restore_validated(manifest, out, "other", names)
    def test_restore_requires_explicit_replace_before_docker(self):
        args = SimpleNamespace(action="restore", install="/tmp/install", output="/tmp/backup",
                               project="test", helper_image="alpine@sha256:"+"0"*64, replace_volumes=False)
        with patch.object(backup, "command") as docker:
            with self.assertRaisesRegex(ValueError, "replace-volumes"):
                backup.run(args)
            docker.assert_not_called()
    def test_restore_preserves_private_env_and_readable_service_config(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); out = root / "backup"; out.mkdir()
            names = {key:"test_"+key for key in backup.VOLUME_KEYS}
            for name in [*backup.FILES, *(key+".tar" for key in names)]:
                (out / name).write_bytes(b"fixture")
            manifest = {"project":"test", "volumes":names,
                        "sha256":{p.name:backup.digest(p) for p in out.iterdir()}}
            (out / "manifest.json").write_text(json.dumps(manifest))
            args = SimpleNamespace(action="restore", install=str(root / "install"),
                output=str(out), project="test", helper_image="alpine@sha256:"+"0"*64,
                replace_volumes=True)
            with patch.object(backup, "command", return_value=""), \
                 patch.object(backup, "volumes", return_value=names), \
                 patch.object(backup, "compose"), patch.object(backup, "helper") as helper:
                backup.run(args)
                self.assertEqual(helper.call_count, 8)
            self.assertEqual(stat.S_IMODE((root/"install/server.env").stat().st_mode), 0o600)
            self.assertEqual(stat.S_IMODE((root/"install/example.json").stat().st_mode), 0o644)

    def test_running_project_rejected_before_copy(self):
        args = SimpleNamespace(action="restore", install="/tmp/install", output="/tmp/backup",
                               project="test", helper_image="alpine@sha256:"+"0"*64, replace_volumes=True)
        with patch.object(backup, "command", return_value="running") as docker:
            with self.assertRaisesRegex(ValueError, "running"):
                backup.run(args)
            self.assertEqual(docker.call_count, 1)
if __name__ == "__main__":
    unittest.main()
