#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Synthetic Linux tests only; never launches the desktop app or accesses a Mac."""
import json
import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
OBSERVER = ROOT / "tests/desktop/mac-unattended-observe.py"
TRACE = ROOT / "tests/desktop/mac-unattended-trace.cjs"

spec=importlib.util.spec_from_file_location("observe", OBSERVER)
observe=importlib.util.module_from_spec(spec)
spec.loader.exec_module(observe)

class ObserverTests(unittest.TestCase):
    def test_aggregate_counter_parser_and_no_false_availability(self):
        value=observe.parse_vm_stat("Mach Virtual Memory Statistics: (page size of 16384 bytes)\nPages free: 42.\nSwapouts: 3.\nprivate-label: ignored\n")
        self.assertTrue(value["available"])
        self.assertEqual(value["pageSizeBytes"],16384)
        self.assertEqual(value["counters"],{"Pages free":42,"Swapouts":3})
        self.assertFalse(observe.parse_vm_stat("unexpected output")["available"])

    def test_own_snapshot_records_start_identity(self):
        value=observe.snapshot(os.getpid())
        own=[row for row in value["processes"] if row["pid"]==os.getpid()]
        self.assertEqual(len(own),1)
        self.assertTrue(own[0]["startIdentity"])

    def observe(self, command):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        output = Path(temporary.name) / "observation"
        result = subprocess.run([sys.executable, "-B", str(OBSERVER),
                                 "--results", str(output), "--", *command],
                                capture_output=True, text=True, timeout=15)
        return result, output, json.loads((output / "receipt.json").read_text())

    def test_direct_sigkill_is_measured_not_inferred_from_shell_status(self):
        result, output, receipt = self.observe([sys.executable, "-c",
            "import os,signal; os.kill(os.getpid(),signal.SIGKILL)"])
        self.assertEqual(result.returncode, 137)
        self.assertEqual(receipt["returncode"], -9)
        self.assertEqual(receipt["signalName"], "SIGKILL")
        self.assertFalse(receipt["shellStyle137"])
        self.assertEqual(receipt["signalSource"], "unverified")

    def test_shell_137_does_not_claim_a_signal(self):
        result, output, receipt = self.observe(["/bin/bash", "-c", "exit 137"])
        self.assertEqual(result.returncode, 137)
        self.assertEqual(receipt["returncode"], 137)
        self.assertIsNone(receipt["signal"])
        self.assertTrue(receipt["shellStyle137"])

    def test_node_phase_trace_is_private_numeric_and_exclusive(self):
        command = ["node", "-e",
                   "const t=require(process.argv[1]).createTrace();"
                   "t.phase('synthetic-import'); t.close();", str(TRACE)]
        result, output, receipt = self.observe(command)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(receipt["returncode"], 0)
        rows = [json.loads(line) for line in (output / "phases.jsonl").read_text().splitlines()]
        self.assertEqual([row["event"] for row in rows],
                         ["trace-open", "synthetic-import", "trace-close"])
        self.assertTrue(all(row["rssBytes"] > 0 for row in rows))
        self.assertTrue(all("argv" not in row and "document" not in row for row in rows))
        self.assertEqual((output.stat().st_mode & 0o777), 0o700)
        self.assertEqual(((output / "phases.jsonl").stat().st_mode & 0o777), 0o600)
        prior = (output / "phases.jsonl").read_bytes()
        refused = subprocess.run(command, env={**os.environ,
            "EO_MAC_UNATTENDED_TRACE": str(output / "phases.jsonl")},
            capture_output=True, text=True)
        self.assertNotEqual(refused.returncode, 0)
        self.assertEqual((output / "phases.jsonl").read_bytes(), prior)

    def test_disabled_trace_does_not_create_files(self):
        with tempfile.TemporaryDirectory() as folder:
            result = subprocess.run(["node", "-e",
                "const t=require(process.argv[1]).createTrace();t.phase('noop');t.close();",
                str(TRACE)], cwd=folder,
                env={key:value for key,value in os.environ.items() if key!="EO_MAC_UNATTENDED_TRACE"},
                capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stderr)
            self.assertEqual(list(Path(folder).iterdir()),[])

if __name__ == "__main__":
    unittest.main()
