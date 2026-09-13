#!/usr/bin/env bash
# The import direction between src/ folders: model → io → app → cli → main.ts.
# A folder may import the ones below it, never the ones above.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

fail=0

forbid() {
  local dir=$1 pattern=$2
  local hits
  hits=$(grep -rlE "from \"(\.\./)+($pattern)/" "src/$dir" || true)
  if [ -n "$hits" ]; then
    echo "src/$dir must not import $pattern:"
    echo "$hits"
    fail=1
  fi
}

forbid model "app|io|cli"
forbid io "app|cli"
forbid app "cli"

if grep -rl 'from "\(\.\./\)*\(\./\)\?main\.ts"' src --include='*.ts' | grep -v 'src/main\.test\.ts\|src/testkit\.ts'; then
  echo "only main.test.ts and testkit.ts may import main.ts"
  fail=1
fi

exit "$fail"
