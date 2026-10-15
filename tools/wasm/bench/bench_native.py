#!/usr/bin/env python3
"""Benchmark the native x2t: office -> editor format -> office, per file.

usage: bench_native.py X2T CORPUS_DIR OUT_DIR [RUNS]
Writes OUT_DIR/native.csv: file,step,run,ms,maxrss_kb,rc,out_bytes
"""
import csv, os, sys, time, tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from params import FMT, CANVAS, BACK, task_xml

x2t, corpus, out = sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3])
runs = int(sys.argv[4]) if len(sys.argv) > 4 else 3
bindir = os.path.dirname(x2t)
fonts_js = os.environ.get("X2T_ALLFONTS", os.path.join(bindir, "AllFonts.js"))
out.mkdir(parents=True, exist_ok=True)


def run(src, dst, fmt):
    tmp = tempfile.mkdtemp(dir=out)
    xml = os.path.join(tmp, "task.xml")
    Path(xml).write_text(task_xml(src, dst, fmt, fonts_js=fonts_js, temp_dir=tmp))
    t0 = time.perf_counter()
    pid = os.fork()
    if pid == 0:
        fd = os.open(os.devnull, os.O_WRONLY); os.dup2(fd, 1); os.dup2(fd, 2)
        os.execv(x2t, [x2t, xml])
    _, status, ru = os.wait4(pid, 0)
    ms = (time.perf_counter() - t0) * 1000
    return ms, ru.ru_maxrss, (os.WEXITSTATUS(status) if os.WIFEXITED(status) else -os.WTERMSIG(status))


files = sorted(p for p in corpus.rglob("*") if p.suffix.lstrip(".") in CANVAS)
with open(out / "native.csv", "w", newline="") as fh:
    w = csv.writer(fh)
    w.writerow(["file", "step", "run", "ms", "maxrss_kb", "rc", "out_bytes"])
    for f in files:
        ext = f.suffix.lstrip(".")
        canvas = CANVAS[ext]
        stem = f.relative_to(corpus).as_posix().replace("/", "__")
        for r in range(runs):
            d = out / "native" / stem
            d.mkdir(parents=True, exist_ok=True)
            binf = str(d / "Editor.bin")
            ms, rss, rc = run(str(f), binf, FMT[canvas])
            w.writerow([stem, f"{ext}->{canvas}", r, f"{ms:.1f}", rss, rc, os.path.getsize(binf) if os.path.exists(binf) else 0])
            back = str(d / f"back.{BACK[canvas]}")
            ms, rss, rc = run(binf, back, FMT[BACK[canvas]])
            w.writerow([stem, f"{canvas}->{BACK[canvas]}", r, f"{ms:.1f}", rss, rc, os.path.getsize(back) if os.path.exists(back) else 0])
        fh.flush()
print("wrote", out / "native.csv")
