# SPDX-License-Identifier: AGPL-3.0-only
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import shutil
import copy
import unittest
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("signed_updates", ROOT / "tools/release/signed_updates.py")
updates = importlib.util.module_from_spec(spec)
spec.loader.exec_module(updates)
spec = importlib.util.spec_from_file_location("desktop_beta", ROOT / "tools/release/desktop_beta.py")
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)

class SignedDriver(unittest.TestCase):
    def setUp(self):
        self.old_umask = os.umask(0o077)

    def tearDown(self):
        os.umask(self.old_umask)

    def test_explicit_opt_in_and_required_parameters(self):
        args = SimpleNamespace(signed_updates=None, signed_update_sequence=None,
                               signed_update_issued_at=None, signed_update_expires_at=None)
        self.assertIsNone(updates.configuration(args))
        args.signed_update_sequence = 1
        with self.assertRaises(ValueError):
            updates.configuration(args)
        args.signed_updates = "owner-signed-v1"
        args.signed_update_issued_at = 1000
        args.signed_update_expires_at = 2000
        self.assertEqual(updates.configuration(args), {"mode":"owner-signed-v1","sequence":1,
                                                      "issuedAt":1000,"expiresAt":2000})
        args.signed_update_expires_at = 1000
        with self.assertRaises(ValueError):
            updates.configuration(args)

    def test_default_feed_guards_remain(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for name in ("latest.yml", "latest-linux.yml", "beta.yml", "app-update.yml"):
                (root / name).write_text("version: 0.4.0\n")
                with self.assertRaises(ValueError):
                    release.public_artifact_names(root)
                (root / name).unlink()
            self.assertEqual(release.public_artifact_names(root), [])

    def fixture(self, root, complete=False):
        identity = {"schema":1,"version":"0.4.0-rc.99","channel":"rc","build_number":99,
                    "product_revision":"a"*40,"documentserver_revision":"b"*40}
        names = ["ElixirOffice-0.4.0-rc.99-x86_64.AppImage",
                 "ElixirOffice-0.4.0-rc.99-x86_64.AppImage.zsync",
                 "ElixirOffice-0.4.0-rc.99-win-x64.exe", "RELEASE-NOTES.md"]
        for n in names:
            (root / n).write_bytes(("FINAL "+n).encode())
        inputs = {"product_revision":"a"*40,"documentserver_revision":"b"*40,
                  "targets":["linux","windows","mac"] if complete else ["linux","windows"],
                  "build_only":not complete,"mac_export_only":False,
                  "signed_update_tools":updates.tool_hashes(ROOT)}
        info = {"schema":1,"state":"running","build_identity":identity,"inputs":inputs,
                "gates":{"linux-six-format":"pass","mac-six-format":"pass"},
                "artifacts":release.checksum_inventory(root,names)}
        import time
        now = int(time.time()*1000)
        config = {"mode":"owner-signed-v1","sequence":99,"issuedAt":now-1000,"expiresAt":now+3600000}
        return info, config

    def prepare(self, root, complete=False):
        info,config = self.fixture(root, complete)
        updates.prepare(root,info,config,"node",ROOT)
        (root / "BUILD-INFO.json").write_text(json.dumps(info,indent=2)+"\n")
        return info,hashlib.sha256((root/"BUILD-INFO.json").read_bytes()).hexdigest()

    def sign_synthetic(self, root):
        # Test-only synthetic key; the release driver never receives a private key.
        script = r"""
const fs=require('fs'),path=require('path'),crypto=require('crypto'),wire=require(process.argv[1]+'/tools/desktop-updates/signed-metadata.cjs');
const root=process.argv[2],info=JSON.parse(fs.readFileSync(root+'/BUILD-INFO.json'));
const key=crypto.generateKeyPairSync('ed25519'),pub=key.publicKey.export({format:'pem',type:'spki'});
fs.writeFileSync(root+'/public.pem',pub,{mode:0o600});fs.mkdirSync(root+'/signatures',{mode:0o700});
for(const row of info.signed_updates.candidates){
 const c=row.context,signature=crypto.sign(null,wire.signingBytes(c),key.privateKey).toString('base64');
 fs.writeFileSync(path.join(root,'signatures',c.metadataName+'.sig.json'),wire.encodeEnvelope(c,[{keyId:'test-key',signature}]),{mode:0o600});
}
console.log(crypto.createHash('sha256').update(key.publicKey.export({format:'der',type:'spki'})).digest('hex'));
"""
        return subprocess.check_output(["node","-e",script,str(ROOT),str(root)],text=True).strip()

    def verify(self, root, seal, fp):
        return updates.verify(root,seal,root/"public.pem","test-key",fp,root/"signatures","node",ROOT)

    def test_owner_handoff_is_one_public_command_for_the_complete_sealed_batch(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp).resolve();info,seal=self.prepare(root)
            row=info["signed_updates"]["batch"]
            plan=root/row["name"]
            self.assertEqual(row["sha256"],hashlib.sha256(plan.read_bytes()).hexdigest())
            command=(root/"OWNER-SIGNING.txt").read_text().strip()
            self.assertEqual(command,info["signed_updates"]["owner_signing"]["command"])
            self.assertEqual(command.count("sign-batch.cjs"),1)
            for value in (str(plan),row["sha256"],"eo-2026-1",row["fingerprint"]):
                self.assertIn(value,command)
            self.assertIn(chr(36)+"{EO_OWNER_SIGNING_KEY:?",command)
            self.assertNotIn("--passphrase",command)
            self.assertNotIn("eo-update-signing",command)
            output=Path(info["signed_updates"]["owner_signing"]["output"])
            self.assertEqual(output.parent.stat().st_mode&0o777,0o700)
            self.assertFalse(output.exists())
            self.assertEqual(len(json.loads(plan.read_bytes())["candidates"]),2)
            self.assertNotIn(plan.name,info["artifacts"])
            self.assertNotIn("OWNER-SIGNING.txt",info["artifacts"])
            self.assertFalse((root/"build-ledger.json").exists())

    def test_owner_handoff_never_overwrites_an_existing_command(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp).resolve();info,config=self.fixture(root)
            file=root/"OWNER-SIGNING.txt";file.write_text("untouched")
            with self.assertRaises(FileExistsError):
                updates.prepare(root,info,config,"node",ROOT)
            self.assertEqual(file.read_text(),"untouched")
            self.assertNotEqual(info.get("state"),"review-candidate")
            self.assertFalse(any(p.name.endswith(".sig.json") for p in root.rglob("*")))
    def test_owner_handoff_refuses_a_linked_signature_workspace(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp).resolve();info,config=self.fixture(root)
            outside=root/"keep";outside.mkdir();(outside/"keep.txt").write_text("untouched")
            (root/".owner-signing").symlink_to(outside,target_is_directory=True)
            with self.assertRaisesRegex(ValueError,"private signature workspace"):
                updates.prepare(root,info,config,"node",ROOT)
            self.assertEqual((outside/"keep.txt").read_text(),"untouched")
            self.assertFalse((root/"OWNER-SIGNING.txt").exists())

    def test_signed_round_trip_inventory_and_hashes(self):
        for complete in (False,True):
            with self.subTest(complete=complete), tempfile.TemporaryDirectory() as tmp:
                root=Path(tmp).resolve()
                info,seal=self.prepare(root,complete)
                self.assertEqual(info["state"],"awaiting-owner-signatures")
                fp=self.sign_synthetic(root)
                final=self.verify(root,seal,fp)
                self.assertEqual(final["state"],"review-candidate" if complete else "partial-unverified")
                names=final["publication_artifacts"]
                for n in ("latest.yml","latest.yml.sig.json","latest-linux.yml","latest-linux.yml.sig.json"):
                    self.assertIn(n,names)
                    self.assertEqual(final["artifacts"][n]["sha256"],hashlib.sha256((root/n).read_bytes()).hexdigest())
                    self.assertIn(n,(root/"SHA256SUMS").read_text())
                self.assertEqual(set(names),set(final["artifacts"]))
                self.assertFalse(final.get("published",False))

    def test_cli_verifies_without_any_build_hooks_or_allocation(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp).resolve();info,seal=self.prepare(root);fp=self.sign_synthetic(root)
            result=subprocess.run(["python3",str(ROOT/"tools/release/desktop_beta.py"),"verify-signed-updates",
                "--folder",str(root),"--seal",seal,"--public-key",str(root/"public.pem"),
                "--key-id","test-key","--fingerprint",fp,"--envelopes",str(root/"signatures")],
                capture_output=True,text=True)
            self.assertEqual(result.returncode,2,result.stderr)
            self.assertEqual(json.loads(result.stdout)["state"],"partial-unverified")
            self.assertFalse((root/"build-ledger.json").exists())

    def test_wrong_or_self_replaced_seal_cannot_finalize(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp).resolve();info,seal=self.prepare(root)
            fp=self.sign_synthetic(root)
            (root/"BUILD-INFO.json").write_text(json.dumps({**info,"state":"review-candidate"}))
            with self.assertRaises(ValueError):
                self.verify(root,seal,fp)
            self.assertFalse((root/"latest.yml.sig.json").exists())

    def test_missing_and_changed_signed_inputs_never_ready(self):
        for filename in ("latest.yml","latest-linux.yml.candidate.json",
                         "ElixirOffice-0.4.0-rc.99-x86_64.AppImage","RELEASE-NOTES.md"):
            with self.subTest(filename=filename), tempfile.TemporaryDirectory() as tmp:
                root=Path(tmp).resolve();info,seal=self.prepare(root);fp=self.sign_synthetic(root)
                (root/filename).write_bytes(b"tampered")
                with self.assertRaises((ValueError,RuntimeError)):
                    self.verify(root,seal,fp)
                self.assertEqual(json.loads((root/"BUILD-INFO.json").read_text())["state"],"awaiting-owner-signatures")

    def test_missing_signature_and_private_key_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp).resolve();info,seal=self.prepare(root);fp=self.sign_synthetic(root)
            (root/"signatures/latest.yml.sig.json").unlink()
            with self.assertRaises((ValueError,RuntimeError)):
                self.verify(root,seal,fp)

    def test_verify_command_bypasses_build_and_allocation(self):
        args=["verify-signed-updates","--folder","/missing-fixture","--seal","0"*64,
              "--public-key","/missing-public-key","--key-id","test-key",
              "--fingerprint","0"*64,"--envelopes","/missing-envelopes"]
        with patch.object(release.build_identity,"reserve",side_effect=AssertionError("must not allocate")):
            self.assertIsNotNone(updates.cli_parser().parse_args(args[1:]))
        result=subprocess.run(["python3",str(ROOT/"tools/release/desktop_beta.py"),*args],
                              capture_output=True,text=True)
        self.assertNotEqual(result.returncode,0)
        self.assertNotIn("--build-number",result.stderr)

    def test_default_execute_matches_integrated_main_byte_for_byte(self):
        # Load the frozen integrated baseline, never execute its build hooks.
        baseline = "bab30a0a7f5f0cc7b489fb537a9e228be7c3b1c5"
        old = subprocess.check_output(["git","-C",str(ROOT),"show",baseline+":tools/release/desktop_beta.py"])
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp).resolve()
            (root/"desktop_beta.py").write_bytes(old)
            for n in ("build_identity.py","appimage_update.py"):
                shutil.copyfile(ROOT/"tools/release"/n,root/n)
            spec=importlib.util.spec_from_file_location("legacy_driver",root/"desktop_beta.py")
            legacy=importlib.util.module_from_spec(spec);spec.loader.exec_module(legacy)
            template=root/"templates";template.mkdir()
            (template/"desktop-release-notes.md").write_text("Version {{VERSION}} build {{BUILD_NUMBER}}\\n")
            output=root/"output"
            plan={"output":str(output),"build_identity":{"version":"0.4.0","build_number":99,"channel":"final",
                  "product_revision":"a"*40},"targets":["linux","windows"],"build_only":True}
            snapshots=[]
            for module in (legacy,release):
                driver=object.__new__(module.Build)
                driver.args=SimpleNamespace(targets=["linux","windows"],build_only=True,
                                            build_ledger=root/"NEVER-CREATED-ledger",published_versions=root/"NEVER-CREATED-history")
                driver.plan=copy.deepcopy(plan);driver.env={};driver.out=output;driver.driver=template
                driver.info={"schema":1,"state":"running","started":"fixed-synthetic-clock",
                             "inputs":driver.plan,"gates":{},"artifacts":{}}
                for stage in ("checkout","assemble","fixtures"):
                    setattr(driver,stage,lambda:None)
                def packages():
                    for n,data in (("ElixirOffice-0.4.0-x86_64.AppImage",b"FINAL REPACK"),
                                   ("ElixirOffice-0.4.0-x86_64.AppImage.zsync",b"FINAL CONTROL"),
                                   ("ElixirOffice-0.4.0-win-x64.exe",b"FINAL NSIS")):
                        (output/n).write_bytes(data)
                driver.packages=packages
                with patch.object(module,"host_preflight",return_value={"synthetic":"identical"}), \
                     patch.object(module.build_identity,"reserve",return_value={"synthetic":"not allocated"}) as reserve, \
                     patch.object(module.build_identity,"published",return_value={"synthetic":"history"}):
                    self.assertEqual(driver.execute(),2);reserve.assert_called_once()
                snapshots.append({str(p.relative_to(output)):p.read_bytes() for p in output.rglob("*") if p.is_file()})
                shutil.rmtree(output)
            self.assertEqual(snapshots[0],snapshots[1])
            self.assertFalse((root/"NEVER-CREATED-ledger").exists())
            self.assertFalse((root/"NEVER-CREATED-history").exists())

    def test_opt_in_execute_stops_pending_after_final_packages(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp).resolve(); output=root/"candidate"
            seed=root/"seed";seed.mkdir()
            info,config=self.fixture(seed)
            shutil.rmtree(seed)
            plan=info["inputs"];plan["signed_updates"]=config
            plan["build_identity"]=info["build_identity"];plan["output"]=str(output)
            driver=object.__new__(release.Build)
            driver.args=SimpleNamespace(targets=["linux","windows"],build_only=True,node="node",
                                        build_ledger=root/"never-ledger",published_versions=root/"never-history")
            driver.plan=plan;driver.env={};driver.out=output;driver.product=ROOT;driver.driver=root
            info["inputs"]=plan;driver.info=info
            (root/"desktop-release-notes.md").write_text("Version {{VERSION}}\\n")
            for stage in ("checkout","assemble","fixtures"):
                setattr(driver,stage,lambda:None)
            def packages():
                for n in info["artifacts"]:
                    (output/n).write_bytes(("FINAL "+n).encode())
            driver.packages=packages
            with patch.object(release,"host_preflight",return_value={}), \
                 patch.object(release.build_identity,"reserve",return_value={"synthetic":True}), \
                 patch.object(release.build_identity,"published",return_value={"synthetic":True}):
                os.umask(0o022)
                self.assertEqual(driver.execute(),3)
                observed = os.umask(0o022)
                self.assertEqual(observed,0o022,"The signing gate must not change package build permissions")
            pending=json.loads((output/"BUILD-INFO.json").read_text())
            self.assertEqual(pending["state"],"awaiting-owner-signatures")
            self.assertTrue((output/"latest.yml").is_file())
            self.assertFalse((output/"latest.yml.sig.json").exists())
            self.assertNotIn("latest.yml",pending["artifacts"])
            self.assertEqual(len(pending["signed_updates"]["candidates"]),2)
            self.assertFalse((root/"never-ledger").exists())

    def test_driver_stages_only_after_final_packages_and_keeps_pending_state(self):
        text=(ROOT/"tools/release/desktop_beta.py").read_text()
        body=text[text.index("    def execute(self):"):text.index("\ndef parser():")]
        self.assertLess(body.index("self.packages()"),body.index("signed_updates_module().prepare"))
        self.assertLess(body.index('checksum_inventory(self.out, names)'),body.index("signed_updates_module().prepare"))
        self.assertIn("return 3",body)
        self.assertIn('"review-candidate" if complete else "partial-unverified"',body)

if __name__=="__main__":
    unittest.main()
