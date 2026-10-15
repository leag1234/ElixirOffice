#!/usr/bin/env python3
"""Create an independent installation directory without replacing its secrets."""
import argparse
import os
from pathlib import Path
import re
import secrets
import shutil

def image_ref(value):
    if not re.fullmatch(r"[A-Za-z0-9._/:@-]+", value):
        raise ValueError("invalid image reference")
    if value.endswith(":latest") or (":" not in value.rsplit("/", 1)[-1] and "@sha256:" not in value):
        raise ValueError("use a versioned tag or digest, not latest")
    return value

def install(directory, image, caddy, domain):
    image_ref(image)
    image_ref(caddy)
    if not re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?", domain) or ".." in domain:
        raise ValueError("domain must be a hostname, without scheme, path or port")
    target = Path(directory)
    source = Path(__file__).resolve().parent
    names = ("docker-compose.yml", "Caddyfile", "example.json", "backup.py", "server.env")
    if any((target / n).exists() for n in names):
        raise ValueError("installation files already exist; preserve secrets and use the upgrade guide")
    target.mkdir(parents=True, exist_ok=True, mode=0o700)
    for name in names[:-1]:
        shutil.copyfile(source / name, target / name)
        if name == "example.json":
            os.chmod(target / name, 0o644)
    text = (source / "server.env.example").read_text()
    for key, value in {"EO_IMAGE": image, "CADDY_IMAGE": caddy,
                       "EO_DOMAIN": domain, "JWT_SECRET": secrets.token_hex(32)}.items():
        text = re.sub(r"^" + key + r"=.*$", key + "=" + value, text, flags=re.M)
    fd = os.open(target / "server.env", os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as stream:
        stream.write(text)

if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--directory", required=True)
    p.add_argument("--image", required=True)
    p.add_argument("--caddy-image", required=True)
    p.add_argument("--domain", required=True)
    args = p.parse_args()
    try:
        install(args.directory, args.image, args.caddy_image, args.domain)
    except ValueError as error:
        p.error(str(error))
    print("Installation files created; private JWT generated. Follow docs/install-server.md.")
