#!/usr/bin/env bash
# ADV360_CMD of tools/gui-shot.sh: logs every verb the GUI runs, and answers
# `vdrive status` from $ADV360_SHOT_OUT/status.json when a script step put one there,
# since --source can never produce an ejected or corrupt-suspected drive.
set -euo pipefail

out="${ADV360_SHOT_OUT:?gui-cli.sh runs under tools/gui-shot.sh}"
printf '%s\n' "$*" >>"$out/calls.log"

if [ "${1:-}" = vdrive ] && [ "${2:-}" = status ] && [ -f "$out/status.json" ]; then
  cat "$out/status.json"
  exit 0
fi

exec bun "$(dirname "$0")/../src/main.ts" "$@"
