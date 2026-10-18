#!/bin/sh
# SPDX-License-Identifier: MIT
# Installs the primaries pack into a throwaway HOME from a marketplace source (a path
# such as ./ or a GitHub owner/repo) and checks that the pack and all three mods are
# installed and enabled, then adds the gate-meter add-on next to it and checks that it
# installs on its own while the pack still pulls in only its three mods.
set -e
source=${1:-./}
home=$(mktemp -d)
trap 'rm -rf "$home"' EXIT
export HOME="$home"
unset CLAUDE_CODE_PLUGIN_DIRS
claude plugin marketplace add "$source"
claude plugin install primaries@chalkery
claude plugin list --json > "$home/pack.json"
claude plugin install gate-meter@chalkery
claude plugin list --json > "$home/installed.json"
python3 - "$home/pack.json" "$home/installed.json" <<'PY'
import json, sys

pack = {p["id"] for p in json.load(open(sys.argv[1]))}
if "gate-meter@chalkery" in pack:
    sys.exit("the pack installed gate-meter, but it is an add-on")
installed = {p["id"]: p for p in json.load(open(sys.argv[2]))}
missing = []
for name in ("primaries", "handoff-relay", "cache-meter", "next-steps", "gate-meter"):
    plugin = installed.get(f"{name}@chalkery")
    if plugin and plugin.get("enabled"):
        print(f"{name}@chalkery {plugin['version']} enabled")
    else:
        missing.append(name)
if missing:
    sys.exit("not installed or not enabled: " + ", ".join(missing))
PY
