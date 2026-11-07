#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
set -euo pipefail
export PYTHONDONTWRITEBYTECODE=1
export EO_TEMP_LOCATION_CHECK=0 # test launches keep saving in place under /tmp
exec python3 "$(cd "$(dirname "$0")" && pwd)/desktop_beta.py" "$@"
