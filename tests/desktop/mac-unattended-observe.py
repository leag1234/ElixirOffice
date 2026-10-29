#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Observe one owned harness without killing processes or changing its assertions."""
import argparse
import datetime
import json
import os
import re
from pathlib import Path
import signal
import subprocess
import sys
import time

def snapshot(root):
    # Numeric fields only. Keep only descendants; never record other processes.
    result = subprocess.run(["/bin/ps", "-axo", "pid=,ppid=,rss=,lstart="],
                            capture_output=True, text=True, timeout=3)
    if result.returncode:
        return {"available": False}
    rows = {}
    for line in result.stdout.splitlines():
        fields = line.split(maxsplit=3)
        if len(fields) == 4 and all(part.isdigit() for part in fields[:3]):
            pid, parent, rss = map(int, fields[:3])
            rows[pid] = (parent, rss, fields[3])
    owned = {root}
    while True:
        more = {pid for pid, (parent, _, _) in rows.items() if parent in owned}
        if more <= owned:
            break
        owned |= more
    processes = [{"pid": pid, "ppid": rows[pid][0], "rssKiB": rows[pid][1], "startIdentity": rows[pid][2]}
                 for pid in sorted(owned) if pid in rows]
    return {"available": True, "processes": processes,
            "totalRSSKiB": sum(row["rssKiB"] for row in processes)}

def parse_vm_stat(text):
    page = re.search(r"page size of ([0-9]+) bytes", text)
    counters = {}
    allowed = {"Pages free", "Pages active", "Pages inactive", "Pages wired down",
               "Pages occupied by compressor", "Compressions", "Decompressions",
               "Swapins", "Swapouts"}
    for line in text.splitlines():
        key, separator, value = line.partition(":")
        if separator and key in allowed and value.strip().rstrip(".").isdigit():
            counters[key] = int(value.strip().rstrip("."))
    return {"available": bool(page and counters),
            "pageSizeBytes": int(page[1]) if page else None, "counters": counters}

def memory_pressure():
    if sys.platform != "darwin":
        return {"available": False, "reason": "darwin-only"}
    try:
        result = subprocess.run(["/usr/bin/vm_stat"], capture_output=True, text=True, timeout=3)
        return parse_vm_stat(result.stdout) if result.returncode == 0 else {"available": False}
    except (OSError, subprocess.TimeoutExpired):
        return {"available": False}

def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--results", required=True, type=Path)
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args(argv)
    command = args.command[1:] if args.command[:1] == ["--"] else args.command
    if not command or not args.results.is_absolute():
        parser.error("Use an absolute new results directory and a command after --")
    # Exclusive directory: never overwrite a prior diagnosis or follow output links.
    args.results.mkdir(mode=0o700)
    record = {"start": datetime.datetime.now().astimezone().isoformat(),
              "platform": sys.platform, "observerPID": os.getpid(),
              "peakTotalRSSKiB": 0, "samples": 0,
              "signalSource": "unverified", "changesDeadlines": False}
    env = {**os.environ, "EO_MAC_UNATTENDED_TRACE": str(args.results / "phases.jsonl"),
           "PYTHONDONTWRITEBYTECODE": "1"}
    child = subprocess.Popen(command, env=env)
    record["childPID"] = child.pid
    with (args.results / "samples.jsonl").open("x") as output:
        while True:
            try:
                sample = snapshot(child.pid)
            except (OSError, subprocess.TimeoutExpired):
                sample = {"available": False}
            sample["epoch"] = time.time()
            if record["samples"] % 10 == 0:
                sample["memoryCounters"] = memory_pressure()
            output.write(json.dumps(sample) + "\n")
            output.flush()
            record["samples"] += 1
            record["peakTotalRSSKiB"] = max(record["peakTotalRSSKiB"], sample.get("totalRSSKiB", 0))
            result = child.poll()
            if result is not None:
                break
            time.sleep(1)
    record.update(returncode=result, signal=(-result if result < 0 else None),
                  signalName=(signal.Signals(-result).name if result < 0 else None),
                  end=datetime.datetime.now().astimezone().isoformat())
    # A shell exit 137 does not prove that its direct child received SIGKILL.
    record["shellStyle137"] = result == 137
    (args.results / "receipt.json").write_text(json.dumps(record, indent=2) + "\n")
    return 128 - result if result < 0 else result

if __name__ == "__main__":
    sys.exit(main())
