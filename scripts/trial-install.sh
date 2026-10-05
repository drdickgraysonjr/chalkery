#!/bin/sh
# SPDX-License-Identifier: MIT
# Installs the primaries pack into a throwaway HOME from a marketplace source (a path
# such as ./ or a GitHub owner/repo) and checks that the pack and all three mods are
# installed and enabled.
set -e
source=${1:-./}
home=$(mktemp -d)
trap 'rm -rf "$home"' EXIT
export HOME="$home"
unset CLAUDE_CODE_PLUGIN_DIRS
claude plugin marketplace add "$source"
claude plugin install primaries@chalkery
claude plugin list --json > "$home/installed.json"
python3 - "$home/installed.json" <<'PY'
import json, sys

installed = {p["id"]: p for p in json.load(open(sys.argv[1]))}
missing = []
for name in ("primaries", "handoff-relay", "cache-meter", "next-steps"):
    plugin = installed.get(f"{name}@chalkery")
    if plugin and plugin.get("enabled"):
        print(f"{name}@chalkery {plugin['version']} enabled")
    else:
        missing.append(name)
if missing:
    sys.exit("not installed or not enabled: " + ", ".join(missing))
PY
