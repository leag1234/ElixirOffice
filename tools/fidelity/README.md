# Layout fidelity harness (.docx)

Measures, page by page, the gap between the ElixirOffice rendering of a .docx (PDF export by the
DocumentServer) and a reference rendering (Word for the web, Word desktop…). Serves as a
baseline and as a guard against regressions. Metric proposal: `docs/fidelity.md`.

## Single command

```sh
tools/fidelity/run.sh [--ref word-web] [--image elixiroffice/documentserver:latest]
```

Options:

| Option | Default | Role |
|---|---|---|
| `--ref SOURCE` | `word-web` | reference source: `word-web`, `word-desktop` (or any name), `libreoffice` (stand-in, **not a fidelity reference**), `self` (second ElixirOffice conversion: determinism check) |
| `--image IMAGE` | `elixiroffice/documentserver:latest` | DocumentServer image to measure; must exist locally (never pulled) |
| `--corpus DIR` | `/srv/elixiroffice/corpus-provisional` | corpus (`manifest.csv`: columns `id`, `file`) |
| `--refs-dir DIR` | `$FIDELITY_HOME/refs/<ref>` | reference PDFs (`<id>.pdf` + `SOURCE.json`) taken from somewhere other than under `refs/` |
| `--runs-dir DIR` | `$FIDELITY_HOME/runs` | runs directory (and of the `latest-<ref>` link) |
| `--baselines-dir DIR` | `$FIDELITY_HOME/baselines` | target of `--save-baseline` |
| `--ids t01,a07` | all | subset of documents |
| `--baseline FILE` | – | previous `results.json`; exit code 1 if a document score drops beyond the tolerance |
| `--save-baseline` | – | copies `results.json` to `baselines/<ref>.json` |
| `--dpi N` | 120 | rasterization resolution (fixed: changing the dpi makes runs incomparable) |
| `--port N` | 8095 | local port (127.0.0.1) of the `eo-fidelity` container |
| `--workers N` | 4 | simultaneous conversions |
| `--keep-going` | – | continue despite conversion failures (the exit code stays 2) |
| `--refresh-refs` | – | regenerate the LibreOffice references |
| `--stop-server` | – | stop `eo-fidelity` at the end of the run (by default it stays running) |

Variables: `FIDELITY_HOME` (default `/srv/elixiroffice/fidelity`), `FIDELITY_CORPUS`.

Exit codes: 0 OK; 1 regression with respect to `--baseline`; 2 conversion failure;
3 run not comparable with the baseline (different reference source or parameters).

## What `run.sh` does

1. Builds if needed the tools image `eo-fidelity-tools:<hash>` (poppler + numpy, scipy,
   scikit-image, OpenCV, Pillow; base pinned by digest) with the `default` buildx builder.
2. Creates the JWT secret (`$FIDELITY_HOME/secrets/jwt_secret`, mode 600) and launches the container
   `eo-fidelity` (JWT enabled, `ALLOW_PRIVATE_IP_ADDRESS=true` so that it can download the
   corpus on the Docker network `eo-fidelity-net`, port published on 127.0.0.1 only). Waits for
   `/healthcheck`. A container already running with the same image is reused.
3. `convert.py` (in a tools container on the same network) serves the corpus over HTTP and
   calls `POST /converter` (JSON variant of `ConvertService.ashx`, HS256 token in the body and
   in `Authorization: Bearer`), `async:false`, one unique key per pass (the server caches
   conversions by key). Any error is displayed with its DocumentServer code
   (-3 conversion, -4 download, -8 token…) and fails the run.
4. References: `refs/<source>/<id>.pdf` (see below).
5. `compare.py`: rasterization `pdftoppm -r 120`, comparison, `results.json`, report
   `report/index.html`.

Outputs (outside git): `$FIDELITY_HOME/runs/<YYYYMMDD>T<HHMMSS>Z-<ref>/`

```
run.log  meta.json  results.json
ours/<id>.pdf  ours/convert.json        ElixirOffice rendering
ref-self/                               (--ref self only)
raster/{ref,ours}/<id>/p-N.png          pages at 120 dpi
report/index.html                       report (thumbnails report/thumbs, differences report/full)
```

`runs/latest-<ref>` points to the latest run of each source.

## Per-page measures

- **SSIM** (grayscale, Gaussian window σ = 1.5, constants of Wang et al.).
- **Tolerant pixel difference**: a pixel differs if its gray level deviates by more
  than 64 from all the pixels of the other image in a 3×3 neighborhood (absorbs anti-aliasing and
  a 1 px shift). Reported to the inked area (union of both sides): `diff_ink`.
- **Block shifts**: the reference page is cut into horizontal ink blocks
  (row projection, gaps < 1.7 mm merged, blocks > 50 mm re-cut); each block is
  searched by normalized correlation on a blurred image (σ ≈ 0.5 mm, to follow the
  position despite a different font) in the corresponding page, with a slight proximity prior
  (0.004 per mm) for repeated patterns. Statuses: `same` (|dy| ≤ 1 mm), `moved`
  (vertical shift reported in mm and px), `other-page` (not found here, found with a
  score ≥ 0.8 on a neighboring page i±2), `lost` (score < 0.5: different content). The
  horizontal shift is reported but does not count (too noisy in case of font
  substitution).
