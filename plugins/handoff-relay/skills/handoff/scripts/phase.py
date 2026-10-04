#!/usr/bin/env python3
"""Handoff chain phase, from the session title or from explicit --chain/--phase.

Prints JSON: base, phase (the current N), next_phase, card_title (at most 60
characters), file (the next handoff's file name), previous (the current phase's
file, or null), previous_exists. Standard library only.
"""
import argparse
import json
import os
import re
import sys

SUFFIX = re.compile(r"\s+H([1-9]\d*)$")
FORBIDDEN = re.compile(r'[*"\\/<>:|?#^\[\]]')
MAX_TITLE = 60


def parse(title):
    title = " ".join(title.split())
    match = SUFFIX.search(title)
    if match:
        return title[: match.start()].strip(), int(match.group(1))
    return title, 1


def card_title(base, phase):
    suffix = f" H{phase}"
    if len(base) + len(suffix) <= MAX_TITLE:
        return base + suffix
    return base[: MAX_TITLE - len(suffix) - 1].rstrip() + "…" + suffix


def file_name(base, phase):
    safe = " ".join(FORBIDDEN.sub("-", base).split())
    return f"{safe} — H{phase}.md"


def resolve(title=None, chain=None, phase=None, handoffs_dir=None):
    if chain:
        base, current = " ".join(chain.split()), phase or 1
    else:
        base, current = parse(title or "")
    if not base:
        raise ValueError("empty base: neither a session title nor --chain")
    nxt = current + 1
    previous = file_name(base, current) if current >= 2 else None
    exists = bool(previous and handoffs_dir and os.path.isfile(os.path.join(handoffs_dir, previous)))
    return {
        "base": base,
        "phase": current,
        "next_phase": nxt,
        "card_title": card_title(base, nxt),
        "file": file_name(base, nxt),
        "previous": previous,
        "previous_exists": exists,
    }


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--title", help="the session title")
    ap.add_argument("--chain", help="the chain base, from the start prompt's chain line")
    ap.add_argument("--phase", type=int, help="the current phase N, from the same line")
    ap.add_argument("--handoffs-dir", help="the handoffs folder, to check previous")
    args = ap.parse_args(argv)
    if args.phase is not None and args.phase < 1:
        ap.error("--phase must be at least 1")
    try:
        out = resolve(args.title, args.chain, args.phase, args.handoffs_dir)
    except ValueError as err:
        print(f"phase.py: {err}", file=sys.stderr)
        return 2
    print(json.dumps(out, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
