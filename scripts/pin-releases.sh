#!/bin/sh
# SPDX-License-Identifier: MIT
# Points every entry of .claude-plugin/marketplace.json at its mod's latest release tag
# (<mod>--v<version>) and that tag's commit, so users install releases and never main.
# With --check it only checks that the entries already do.
set -e
cd "$(dirname "$0")/.."
git fetch --quiet --tags origin 2>/dev/null || true
python3 - "$@" <<'PY'
import json, subprocess, sys

MARKETPLACE = ".claude-plugin/marketplace.json"
URL = "https://github.com/drdickgraysonjr/chalkery.git"
check = "--check" in sys.argv[1:]


def git(*args):
    return subprocess.run(["git", *args], capture_output=True, text=True, check=True).stdout.strip()


with open(MARKETPLACE) as f:
    text = f.read()
marketplace = json.loads(text)
problems = []
for entry in marketplace["plugins"]:
    name = entry["name"]
    tags = git("tag", "--list", f"{name}--v*", "--sort=-v:refname").split()
    if not tags:
        problems.append(f"{name} has no release tag: run `claude plugin tag --push` in plugins/{name}")
        continue
    tag = tags[0]
    entry["source"] = {
        "source": "git-subdir",
        "url": URL,
        "path": f"plugins/{name}",
        "ref": tag,
        "sha": git("rev-parse", f"{tag}^{{commit}}"),
    }

pinned = json.dumps(marketplace, indent=2, ensure_ascii=False) + "\n"
if check and pinned != text:
    problems.append(f"{MARKETPLACE} does not point at the latest release tags: run scripts/pin-releases.sh")
if problems:
    sys.exit("\n".join(problems))
if not check:
    with open(MARKETPLACE, "w") as f:
        f.write(pinned)
PY