- **Text flow** (`pdftotext`): for each reference page, the share of its word trigrams
  found in our pages and the page where they are found: indicates which page the content
  went to when pagination diverges.
- Fonts actually embedded on each side (`pdffonts`), page sizes.

Missing or extra pages: counted as 0 pages in the three metrics.

## Checking regressions (CI)

```sh
tools/fidelity/run.sh --ref word-web --baseline $FIDELITY_HOME/baselines/word-web.json
# or, without rerunning:
docker run --rm -v $PWD/tools/fidelity:/app:ro -v $FIDELITY_HOME:/f eo-fidelity-tools:<hash> \
  python /app/compare.py --check /f/runs/latest-word-web/results.json --baseline /f/baselines/word-web.json
```

Per-document tolerances (options `--tol-mean-ssim`, `--tol-pct-pages-ok`, `--tol-penalty`):
mean SSIM 0.002; % pages OK 0; penalty score 0.5 point. The three metrics are
checked as long as the test user has not chosen one. A different reference source or different parameters
(dpi, thresholds) make the comparison impossible (code 3): we only compare what is
comparable.

## References

Pluggable directory: `$FIDELITY_HOME/refs/<source>/<id>.pdf`, where `<id>` is the `id` column
of `manifest.csv` (`t01.pdf`, `s04.pdf`, `a10.pdf`…), plus a `SOURCE.json` that documents the
provenance, copied into each run:

```json
{"source": "word-web", "label": "Word for the web (Microsoft 365), PDF export",
 "exported_by": "the test user", "exported_utc": "2026-10-06", "word_build": "…",
 "settings": "File > Export > PDF, revisions hidden (No Markup), fields not updated",
 "notes": "…"}
```

Planned sources: `word-web` (Word for the web, first target), `word-desktop`. Two
stand-ins to validate the chain without Word, **never presented as a fidelity measure**:

- `self`: second ElixirOffice conversion of the same corpus (determinism: SSIM = 1, pages
  identical to the pixel expected);
- `libreoffice`: headless LibreOffice 25.2 in a container (`Dockerfile.libreoffice`), generated
  automatically in `refs/libreoffice/`.

### Exporting the Word for the web references (to be done by the test user)

For each corpus file, from Word for the web (browser, Microsoft 365 account):

1. Upload the .docx **as is** (do not open it in Word desktop beforehand, do not accept any
   format conversion nor "Enable editing" which would modify the file).
2. Do **not** update the fields nor the table of contents.
3. Documents with revisions (a01, a04): choose the "No Markup" / final display
   before the export (ElixirOffice also exports without marks); comments hidden.
4. File > Download as PDF (or File > Export > PDF). Do not use the browser's "Print to PDF"
   (browser margins and scaling).
5. Save as `refs/word-web/<id>.pdf` (`t01.pdf`, not the original name), then write
   `refs/word-web/SOURCE.json` (date, Microsoft 365 account/edition, settings above, possible
   anomalies: file rejected, missing fonts reported by Word).

Then copy to build-host: `rsync -a refs/word-web/ build-host:/srv/elixiroffice/fidelity/refs/word-web/`
and run `tools/fidelity/run.sh --ref word-web --save-baseline`: this is the baseline (unmodified
upstream) never to degrade.

## Private corpus (real documents)

The real documents entrusted by the test user and everything derived from them (PDFs, rasterized pages, thumbnails, difference
maps, extracted text, reports) must **never** enter a git repository, a patch or a
versioned document, nor be sent to an outside service. They stay on build-host, in `chmod 700`:
`/srv/elixiroffice/corpus-private/` (sources, `docs/` with a private `manifest.csv` with
identifiers `r01`…, `refs/word-desktop/`) and `fidelity/runs-real/`. Only aggregated scores and
non-identifying descriptions go into versioned documents.

```sh
B=/srv/elixiroffice
tools/fidelity/run.sh --ref word-desktop --corpus $B/corpus-private/docs \
  --refs-dir $B/corpus-private/refs/word-desktop --runs-dir $B/fidelity/runs-real \
  --baselines-dir $B/fidelity/runs-real/baselines --keep-going \
  --baseline $B/fidelity/runs-real/baselines/word-desktop.json [--image ...]
chmod -R go-rwx $B/fidelity/runs-real
```

## Client-side PDF candidate

The PDF made in the browser (`docs/client-pdf.md`) is measured with the same comparison, the candidate
being the browser file and the reference the server's file for the same editor command:
`tools/client-pdf/bench.mjs <out> <corpus>` (Playwright, a running instance with the client PDF) writes
`<out>/client/<id>.pdf` and `<out>/server/<id>.pdf`, then `tools/client-pdf/gate.sh <out>` runs
`compare.py --ref-dir <out>/server --cand-dir <out>/client` and the text, font, size and privacy checks
(`gate.json`, exit 1 when the gate fails). Against Word, pass `<out>/client` as the candidate directory of
`compare.py` with the Word references.

## Known limits

- The LibreOffice and `self` references say nothing about fidelity to Word.
- The SSIM of a whole page is dominated by the white background: 0.95 can already hide a shifted
  text; hence metrics B and C.
- Block shifts: heuristic; repeated patterns (writing lines, identical table rows)
  can be matched to the wrong occurrence. Multi-column blocks are
  treated as a full-width band.
- The corpus is provisional (no real teacher worksheet): state it in every report.
