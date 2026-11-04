#!/usr/bin/env bash
# An inline oxlint or eslint disable directive carries its reason on the same
# line, after ` -- `. The vendored anti-slop pack is upstream code.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

status=0
directives=$(git grep --untracked -nE '(oxlint|eslint)-disable' \
  -- '*.ts' '*.mjs' ':!tools/oxlint/anti-slop/**') || status=$?
if [ "$status" -gt 1 ]; then
  exit "$status"
fi

hits=$(grep -vE '(oxlint|eslint)-disable[-a-z]*( [^ ]+)* -- [^ ]' <<<"$directives" || true)

if [ -n "$hits" ]; then
  echo "lint disable without ' -- <reason>':"
  echo "$hits"
  exit 1
fi
