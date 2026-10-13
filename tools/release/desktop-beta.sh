#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
set -euo pipefail
exec python3 "$(cd "$(dirname "$0")" && pwd)/desktop_beta.py" "$@"
