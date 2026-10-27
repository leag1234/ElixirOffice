# SPDX-License-Identifier: AGPL-3.0-only
import hashlib
import importlib.util
import io
import json
import os
import re
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest

source = Path(__file__).resolve().parents[2] / "tools/release/public_source.py"
spec = importlib.util.spec_from_file_location("public_source", source)
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class PublicSourceArchive(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.work = self.root / "work"
        self.work.mkdir()
        self.run_git(self.work, "init", "-q")
        self.run_git(self.work, "config", "user.name", "Public source fixture")
        self.run_git(self.work, "config", "user.email", "fixture@example.invalid")
        (self.work / "LICENSE").write_text("Fixture license; retain this text.\n")
        (self.work / "program.py").write_text("print('public source')\n")
        (self.work / "program.py").chmod(0o755)
        (self.work / "current").symlink_to("program.py")
        self.repo = self.root / "public.git"
        self.proof = self.root / "qualification.json"
        self.selection = self.root / "selection.json"
        self.archive = self.root / "source.tar.gz"
        self.policy_file = self.root / "policy.json"
        self.policy_file.write_text(json.dumps({"schema": 1, "patterns": {
            "owner_paths": "/private-operator/", "LAN": r"192[.]168[.]\d+[.]\d+",
            "private_fixture_name": "private-corpus-fixture", "host_uri": "private-host-fixture",
            "provider_key": "credential-fixture-[0-9]+"}, "canonical_lan_files": {}}))
        self.policy = release.load_policy(self.policy_file, release.digest(self.policy_file))
        self.refresh()

    def run_git(self, path, *args):
        return subprocess.check_output(["git", "-C", str(path), *args], stderr=subprocess.PIPE).decode().strip()

    def refresh(self, stage=True):
        if stage:
            self.run_git(self.work, "add", ".")
        self.run_git(self.work, "commit", "-qm", "Public source fixture", "--allow-empty")
        if not self.repo.exists():
            subprocess.run(["git", "clone", "--bare", "-q", str(self.work), str(self.repo)], check=True)
        else:
            self.run_git(self.repo, "fetch", "-q", str(self.work), "HEAD:refs/heads/fixture")
        self.head = self.run_git(self.work, "rev-parse", "HEAD")
        self.proof.write_text(json.dumps({"result": "PASS", "repositories": [{"name": "fixture", "public_head": self.head}]}))
        self.value = {"schema": 1, "public_source_selection": True, "roots": ["product"],
                      "repositories": [{"path": "product", "repository": str(self.repo),
                      "public_revision": self.head, "public_origin": "https://github.com/public-fixture/source.git",
                      "qualification": {"file": str(self.proof), "sha256": release.digest(self.proof), "name": "fixture"}}],
                      "supplemental_files": [], "required_paths": ["product/LICENSE", "product/program.py"]}
        self.save_selection()

    def save_selection(self):
        self.selection.write_text(json.dumps(self.value))
        return release.digest(self.selection)

    def create(self):
        return release.create_archive(self.selection, release.digest(self.selection), self.archive, self.policy)

    def raw_archive(self, path, data=b"ordinary source", mode=0o644, link=None):
        # Independent producer: the verifier must inspect bytes even without a trustworthy manifest.
        with tarfile.open(self.archive, "w:gz") as target:
            item = tarfile.TarInfo(release.ROOT + "/" + path)
            item.mode = mode
            if link is not None:
                item.type = tarfile.SYMTYPE
                item.linkname = link
                target.addfile(item)
            else:
                item.size = len(data)
                target.addfile(item, io.BytesIO(data))

    def test_public_privacy_guard_sources_remain_publishable(self):
        # Synthetic rejection samples must not embed operator/process literals in the shipped tests.
        policy = ({name: re.compile(rb"(?!)") for name in release.POLICY_CLASSES}, {})
        for path, public_name in [(source, "product/tools/release/public_source.py"),
                                  (Path(__file__), "product/tests/release/public-source.test.py")]:
            with self.subTest(path=public_name):
                release.privacy(public_name, path.read_bytes(), policy)

    def test_round_trip_preserves_legal_bytes_executable_mode_and_safe_links(self):
        result = self.create()
        self.assertEqual(result["result"], "PASS")
        self.assertEqual(result["repository_count"], 1)
        self.assertEqual(result["files"], 3)
        with tarfile.open(self.archive) as archive:
            self.assertEqual(archive.extractfile(release.ROOT + "/product/LICENSE").read(), (self.work / "LICENSE").read_bytes())
            self.assertEqual(archive.getmember(release.ROOT + "/product/program.py").mode, 0o755)
            self.assertEqual(archive.getmember(release.ROOT + "/product/current").linkname, "program.py")

    def test_internal_fixture_in_qualified_tree_fails_before_any_public_output(self):
        ledger = self.root / "ledger.json"
        ledger.write_bytes(b'{"next":123}')
        original = ledger.read_bytes()
        for name in ("AGENTS.md", "CLAUDE.md", "docs/handoff/journal.md"):
            with self.subTest(name=name):
                path = self.work / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("Internal fixture\n")
                self.refresh()
                with self.assertRaisesRegex(ValueError, "internal source path"):
                    self.create()
                self.assertFalse(self.archive.exists())
                self.assertEqual(ledger.read_bytes(), original)
                path.unlink()

    def test_actual_archive_internal_paths_are_rejected(self):
        for name in ("product/AGENTS.md", "product/CLAUDE.md", "product/docs/handoff/journal.md", "product/.env"):
            with self.subTest(name=name):
                self.raw_archive(name)
                with self.assertRaisesRegex(ValueError, "internal source path"):
                    release.verify_archive(self.archive, self.policy)

    def test_actual_archive_process_operator_and_policy_markers_fail_closed(self):
        values = [b"MS" + b"G 12", b"RE" + b"PORT45", b"Ses" + b"sion A", b"handoff/" + b"bus",
                  b"seen-" + b"D", b"from-" + b"E.md", b"eo-" + b"fire", b"operator" + b"." + b"ddns" + b"." + b"net",
                  b"/private-operator/work", b"192.168." + b"4.2", b"private-corpus-fixture",
                  b"private-host-fixture", b"credential-fixture-123"]
        for value in values:
            with self.subTest(value_hash=hashlib.sha256(value).hexdigest()):
                self.raw_archive("product/data.bin", b"binary\0" + value)
                with self.assertRaisesRegex(ValueError, "markers|privacy rejected"):
                    release.verify_archive(self.archive, self.policy)

    def test_canonical_fixture_exception_is_exact_file_hash_and_class_only(self):
        data = b"Example 192.168." + b"2.3"
        policy = (self.policy[0], {"product/example": hashlib.sha256(data).hexdigest()})
        release.privacy("product/example", data, policy)
        for name, value in [("product/other", data), ("product/example", data + b" "),
                            ("product/example", data + b" MS" + b"G 1")]:
            with self.assertRaises(ValueError):
                release.privacy(name, value, policy)

    def test_missing_exact_nested_source_is_rejected(self):
        self.run_git(self.work, "update-index", "--add", "--cacheinfo", "160000," + self.head + ",dependency")
        self.run_git(self.work, "commit", "-qm", "Nested public fixture")
        self.refresh(stage=False)
        with self.assertRaisesRegex(ValueError, "nested corresponding-source"):
            self.create()

    def test_private_worktree_cannot_be_selected(self):
        self.value["repositories"][0]["repository"] = str(self.work)
        self.save_selection()
        with self.assertRaisesRegex(ValueError, "qualified bare export"):
            self.create()
        self.assertFalse(self.archive.exists())

    def test_qualification_revision_and_fingerprints_must_match(self):
        self.proof.write_text(self.proof.read_text() + " ")
        with self.assertRaisesRegex(ValueError, "qualification changed"):
            self.create()
        row = self.value["repositories"][0]
        row["qualification"]["sha256"] = release.digest(self.proof)
        row["public_revision"] = "1" * 40
        self.save_selection()
        with self.assertRaisesRegex(ValueError, "qualified public source"):
            self.create()

    def test_supplemental_runtime_tampering_and_missing_coverage_fail(self):
        runtime = self.root / "runtime.wasm"
        runtime.write_bytes(b"pinned runtime fixture")
        self.value["supplemental_files"] = [{"path": "runtime/runtime.wasm", "file": str(runtime), "sha256": release.digest(runtime), "mode": 0o644}]
        self.save_selection()
        runtime.write_bytes(b"changed")
        with self.assertRaisesRegex(ValueError, "fingerprint mismatch"):
            self.create()
        self.assertFalse(self.archive.exists())
        self.value["supplemental_files"] = []
        self.value["required_paths"].append("runtime/runtime.wasm")
        self.save_selection()
        with self.assertRaisesRegex(ValueError, "coverage is incomplete"):
            self.create()

    def test_archive_traversal_absolute_names_and_escaping_symlink_are_rejected(self):
        for path, link in [("../escape", None), ("product/../../escape", None), ("/absolute", None),
                           ("product/link", "../../escape"), ("product/link", "/etc/passwd"), (r"product/..\..\escape", None), ("product/link", r"C:\outside")]:
            with self.subTest(path=path, link=link):
                self.raw_archive(path, link=link)
                with self.assertRaises(ValueError):
                    release.verify_archive(self.archive, self.policy)

    def test_unmanifested_actual_payload_is_rejected(self):
        self.raw_archive("product/unmanifested.py")
        with self.assertRaisesRegex(ValueError, "complete source manifest"):
            release.verify_archive(self.archive, self.policy)

    def test_verifier_requires_external_selection_and_exact_actual_git_payload(self):
        self.create()
        with self.assertRaisesRegex(ValueError, "selection changed or is missing"):
            release.verify_archive(self.archive, self.policy)
        old_selection = self.root / "old-selection.json"
        old_selection.write_bytes(self.selection.read_bytes())
        old_sha = release.digest(old_selection)
        (self.work / "program.py").write_text("print('changed public revision')\n")
        self.refresh()
        with self.assertRaisesRegex(ValueError, "qualification changed"):
            release.verify_archive(self.archive, self.policy, old_selection, old_sha)
        with self.assertRaisesRegex(ValueError, "Actual archive differs"):
            release.verify_archive(self.archive, self.policy, self.selection, release.digest(self.selection))

    def test_link_graph_rejects_chain_escape_cycles_and_member_ancestors(self):
        with self.assertRaisesRegex(ValueError, "chain escapes"):
            release.verify_link_graph({"p/a": ".", "p/b": "a/../.."}, {"p/a", "p/b"})
        with self.assertRaisesRegex(ValueError, "cyclic"):
            release.verify_link_graph({"p/a": "b", "p/b": "a"}, {"p/a", "p/b"})
        with self.assertRaisesRegex(ValueError, "ancestor"):
            release.verify_link_graph({"p/a": "."}, {"p/a", "p/a/data"})
        release.verify_link_graph({"p/a": "../q/data"}, {"p/a", "q/data"})

    def test_actual_member_name_is_scanned_without_manifest_serialization(self):
        for name in ["product/RE" + "PORT 12.txt", "product/eo-" + "fire.txt", "product/private-host-fixture.txt"]:
            self.raw_archive(name)
            with self.assertRaisesRegex(ValueError, "markers|privacy rejected"):
                release.verify_archive(self.archive, self.policy)

    def test_unqualified_private_origins_and_alternate_objects_are_rejected(self):
        row = self.value["repositories"][0]
        for origin in ["file:///private/repo", "ssh://private/repo", "https://127.0.0.1/repo", "https://name:token@example.org/repo", "https://repo.internal/private.git"]:
            with self.subTest(origin=origin):
                row["public_origin"] = origin
                self.save_selection()
                with self.assertRaises(ValueError):
                    self.create()
        row["public_origin"] = "https://github.com/public-fixture/source.git"
        self.save_selection()
        alternate = self.repo / "objects/info/alternates"
        alternate.write_text(str(self.work / ".git/objects") + "\n")
        with self.assertRaisesRegex(ValueError, "self-contained"):
            self.create()

    def test_policy_must_be_complete_and_fingerprinted(self):
        with self.assertRaisesRegex(ValueError, "fingerprint mismatch"):
            release.load_policy(self.policy_file, "0" * 64)
        value = json.loads(self.policy_file.read_text())
        value["patterns"].pop("provider_key")
        self.policy_file.write_text(json.dumps(value))
        with self.assertRaisesRegex(ValueError, "Incomplete"):
            release.load_policy(self.policy_file, release.digest(self.policy_file))

    def test_driver_refuses_to_checksum_an_unverified_public_source_archive(self):
        driver_spec = importlib.util.spec_from_file_location("desktop_beta", source.parent / "desktop_beta.py")
        driver = importlib.util.module_from_spec(driver_spec)
        driver_spec.loader.exec_module(driver)
        self.archive = self.root / "elixiroffice-desktop-source.tar.gz"
        self.raw_archive("product/AGENTS.md")
        with self.assertRaisesRegex(ValueError, "fingerprinted privacy policy"):
            driver.public_artifact_names(self.root)
        with self.assertRaisesRegex(ValueError, "internal source path"):
            driver.public_artifact_names(self.root, self.policy_file, release.digest(self.policy_file), self.selection, release.digest(self.selection))
        self.archive.unlink()
        self.create()
        self.assertIn(self.archive.name, driver.public_artifact_names(self.root, self.policy_file, release.digest(self.policy_file), self.selection, release.digest(self.selection)))

    def encoded_fixture(self, raw=b"public runtime fixture"):
        node = os.environ.get("EO_PUBLIC_SOURCE_NODE", "node")
        encoded = subprocess.check_output([node, "-e", "const z=require('node:zlib'),fs=require('node:fs');process.stdout.write(z.brotliCompressSync(fs.readFileSync(0)));"], input=raw) + b" MS" + b"G1 "
        plain = self.root / "runtime.wasm"
        compressed = self.root / "runtime.wasm.br"
        plain.write_bytes(raw); compressed.write_bytes(encoded)
        row = {"path": "runtime/runtime.wasm.br", "sha256": release.digest(compressed), "bytes": len(encoded), "codec": "brotli",
               "decoded_sha256": release.digest(plain), "decoded_bytes": len(raw), "paired_path": "runtime/runtime.wasm",
               "paired_sha256": release.digest(plain), "paired_bytes": len(raw), "decodedByteEqual": True}
        approval = self.root / "encoded-approval.json"
        approval.write_text(json.dumps({"result": "APPROVED_ENCODING_FALSE_POSITIVE", "classification": row}))
        policy = json.loads(self.policy_file.read_text())
        policy["encoded_classifications"] = [{**row, "approval": {"file": str(approval), "sha256": release.digest(approval)}}]
        self.policy_file.write_text(json.dumps(policy))
        self.policy = release.load_policy(self.policy_file, release.digest(self.policy_file), node)
        self.value["supplemental_files"] = [{"path": name, "file": str(file), "sha256": release.digest(file), "mode": 0o644}
                                            for name, file in [("runtime/runtime.wasm", plain), ("runtime/runtime.wasm.br", compressed)]]
        self.save_selection()
        return row, encoded, plain, compressed

    def test_exact_encoded_tuple_is_decoded_checked_and_bound_to_actual_archive_pair(self):
        row, encoded, plain, compressed = self.encoded_fixture()
        result = self.create()
        self.assertEqual(result["encoded_classifications"], [row])
        for name, data in [("runtime/other.wasm.br", encoded), (row["path"], encoded + b"changed")]:
            with self.assertRaisesRegex(ValueError, "markers"):
                release.privacy(name, data, self.policy)
        self.archive.unlink()
        self.value["supplemental_files"] = [x for x in self.value["supplemental_files"] if x["path"] != row["paired_path"]]
        self.save_selection()
        with self.assertRaisesRegex(ValueError, "exact decoded-data pair"):
            self.create()
        self.assertFalse(self.archive.exists())

    def test_encoded_classification_never_allows_a_decoded_forbidden_marker(self):
        row, encoded, plain, compressed = self.encoded_fixture(b"private-host-fixture")
        with self.assertRaisesRegex(ValueError, "privacy rejected"):
            release.privacy(row["path"], encoded, self.policy)

    def test_encoded_approval_and_codec_are_not_generic_waivers(self):
        row, encoded, plain, compressed = self.encoded_fixture()
        value = json.loads(self.policy_file.read_text())
        value["encoded_classifications"][0]["codec"] = "gzip"
        self.policy_file.write_text(json.dumps(value))
        with self.assertRaisesRegex(ValueError, "pairing"):
            release.load_policy(self.policy_file, release.digest(self.policy_file))

    def image_fixture(self, comment=False, overlap=False, extra=False):
        # One black pixel: clear, pixel zero, end code; the marker follows the LZW end code.
        marker = b"MS" + b"G1"
        data = b"GIF89a\x01\x00\x01\x00\x80\x00\x00" + b"\0\0\0\xff\xff\xff"
        if comment:
            data += b"\x21\xfe\x04" + marker + b"\0"
        data += b"\x2c\0\0\0\0\x01\0\x01\0\0\x02"
        if overlap:
            # The second subblock length byte is ASCII S, making a raw marker span a block header.
            data += b"\x03\x44\x01M\x53G1" + b"\0" * 81
        else:
            pixels = b"\x44\x01" + b" ".join([marker] * (2 if extra else 1))
            data += bytes([len(pixels)]) + pixels
        data += b"\0\x3b"
        image = self.root / "public.gif"
        image.write_bytes(data)
        (self.work / "public.gif").write_bytes(data)
        self.refresh()
        rgba = b"\0\0\0\xff"
        decoded = hashlib.sha256((0).to_bytes(4, "big") + (1).to_bytes(4, "big") * 2 + rgba).hexdigest()
        row = {"path": "product/public.gif", "sha256": release.digest(image), "bytes": len(data), "codec": "gif-lzw",
               "git_blob": hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest(), "frames": 1,
               "decoded_RGBA_bytes": 4, "decoded_RGBA_sha256": decoded,
               "public_origin": self.value["repositories"][0]["public_origin"], "public_revision": self.head, "public_baseline": self.head,
               "signature": "GIF89a", "extension_blocks": 1 if comment else 0, "LZW_subblocks": 2 if overlap else 1,
               "process_matches": 1, "decoder": "Pillow", "decoder_version": "fixture", "decoded_process_matches": 0,
               "decoded_host_matches": 0, "framing": "uint32be index,width,height followed by RGBA pixels"}
        decode = self.root / "image-decode.json"
        decode.write_text(json.dumps({"state": "ACTUAL_GIF_ALL_FRAMES_DECODE_PASS", "encoded_sha256": row["sha256"],
                                    "frames": 1, "RGBA_bytes": 4, "framed_RGBA_stream_sha256": decoded,
                                    "decoded_process_host_private_markers": 0, "decoder": "Pillow", "decoder_version": "fixture",
                                    "framing": row["framing"]}))
        approval = self.root / "image-approval.json"
        approval.write_text(json.dumps({"result": "APPROVED_PUBLIC_GIF_ENCODING_FALSE_POSITIVE", "classification": row}))
        value = json.loads(self.policy_file.read_text())
        value["image_classifications"] = [{**row, "approval": {"file": str(approval), "sha256": release.digest(approval)},
                                        "decode_proof": {"file": str(decode), "sha256": release.digest(decode)}}]
        self.policy_file.write_text(json.dumps(value))
        self.policy = release.load_policy(self.policy_file, release.digest(self.policy_file))
        self.save_selection()
        return row, data, decode

    def test_exact_public_gif_classification_preserves_encoded_bytes_and_manifest(self):
        row, data, decode = self.image_fixture()
        self.assertEqual(self.create()["encoded_classifications"], [row])
        for name, payload in [("product/other.gif", data), (row["path"], data + b"changed")]:
            with self.assertRaisesRegex(ValueError, "markers"):
                release.privacy(name, payload, self.policy)

    def test_public_gif_classification_cannot_hide_a_metadata_marker(self):
        row, data, decode = self.image_fixture(comment=True)
        with self.assertRaisesRegex(ValueError, "outside its encoded image"):
            self.create()
        self.assertFalse(self.archive.exists())

    def test_public_gif_decode_evidence_and_shape_are_exact(self):
        row, data, decode = self.image_fixture()
        decode.write_text(decode.read_text() + " ")
        with self.assertRaisesRegex(ValueError, "evidence changed"):
            release.load_policy(self.policy_file, release.digest(self.policy_file))
        for value in [b"not gif", data[:-1], data + b"trailing", data[:20]]:
            with self.subTest(payload_sha=hashlib.sha256(value).hexdigest()), self.assertRaises(ValueError):
                release.gif_image_ranges(value)

    def test_public_gif_classification_rejects_a_changed_public_blob(self):
        row, data, decode = self.image_fixture()
        self.policy[2]["images"][row["path"]]["git_blob"] = "1" * 40
        with self.assertRaisesRegex(ValueError, "public Git blob"):
            release.privacy(row["path"], data, self.policy)

    def test_public_gif_classification_rejects_a_changed_selected_revision(self):
        row, data, decode = self.image_fixture()
        self.policy[2]["images"][row["path"]]["public_revision"] = "1" * 40
        with self.assertRaisesRegex(ValueError, "selected public revision"):
            self.create()

    def test_public_gif_classification_rejects_overlap_and_extra_markers(self):
        for arguments in [{"overlap": True}, {"extra": True}]:
            with self.subTest(arguments=arguments):
                row, data, decode = self.image_fixture(**arguments)
                with self.assertRaisesRegex(ValueError, "outside its encoded image"):
                    self.create()
                self.assertFalse(self.archive.exists())

    def test_public_gif_classification_rejects_decode_failure_or_changed_decoder(self):
        for change in [{"state": "DECODE_FAILED"}, {"decoder_version": "changed"}]:
            with self.subTest(change=change):
                row, data, decode = self.image_fixture()
                proof = json.loads(decode.read_text())
                proof.update(change)
                decode.write_text(json.dumps(proof))
                policy = json.loads(self.policy_file.read_text())
                policy["image_classifications"][0]["decode_proof"]["sha256"] = release.digest(decode)
                self.policy_file.write_text(json.dumps(policy))
                with self.assertRaisesRegex(ValueError, "decode proof|decoder or framing"):
                    release.load_policy(self.policy_file, release.digest(self.policy_file))


if __name__ == "__main__":
    unittest.main()
