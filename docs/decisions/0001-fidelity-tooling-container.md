# ADR 0001: fidelity harness tooling in a container

Date: 2026-10-05. Status: accepted (can be revisited by the owner).

## Context

The fidelity harness (`tools/fidelity/`) must rasterize PDFs and compare images
(SSIM, normalized correlation, morphological filters). <build-host> runs Ubuntu 20.04 / Python 3.8,
without sudo; results must be reproducible from one machine and date to another
(the poppler version changes page rendering, hence the scores).

## Options

1. Python packages via `pip install --user` on the host + the host's poppler: versions depend on
   the machine, Python 3.8 is end of life.
2. Implement SSIM and block search by hand in numpy: fewer dependencies, more
   code to maintain and validate.
3. Dedicated Docker image `eo-fidelity-tools` (base `python:3.12-slim-bookworm` pinned by digest,
   Debian `poppler-utils`, numpy, scipy, scikit-image, opencv-python-headless, Pillow pinned).

## Choice

Option 3. The dependencies are heavy (~400 MB) but confined to the tools image, never in the
product image. The image tag is the fingerprint of the Dockerfile and `requirements.txt`; it is
recorded in every `results.json`. LibreOffice, used only as a replacement
reference, has its own image (`Dockerfile.libreoffice`, pinned Debian trixie).
