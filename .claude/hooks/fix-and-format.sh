#!/usr/bin/env bash
# Fixers only, after each agent edit and on staged files at commit: a finding no
# autofix removes waits for `bun run check`, mid-edit code is often incomplete.
# Unused imports go at commit only: mid-edit, an import precedes its first use.
# oxfmt runs last because an oxlint fix emits code it reformats.
set -euo pipefail

cd "$(dirname "$0")/../.."

commit=0
if [ "${1:-}" = "--commit" ]; then
  commit=1
  shift
fi

files=()
code=()
for f in "$@"; do
  case "$f" in
    "$PWD"/* | [!/]*) ;;
    *) continue ;;
  esac
  [ -f "$f" ] || continue
  files+=("$f")
  case "$f" in
    *.ts | *.mts | *.cts | *.js | *.mjs | *.cjs) code+=("$f") ;;
  esac
done

[ ${#files[@]} -gt 0 ] || exit 0

if [ ${#code[@]} -gt 0 ]; then
  if [ "$commit" = 1 ]; then
    bunx oxlint -c .claude/hooks/unused-imports.json \
      --ignore-pattern 'tools/oxlint/anti-slop/**' --fix --silent "${code[@]}" || true
  fi
  # One oxlint run applies one round of fixes; a fix often unlocks another
  # (a split type import, then its duplicate import).
  for _ in 1 2; do
    bunx oxlint -c oxlint.config.ts --fix --silent "${code[@]}" || true
  done
fi

if ! out=$(bunx oxfmt --no-error-on-unmatched-pattern "${files[@]}" 2>&1); then
  echo "$out" >&2
  exit 2
fi
