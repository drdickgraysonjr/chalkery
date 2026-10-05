#!/bin/sh
# SPDX-License-Identifier: MIT
# Runs every check CI runs, with the claude on PATH. Each check runs even when an
# earlier one failed; the summary at the end lists the failures.
cd "$(dirname "$0")/.."
failed=""

check() {
  name=$1
  shift
  echo "== $name"
  if "$@"; then
    echo "ok: $name"
  else
    echo "FAILED: $name"
    failed="$failed
  - $name"
  fi
}

validate_all() {
  claude plugin validate --strict . || return 1
  for dir in plugins/*/; do
    claude plugin validate --strict "$dir" || return 1
  done
}

test_mods() {
  status=0
  for mod in handoff-relay cache-meter next-steps; do
    claude plugin test "plugins/$mod" || status=1
  done
  return $status
}

check "manifests are valid" validate_all
check "mod tests pass" test_mods
check "handoff phase script tests pass" python3 -m unittest plugins/handoff-relay/skills/handoff/scripts/test_phase.py
check "shared files match their copies" scripts/sync-shared.sh --check
check "changed mods have a new version" scripts/check-version-bump.sh
check "the catalog points at the latest releases" scripts/pin-releases.sh --check
check "primaries installs from this checkout's catalog" scripts/trial-install.sh ./

if [ -n "$failed" ]; then
  echo "Failed checks:$failed"
  exit 1
fi
echo "All checks passed."
