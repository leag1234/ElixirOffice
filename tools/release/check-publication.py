#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Recheck a completed build version against a fresh complete inventory; does not publish or authorize publication."""
import argparse
import json
from pathlib import Path
import subprocess
import build_identity
if __name__=="__main__":
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--build-info",required=True,type=Path);p.add_argument("--published-versions",required=True,type=Path);p.add_argument("--node",default="node")
    a=p.parse_args();info=json.loads(a.build_info.read_text());identity=info["build_identity"]
    module=Path(__file__).resolve().parents[2]/"desktop/build-identity.cjs"
    expected=json.loads(subprocess.check_output([a.node,module,"create",json.dumps([identity["base_version"],identity["channel"],identity["build_number"],identity["product_revision"],identity["documentserver_revision"]])],text=True))
    if identity!=expected:raise ValueError("Inconsistent build identity")
    if info.get("state") not in ("review-candidate","partial-unverified"):raise ValueError("Build is not completed")
    print(json.dumps(build_identity.published(a.published_versions,identity["version"]),indent=2))
    print("PASS published-version freshness/reuse guard only; review, acceptance and owner publication approval remain separate")
