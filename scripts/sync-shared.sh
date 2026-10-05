#!/bin/sh
# SPDX-License-Identifier: MIT
# Copies the shared files (shared/*.mjs) into every mod's hooks/, since a mod is also
# installed alone. With --check it only checks that the copies match shared/.
set -e
cd "$(dirname "$0")/.."
status=0
for mod in handoff-relay cache-meter next-steps; do
  for file in shared/*.mjs; do
    target="plugins/$mod/hooks/$(basename "$file")"
    if [ "$1" = "--check" ]; then
      cmp -s "$file" "$target" || { echo "differs: $target"; status=1; }
    else
      cp "$file" "$target"
    fi
  done
done
exit $status
