#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-only
# Linux-only unattended runner; fail closed if resource delegation is unavailable.
set -eu
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
unit="eo-fidelity-A-$(date +%s)-$$"
exec systemd-run --user --quiet --wait --pipe --collect --unit="$unit" \
  -p CPUQuota=200% -p MemoryMax=4G -p MemorySwapMax=0 -p TasksMax=256 \
  -p RuntimeMaxSec=10800 -p KillMode=control-group \
  --setenv="EO_FIDELITY_UNIT=$unit.service" --setenv="PATH=$PATH" --setenv="PYTHONPATH=$(printenv PYTHONPATH || true)" \
  python3 "$here/differential-batch.py" "$@"
