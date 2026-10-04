#!/bin/sh
# Копіює спільні файли (shared/*.mjs) у hooks/ кожного мода, бо мод ставлять і окремо.
# З --check лише перевіряє, що копії однакові з shared/.
set -e
cd "$(dirname "$0")/.."
status=0
for mod in handoff-relay cache-meter next-steps; do
  for file in shared/*.mjs; do
    target="plugins/$mod/hooks/$(basename "$file")"
    if [ "$1" = "--check" ]; then
      cmp -s "$file" "$target" || { echo "відрізняється: $target"; status=1; }
    else
      cp "$file" "$target"
    fi
  done
done
exit $status
