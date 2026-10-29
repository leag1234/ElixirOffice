#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Sequential, resumable public Office/PDF differential batch."""
import argparse
import csv
import hashlib
import json
import os
import signal
import subprocess
import sys
import time
from pathlib import Path
from differential import SCHEMA, atomic_json, compare, sha256, write_html

SUPPORTED = {".docx", ".doc", ".odt", ".rtf", ".xlsx", ".xls", ".ods", ".csv",
             ".pptx", ".ppt", ".odp"}
HERE = Path(__file__).resolve().parent


def public_path(path):
    resolved = path.resolve()
    if any(part in {"corpus-private", ("corpus-" "real")} for part in resolved.parts):
        raise ValueError("Private inputs are prohibited by this public harness")
    return resolved


def tree_bytes(root):
    total = 0
    for path in root.rglob("*"):
        try:
            if path.is_file():
                total += path.stat().st_size
        except FileNotFoundError:
            # Atomic settings writes/profile cleanup may rename/delete between
            # directory enumeration and stat. The next census sees new paths.
            continue
    return total


def kill_owned_app(case):
    path = case / "render/owned-app.json"
    if not path.exists():
        return
    data = json.loads(path.read_text())
    try:
        pid = int(data["pid"])
        stat = Path(f"/proc/{pid}/stat").read_text()
        start = stat[stat.rfind(")") + 1:].strip().split()[19]
        if start == data["start"] and os.getpgid(pid) == pid:
            os.killpg(pid, signal.SIGKILL)
    except (ProcessLookupError, FileNotFoundError):
        pass


def bounded(command, log, timeout, case, disk_limit=None, prior_bytes=0):
    with open(log, "wb") as stream:
        process = subprocess.Popen(command, stdout=stream, stderr=subprocess.STDOUT, start_new_session=True)
        try:
            deadline = time.monotonic() + timeout
            while True:
                try:
                    code = process.wait(timeout=min(1, max(0.01, deadline - time.monotonic())))
                    break
                except subprocess.TimeoutExpired:
                    if time.monotonic() >= deadline:
                        raise
                    if disk_limit and prior_bytes + tree_bytes(case) > disk_limit:
                        raise OSError("Output disk budget exceeded during child execution")
        except (subprocess.TimeoutExpired, KeyboardInterrupt, OSError):
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
            kill_owned_app(case)
            raise
        finally:
            kill_owned_app(case)
        if code:
            raise RuntimeError(f"Child exited {code}; see {Path(log).name}")


def aggregate(rows, output, expected=None, state="complete"):
    total = max(len(rows), expected or 0)
    columns = ["id", "status", "referenceSource", "diagnosticScore", "referencePages",
               "candidatePages", "wordPageAgreement", "uniqueTokenCoverage"]
    with (output / "aggregate.csv.tmp").open("w", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=columns)
        writer.writeheader()
        writer.writerows({k: ("'" + v if isinstance(v, str) and v.startswith(("=", "+", "-", "@", "\t", "\r", "\n")) else v)
                          for k, v in row.items()} for row in rows)
    (output / "aggregate.csv.tmp").replace(output / "aggregate.csv")
    scored = [r["diagnosticScore"] for r in rows if isinstance(r.get("diagnosticScore"), (int, float))]
    atomic_json(output / "aggregate.json", {
        "schema": SCHEMA, "total": total, "processed": len(rows),
        "pending": total - len(rows), "runState": state, "scored": len(scored),
        "statusCounts": {s: sum(r["status"] == s for r in rows) for s in sorted({r["status"] for r in rows})},
        "meanScoredDiagnostic": sum(scored) / len(scored) if scored else None,
        "conservativeAllCasesDiagnostic": sum(scored) / total if total else None,
        "note": "Exploratory diagnostic, not Office fidelity certification; missing scores contribute zero only to conservative index.",
        "documents": rows})


