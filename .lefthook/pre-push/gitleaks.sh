#!/usr/bin/env bash
# Scans the commits each pushed ref brings that no remote-tracking ref holds.
# Git passes one line per ref: <local ref> <local oid> <remote ref> <remote oid>;
# a deletion carries the null oid and pushes nothing to scan.
set -euo pipefail

while read -r _ local_oid _ _; do
  if [[ "$local_oid" =~ ^0+$ ]]; then
    continue
  fi
  gitleaks git --no-banner --redact --log-opts="$local_oid --not --remotes" .
done
