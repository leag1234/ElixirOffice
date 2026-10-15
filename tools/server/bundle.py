#!/usr/bin/env python3
"""Build a deployment archive; optionally export its image, without publishing."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tarfile

def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--image", required=True)
    p.add_argument("--image-record", type=Path, required=True)
    p.add_argument("--licences", type=Path, required=True)
    p.add_argument("--output", type=Path, required=True)
    p.add_argument("--review", action="store_true")
    p.add_argument("--source-offer-url")
    p.add_argument("--export-image", action="store_true")
    args = p.parse_args()
    if not args.review and not (args.source_offer_url or "").startswith("https://"):
        p.error("distribution requires the owner's HTTPS corresponding-source offer; otherwise use --review")
    record = json.loads(args.image_record.read_text())
    for key in ("documentserver_rev", "product_rev", "runtime_version", "runtime_manifest_sha256"):
        if not record.get(key):
            p.error("image build record missing " + key)
    if not (args.licences / "LICENSE").is_file() or not (args.licences / "package-copyright").is_file():
        p.error("export the image's licence and package attribution before bundling")
    repo = Path(__file__).resolve().parents[2]
    revision = subprocess.check_output(["git", "-C", str(repo), "rev-parse", "HEAD"], text=True).strip()
    info = json.loads(subprocess.check_output(["docker", "image", "inspect", args.image], text=True))[0]
    args.output.mkdir(parents=True, exist_ok=False)
    stage = args.output / "elixiroffice-server"
    (stage / "deploy").mkdir(parents=True)
    # Whitelist files: never package generated server.env, __pycache__, or operator config.
    deploy = stage / "deploy/server"
    deploy.mkdir()
    for name in ("docker-compose.yml", "Caddyfile", "example.json", "server.env.example", "init.py", "backup.py"):
        shutil.copyfile(repo / "deploy/server" / name, deploy / name)
    (stage / "docs").mkdir()
    for name in ("install-server.md", "storage.md", "ai.md"):
        shutil.copyfile(repo / "docs" / name, stage / "docs" / name)
    (stage / "docs/handoff").mkdir()
    shutil.copyfile(repo / "docs/handoff/codex-log.md", stage / "docs/handoff/codex-log.md")
    shutil.copytree(args.licences, stage / "licences")
    manifest = {
        "review_only": args.review, "deployment_revision": revision,
        "image_reference": args.image, "loaded_image_id": info["Id"],
        "architecture": info["Architecture"], "os": info["Os"],
        "rootfs_layers": info["RootFS"]["Layers"], "image_build": record,
        "corresponding_source_offer": args.source_offer_url or "Owner publication pending",
        "limits": "Current-source fresh image, public ACME, external Murena and fresh native package acceptance require separate checks."
    }
    (stage / "release.json").write_text(json.dumps(manifest, indent=2) + "\n")
    archive = args.output / "elixiroffice-server-deployment.tar.gz"
    with tarfile.open(archive, "w:gz") as tar:
        tar.add(stage, arcname=stage.name)
    sums = {archive.name:digest(archive)}
    if args.export_image:
        image = args.output / "elixiroffice-server-image.tar.gz"
        with gzip.open(image, "wb") as target:
            proc = subprocess.Popen(["docker", "image", "save", args.image], stdout=subprocess.PIPE)
            shutil.copyfileobj(proc.stdout, target)
            if proc.wait():
                raise RuntimeError("image export failed")
        sums[image.name] = digest(image)
    (args.output / "SHA256SUMS").write_text("".join(sha+"  "+name+"\n" for name,sha in sums.items()))
    print("Deployment archive and checksums created; no publication performed.")

if __name__ == "__main__":
    main()