def row_summary(result):
    return {"id": result["id"], "status": result["status"],
            "referenceSource": result.get("referenceSource"),
            "diagnosticScore": result.get("diagnosticScore"),
            "referencePages": result.get("pageCounts", {}).get("reference"),
            "candidatePages": result.get("pageCounts", {}).get("candidate"),
            "wordPageAgreement": result.get("text", {}).get("agreement"),
            "uniqueTokenCoverage": result.get("text", {}).get("coverage")}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--executable", type=Path)
    parser.add_argument("--xvfb", type=Path)
    parser.add_argument("--playwright", type=Path)
    parser.add_argument("--node", default="node")
    parser.add_argument("--dpi", type=int, default=100, choices=range(50, 151), metavar="50..150")
    parser.add_argument("--max-pages", type=int, default=300)
    parser.add_argument("--timeout", type=int, default=240)
    parser.add_argument("--disk-gb", type=float, default=10)
    parser.add_argument("--font-mode", choices=("bundled-only", "system-allowed"), default="bundled-only")
    parser.add_argument("--compare-only", action="store_true", help="Manifest candidate PDF supplied externally; no desktop rendering")
    parser.add_argument("--worker-reference", type=Path, help=argparse.SUPPRESS)
    parser.add_argument("--worker-candidate", type=Path, help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.worker_reference:
        result = compare(public_path(args.worker_reference), public_path(args.worker_candidate), public_path(args.out), args.dpi, args.max_pages)
        atomic_json(args.out / "comparison.json", result)
        return 0
    if not args.manifest:
        parser.error("--manifest is required")
    if args.timeout < 1 or args.max_pages < 1 or args.disk_gb <= 0:
        parser.error("Limits must be positive")
    if not args.compare_only and not all((args.executable, args.xvfb, args.playwright)):
        parser.error("Rendering requires --executable, --xvfb and --playwright")
    output, manifest = args.out.resolve(), args.manifest.resolve()
    public_path(output); public_path(manifest)
    output.mkdir(parents=True, exist_ok=True)
    marker = output / ".eo-differential-output"
    if not marker.exists() and any(output.iterdir()):
        raise ValueError("Output must be empty or an existing differential run")
    marker.touch(exist_ok=True)
    resource_unit = os.environ.get("EO_FIDELITY_UNIT")
    resource_limits = None
    if resource_unit:
        limits = subprocess.run(["systemctl", "--user", "show", resource_unit,
                                 "-p", "CPUQuotaPerSecUSec", "-p", "MemoryMax",
                                 "-p", "MemorySwapMax", "-p", "TasksMax", "-p", "KillMode"],
                                capture_output=True, text=True, check=True)
        resource_limits = dict(line.split("=", 1) for line in limits.stdout.splitlines() if "=" in line)
        expected = {"CPUQuotaPerSecUSec": "2s", "MemoryMax": "4294967296",
                    "MemorySwapMax": "0", "TasksMax": "256", "KillMode": "control-group"}
        if resource_limits != expected:
            raise ValueError("Required resource limits are not active")
    if not args.compare_only and resource_limits is None:
        raise ValueError("Desktop batches must use run-differential.sh for resource caps")
    atomic_json(output / "resource-limits.json", {"unit": resource_unit, "limits": resource_limits})
    aggregate([], output, state="initializing")
    manifest_sha = sha256(manifest)
    planned = set()
    with manifest.open() as stream:
        for raw in stream:
            if not raw.strip():
                continue
            source = json.loads(raw)
            key = source.get("id", "")
            if not isinstance(key, str) or not re_id(key) or key in planned:
                raise ValueError("IDs must be unique safe ASCII filenames, maximum 96 characters")
            planned.add(key)
    expected = len(planned)
    if not expected:
        raise ValueError("Manifest contains no cases")
    atomic_json(output / "manifest-identity.json", {"sha256": manifest_sha, "expected": expected})
    aggregate([], output, expected, "running")
    own_sources = [HERE / name for name in ("differential.py", "differential-batch.py", "render-desktop.cjs")]
    own_sources += [HERE.parent.parent / "tests/desktop" / name for name in ("harness.cjs", "document-pages.cjs", "observe-browser.cjs")]
    identity = {"tools": {p.name: sha256(p) for p in own_sources},
                "python": sys.version, "dpi": args.dpi, "maxPages": args.max_pages,
                "mode": "compare-only" if args.compare_only else "desktop", "fontMode": args.font_mode}
    for name in ("executable", "xvfb"):
        value = getattr(args, name)
        if value:
            identity[name] = sha256(value)
    if args.executable:
        resources = args.executable.resolve().parent / "resources"
        identity["appAsar"] = sha256(resources / "app.asar")
        resource_files = {str(p.relative_to(resources)): sha256(p)
                          for p in sorted(resources.rglob("*")) if p.is_file()}
        identity["packageResources"] = hashlib.sha256(
            json.dumps(resource_files, sort_keys=True).encode()).hexdigest()
        atomic_json(output / "package-resources.json", resource_files)
    identity["pdfBackend"] = subprocess.run(["pdftoppm", "-v"], capture_output=True, text=True, check=True).stderr.strip()
    import importlib.metadata
    identity["libraries"] = {name: importlib.metadata.version(name) for name in ("pdfminer.six", "pypdf", "Pillow")}
    if args.font_mode == "system-allowed" and not args.compare_only:
        listing = subprocess.run(["fc-list", "--format=%{file}\\n"],
                                 capture_output=True, text=True, check=True, timeout=30)
        paths = sorted({str(Path(line).resolve()) for line in listing.stdout.splitlines() if line})
        inventory = hashlib.sha256()
        for name in paths:
            inventory.update(name.encode()); inventory.update(sha256(name).encode())
        identity["systemFontInventorySHA256"] = inventory.hexdigest()
        identity["systemFontFiles"] = len(paths)
    rows, seen = [], set()
    with manifest.open() as stream:
        for raw in stream:
            if not raw.strip():
                continue
            source = json.loads(raw)
            case_id = source.get("id", "")
            if not isinstance(case_id, str) or not re_id(case_id) or case_id in seen:
                raise ValueError("IDs must be unique safe ASCII filenames, maximum 96 characters")
            seen.add(case_id)
            case = output / case_id
            if case.is_symlink():
                raise ValueError("Case output must not be a symlink")
            case.mkdir(exist_ok=True)
            started = time.monotonic()
            result = {"schema": SCHEMA, "id": case_id, "referenceSource": source.get("reference_source", "unspecified")}
            try:
                if tree_bytes(output) >= args.disk_gb * 1024 ** 3:
                    raise RuntimeError("Output disk budget exceeded")
                def file_field(name):
                    if not source.get(name):
                        return None
                    value = public_path(manifest.parent / source[name])
                    return value if value.is_file() else None
                input_path = file_field("input")
                reference = file_field("reference")
                candidate = file_field("candidate") if args.compare_only else None
                fingerprints = {**identity, "entry": source}
                for key, value in (("input", input_path), ("reference", reference), ("candidate", candidate)):
                    fingerprints[key] = sha256(value) if value else None
                fingerprint = hashlib.sha256(json.dumps(fingerprints, sort_keys=True).encode()).hexdigest()
                old = case / "result.json"
                if old.exists():
                    try:
                        previous = json.loads(old.read_text())
                    except (ValueError, OSError):
                        previous = {}
                    if (previous.get("fingerprint") == fingerprint and previous["status"] == "compared"
                            and (case / "index.html").is_file()
                            and sha256(case / "index.html") == previous.get("htmlSHA256")
                            and previous.get("artifacts")
                            and all(not Path(name).is_absolute() and ".." not in Path(name).parts
                                    and (case / name).is_file() and sha256(case / name) == digest
                                    for name, digest in previous["artifacts"].items())):
                        rows.append(row_summary(previous)); aggregate(rows, output, expected, "running")
                        continue
                result.update({"fingerprint": fingerprint, "provenance": fingerprints})
                prior_bytes = tree_bytes(output) - tree_bytes(case)
                disk_limit = args.disk_gb * 1024 ** 3
                if not input_path:
                    result["status"] = "missing-input"
                elif input_path.suffix.lower() not in SUPPORTED:
                    result["status"] = "unsupported-format"
                elif not reference:
                    result["status"] = "missing-reference"
                else:
                    if not args.compare_only:
                        render = case / "render"
                        render.mkdir(exist_ok=True)
                        bounded([args.node, str(HERE / "render-desktop.cjs"), str(input_path),
                                 str(args.executable.resolve()), str(render), str(args.xvfb.resolve()),
                                 str(args.playwright.resolve()), args.font_mode], case / "render.log", args.timeout, case, disk_limit, prior_bytes)
                        candidate = render / "candidate.pdf"
                    if not candidate:
                        result["status"] = "missing-candidate"
                    else:
                        bounded([sys.executable, str(HERE / "differential-batch.py"),
                                 "--worker-reference", str(reference), "--worker-candidate", str(candidate),
                                 "--out", str(case), "--dpi", str(args.dpi), "--max-pages", str(args.max_pages)],
                                case / "compare.log", args.timeout, case, disk_limit, prior_bytes)
                        result.update(json.loads((case / "comparison.json").read_text()))
                        result["id"], result["referenceSource"] = case_id, source.get("reference_source", "unspecified")
                for key, value in (("input", input_path), ("reference", reference)):
                    if value and sha256(value) != fingerprints[key]:
                        raise RuntimeError(f"Immutable {key} changed during comparison")
            except subprocess.TimeoutExpired:
                result.update({"status": "timeout", "diagnosticScore": None})
            except Exception as error:
                result.update({"status": "failed", "error": str(error), "diagnosticScore": None})
            result["seconds"] = round(time.monotonic() - started, 3)
            if result["status"] == "compared":
                artifacts = [case / "comparison.json", case / "glyphs.json.gz"]
                artifacts += list(case.glob("*.png"))
                if not args.compare_only:
                    artifacts += [case / "render/candidate.pdf", case / "render/render.json"]
                result["artifacts"] = {str(p.relative_to(case)): sha256(p) for p in artifacts}
            write_html(result, case / "index.html")
            result["htmlSHA256"] = sha256(case / "index.html")
            atomic_json(case / "result.json", result)
            rows.append(row_summary(result)); aggregate(rows, output, expected, "running")
            print(case_id, result["status"], flush=True)
    if sha256(manifest) != manifest_sha:
        aggregate(rows, output, expected, "manifest-changed")
        return 2
    aggregate(rows, output, expected, "complete")
    return 2 if any(r["status"] != "compared" for r in rows) else 0


def re_id(value):
    import re
    return bool(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,95}", value))


if __name__ == "__main__":
    raise SystemExit(main())
