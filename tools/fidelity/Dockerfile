# Tooling image for the layout-fidelity harness: poppler (pdftoppm, pdfinfo,
# pdftotext, pdffonts) + the Python image-comparison stack.
# The harness code itself is NOT baked in: run.sh mounts tools/fidelity/ at /app.
# Base pinned by digest for reproducible rasterisation (poppler version matters).
FROM python:3.12-slim-bookworm@sha256:54c85f3c47607a77f32adec749d3c81d1348bf25833671f512b26a9b6d778cb3

RUN apt-get update \
 && apt-get install -y --no-install-recommends poppler-utils \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
