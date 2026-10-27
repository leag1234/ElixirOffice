# SPDX-License-Identifier: AGPL-3.0-only
import importlib.util
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
HERE=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location("qa_desktop_beta",HERE/"tools/release/desktop_beta.py")
driver=importlib.util.module_from_spec(spec);spec.loader.exec_module(driver)
class QARejected(unittest.TestCase):
 def test_normal_version_validation_rejects_reserved_and_qa_identities(self):
  for pkg in [{"version":"0.0.0-rc.2"},{"version":"0.3.3","name":"elixiroffice-update-qa"},{"version":"0.3.3","build":{"appId":"org.elixiroffice.desktop.updateqa"}},{"version":"0.3.3","qaManifestSha256":"a"*64}]:
   with self.assertRaises(ValueError):driver.validate_desktop_version(pkg)
 def test_publication_folder_rejects_marker_and_renamed_artifact_with_qa_build_info(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);(root/"renamed.exe").write_bytes(b"synthetic QA candidate")
   (root/"QA-DO-NOT-PUBLISH.json").write_text("{}")
   with self.assertRaises(ValueError):driver.public_artifact_names(root)
   (root/"QA-DO-NOT-PUBLISH.json").unlink()
   for info in [{"flavor":"elixiroffice-update-qa"},{"neverPublish":True},{"build_identity":{"version":"0.0.0-rc.2"}}]:
    (root/"BUILD-INFO.json").write_text(json.dumps(info))
    with self.assertRaises(ValueError):driver.public_artifact_names(root)
 def test_publication_check_refuses_qa_before_published_inventory_access(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);info=root/"BUILD-INFO.json";info.write_text(json.dumps({"neverPublish":True,"build_identity":{"version":"0.0.0-rc.2"}}))
   r=subprocess.run([sys.executable,str(HERE/"tools/release/check-publication.py"),"--build-info",str(info),"--published-versions",str(root/"absent.json")],capture_output=True,text=True)
   self.assertNotEqual(r.returncode,0);self.assertIn("QA",r.stderr);self.assertNotIn("FileNotFoundError",r.stderr)

 def test_signed_prepare_and_finalize_cannot_promote_qa_or_reserved_identity(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);root.chmod(0o700)
   info={"neverPublish":True,"state":"awaiting-owner-signatures","build_identity":{"version":"0.0.0-rc.2"}}
   b=json.dumps(info).encode();(root/"BUILD-INFO.json").write_bytes(b);(root/"BUILD-INFO.json").chmod(0o600)
   module=driver.signed_updates_module()
   with self.assertRaisesRegex(ValueError,"QA"):
    module.prepare(root,info,{}, "node",HERE)
   with self.assertRaisesRegex(ValueError,"QA"):
    module.verify(root,hashlib.sha256(b).hexdigest(),root/"absent-public.pem","qa","a"*64,root/"absent-envelopes","node",HERE)
 def test_nested_qa_trust_namespace_is_rejected_before_release_or_publication(self):
  key_id="eo-qa-"+"a"*32
  for value in [{"version":"0.3.3","trust":{"keyId":key_id}},{"version":"0.3.3","extra":[{"keyId":key_id}]}]:
   with self.assertRaisesRegex(ValueError,"QA"):driver.validate_desktop_version(value)
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);(root/"BUILD-INFO.json").write_text(json.dumps({"verification":{"keyId":key_id}}))
   with self.assertRaisesRegex(ValueError,"QA"):driver.public_artifact_names(root)
 def test_finalizer_rejects_qa_key_argument_before_opening_candidate_or_public_key(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);root.chmod(0o700);module=driver.signed_updates_module()
   with self.assertRaisesRegex(ValueError,"QA"):
    module.verify(root,"a"*64,root/"never-open-public.pem","eo-qa-"+"a"*32,"b"*64,root/"never-open-envelopes","node",HERE)
if __name__=="__main__":unittest.main()
