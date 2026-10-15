import importlib.util
from pathlib import Path
import stat
import tempfile
import unittest
ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("installer", ROOT / "deploy/server/init.py")
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)

class Installation(unittest.TestCase):
    def test_private_secret_and_refuse_reinitialization(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "install"
            installer.install(p, "elixiroffice/documentserver:release-1", "caddy:2.11.2", "office.example.org")
            self.assertEqual(stat.S_IMODE((p / "server.env").stat().st_mode), 0o600)
            secret = next(x.split("=", 1)[1] for x in (p / "server.env").read_text().splitlines() if x.startswith("JWT_SECRET="))
            self.assertEqual(len(secret), 64)
            before = (p / "server.env").read_bytes()
            with self.assertRaises(ValueError):
                installer.install(p, "elixiroffice/documentserver:release-2", "caddy:2.11.2", "office.example.org")
            self.assertEqual(before, (p / "server.env").read_bytes())
    def test_reject_injection_and_unpinned_image(self):
        for image in ("image", "image:latest", "image:tag\nJWT_SECRET=bad", "image:tag$bad"):
            with self.assertRaises(ValueError):
                installer.image_ref(image)
        with tempfile.TemporaryDirectory() as tmp:
            for domain in ("https://office.example.org", "office.example.org:443", "office..org", "office\n:80"):
                with self.assertRaises(ValueError):
                    installer.install(Path(tmp) / "i", "image:tag", "caddy:2.11.2", domain)
if __name__ == "__main__":
    unittest.main()
