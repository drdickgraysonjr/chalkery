#!/bin/sh
# SPDX-License-Identifier: MIT
# Fails when a mod changed since its last release tag but its version did not go up.
# Release tags are <mod>--v<version>, the form `claude plugin tag` creates and plugin
# dependencies resolve against. A mod without a release tag yet is skipped.
cd "$(dirname "$0")/.."
status=0
for dir in plugins/*/; do
  mod=$(basename "$dir")
  tag=$(git tag --list "$mod--v*" --sort=-v:refname | head -n 1)
  [ -n "$tag" ] || continue
  git diff --quiet "$tag" -- "$dir" && continue
  released=${tag#"$mod--v"}
  manifest="${dir}.claude-plugin/plugin.json"
  current=$(python3 -c 'import json, sys; print(json.load(open(sys.argv[1]))["version"])' "$manifest")
  highest=$(printf '%s\n%s\n' "$released" "$current" | sort -V | tail -n 1)
  if [ "$current" = "$released" ] || [ "$highest" != "$current" ]; then
    echo "$mod changed since $tag, but its version is $current: raise it in $manifest"
    status=1
  fi
done
exit $status
