#!/bin/sh
# Копіює shared/band.mjs у кожен мод, що малює смугу. З --check лише перевіряє, що копії однакові.
set -e
cd "$(dirname "$0")/.."
status=0
for mod in handoff-relay cache-meter next-steps; do
  target="plugins/$mod/hooks/band.mjs"
  if [ "$1" = "--check" ]; then
    cmp -s shared/band.mjs "$target" || { echo "відрізняється: $target"; status=1; }
  else
    cp shared/band.mjs "$target"
  fi
done
exit $status
