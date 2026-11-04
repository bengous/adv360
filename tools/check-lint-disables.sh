#!/usr/bin/env bash
# An inline oxlint or eslint disable directive carries its reason on the same
# line, after ` -- `. The vendored anti-slop pack is upstream code.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

hits=$(git grep -nE '(oxlint|eslint)-disable' -- '*.ts' '*.mjs' ':!tools/oxlint/anti-slop/**' \
  | grep -vE '(oxlint|eslint)-disable[-a-z]*( [^ ]+)* -- [^ ]' || true)

if [ -n "$hits" ]; then
  echo "lint disable without ' -- <reason>':"
  echo "$hits"
  exit 1
fi
