# gate-meter

English | [Українська](README.uk.md)

For sessions that work under [/unlazy](https://github.com/Leonxlnx/unlazy), the skill that writes acceptance gates before a task and keeps the session going until every gate is met. Its Stop hook speaks only at the end. This mod shows the progress along the way: one quiet row above the prompt, and the whole list on `/gates`.

## What you see

A row appears only when an `/unlazy` scope is bound to this session (`gate-check --bind`). Without a binding the mod draws nothing.

```
Gates alerts-mvp ■■■■■■■■□□□□ 8 of 12 │ Next G9: the digest reaches the thread
```

- One cell per gate in ledger order: filled when met, dim when open, a yellow `×` when abandoned, a red cell when a gate that was met broke on `pause.mjs resume`. A ledger of more than 30 gates gets a bar of 20 cells instead.
- Met of total, then the first open gate with its title, cut to fit the width. When the gate's box is ticked but its evidence is pending or no longer matches its definition, the row says so in brackets.
- The abandoned count. Where unlazy has a pause (its handoff-pause fork): `paused` after the human typed `/handoff`, `stopped, waiting for a decision` while `BLOCKED.md` is there, and the ids that regressed on resume.
- When every gate is met: a green dot and one dim line, `Gates alerts-mvp: all 12 met`.

Colour is only for what needs a look: yellow for a stop or an abandonment, red for a regression, green for the finished dot. Everything else is dim.

`/gates` lists every gate with `✓`, `○` or `×`, why an open one is open, and where the ledger is. If another plugin already has `/gates`, the command is `/gm-gates`.

## Where the numbers come from

The mod reads `.unlazy/<scope>/` under the session's folder and never writes there. The counts come from the unlazy checker in its read-only mode, `gate-check.mjs --status`, which never runs a `CHECK:` line: the same state model the Stop hook uses, so the row and the hook agree, stale evidence included. The checker runs only when a file of the scope changed; the scope is read again after each Bash call, at the end of each turn, and every 15 seconds.

The mod finds the checker next to the Stop hook in `~/.claude/settings.json`, else in `~/.claude/skills/unlazy`, else in the project's `.claude/skills/unlazy`. Set the `checker` option to point elsewhere. Without a checker, or when it does not answer, the ledger's check boxes decide, and `/gates` says so: a box ticked over stale evidence then counts as met.

## In the band

The mod joins [handoff-relay](../handoff-relay), [cache-meter](../cache-meter) and [next-steps](../next-steps) in one band, below them: Handoff, cache, What next?, gates. It is not in the `primaries` pack, since it is useful only with /unlazy.

## For other mods

The mod publishes what it shows in `$.state` as `gate-meter.view` (see `types/index.d.ts`): the bound scopes with their counts, cells and the next open gate.

## Options

| Option | Default | What it does |
| --- | --- | --- |
| `language` | `auto` | `auto` follows Claude's response language from `/config`; `en` or `uk` set it |
| `checker` | empty | Path to unlazy's `scripts/gate-check.mjs`, when the mod does not find it by itself |

## Checks

```
claude plugin validate .
claude plugin test .
```
