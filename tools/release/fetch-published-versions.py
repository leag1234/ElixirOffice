#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Fetch all public release pages, producing a fresh complete guard inventory; never publish."""
import argparse
import datetime
import json
from pathlib import Path
import re
import urllib.request

REPOSITORY="leag1234/elixiroffice"
def collect(fetch):
    versions=set()
    for page in range(1,1001):
        rows=fetch("https://api.github.com/repos/"+REPOSITORY+"/releases?per_page=100&page="+str(page))
        if not isinstance(rows,list):raise ValueError("Invalid release API response")
        for row in rows:
            if not isinstance(row,dict) or not isinstance(row.get("tag_name"),str) or not isinstance(row.get("draft"),bool):
                raise ValueError("Invalid release record")
            # Historical beta tags can publish plain-version binaries (e.g. 0.1.0).
            # Include actual desktop asset versions rather than assuming tag == app version.
            assets=row.get("assets")
            if not isinstance(assets,list):raise ValueError("Release asset inventory missing")
            if not row["draft"]:
                for asset in assets:
                    if not isinstance(asset,dict) or not isinstance(asset.get("name"),str):raise ValueError("Invalid release asset")
                    match=re.fullmatch(r"ElixirOffice-([0-9]+\.[0-9]+\.[0-9]+(?:-rc\.[1-9][0-9]*)?)-(?:linux-amd64[.]deb|(?:linux-)?x86_64[.]AppImage(?:[.]zsync)?|win-x64[.]exe|mac-arm64[.]dmg)",asset["name"])
                    if match:versions.add(match.group(1))
            tag=row["tag_name"].removeprefix("v")
            if not row["draft"] and re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+(?:-rc\.[1-9][0-9]*)?",tag):versions.add(tag)
        if len(rows)<100:break
    else:raise ValueError("Release pagination limit exceeded; inventory incomplete")
    return {"schema":1,"repository":REPOSITORY,"complete":True,"fetched_at":datetime.datetime.now(datetime.timezone.utc).isoformat(),"versions":sorted(versions)}
def fetch(url):
    request=urllib.request.Request(url,headers={"Accept":"application/vnd.github+json","User-Agent":"ElixirOffice-release-preparation"})
    with urllib.request.urlopen(request,timeout=30) as response:return json.load(response)
if __name__=="__main__":
    p=argparse.ArgumentParser(description=__doc__);p.add_argument("--output",required=True,type=Path);args=p.parse_args()
    data=collect(fetch)
    with args.output.open("x") as out:json.dump(data,out,indent=2);out.write("\n")
    print("Complete release inventory written; "+str(len(data["versions"]))+" canonical versions")
