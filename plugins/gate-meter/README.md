# gate-meter

English | [Українська](README.uk.md)

For sessions that work under [/unlazy](https://github.com/Leonxlnx/unlazy), the skill that writes acceptance gates before a task and keeps the session going until every gate is met. Its Stop hook speaks only at the end. This mod shows the progress along the way: one quiet row above the prompt, and the whole list on `/gates`.

## What you see

A row appears only when an `/unlazy` scope is bound to this session (`gate-check --bind`). Without a binding the mod draws nothing.

```
Gates ■■■■■■■■■□□□ 9 of 12 │ ● Waiting for a decision │ Details
```

- **Label.** `Gates` alone; when several scopes are bound to the session, each row names its own, `Gates alerts-mvp`.
- **Cells.** One per gate in ledger order up to 14 gates: filled when met, dim when open, a yellow `×` when abandoned, a red cell when a gate that was met broke on `pause.mjs resume`. From 15 gates a bar of 15 steps, `█` and dim `░`, as cache-meter draws its bar. Once 75 % of the gates are met, the filled cells or steps turn green.
- **Count.** Met of total. A `≈` before it means the unlazy checker could not be asked and the check boxes in the file decided.
- **State**, after a bar, only when there is one. Colour is carried by the dot alone; the words stay plain or dim:

| Dot | Words | When |
| --- | --- | --- |
| yellow `●` | Waiting for a decision | `BLOCKED.md` is there: a large repair stopped the work |
| red `●` | Regressed G3, G5 | a gate that was met broke on `pause.mjs resume` |
| dim `◌` | Paused (dim) | this session paused after the human typed `/handoff` |
| none | 2 abandoned (dim) | the ledger has `ABANDON` lines |
| green `●` | All met (dim) | every gate is met |

When the row is too narrow, the dim counts give way first; the dotted states stay. Which gate is open next is not repeated in the row, the count already says how many are left: it is in the pane.

**Details**, a dim button at the end of the row (`g` in the terminal), opens a pane in the side panel and closes it again. The pane has the ledger's heading in bold, its Scope as an indented paragraph, the count and where it comes from, the states with the row's dots and the first open gate. Then one line per gate, the ids in a column of one width so the titles line up; met gates step back, open ones stay at full strength. A press on a gate opens its full title and its fields, each a dim name on a line above its value: `CHECK`, `EXPECT`, `CWD`, the evidence, why it is still open or why it was abandoned. Expand all and Collapse all do the whole list.

`/gates` lists every gate with `✓`, `○` or `×` as text, why an open one is open, and where the ledger is. If another plugin already has `/gates`, the command is `/gm-gates`.

## Where the numbers come from

The mod reads `.unlazy/<scope>/` under the session's folder and never writes there. The counts come from the unlazy checker in its read-only mode, `gate-check.mjs --status`, which never runs a `CHECK:` line: the same state model the Stop hook uses, so the row and the hook agree, stale evidence included. The checker runs only when a file of the scope changed; the scope is read again after each Bash call, at the end of each turn, and every 15 seconds.

The mod finds the checker next to the Stop hook in `~/.claude/settings.json`, else in `~/.claude/skills/unlazy`, else in the project's `.claude/skills/unlazy`. Set the `checker` option to point elsewhere. Without a checker, or when it does not answer, the ledger's check boxes decide, and `/gates` says so: a box ticked over stale evidence then counts as met.

## In the band

The mod joins [handoff-relay](../handoff-relay), [cache-meter](../cache-meter) and [next-steps](../next-steps) in one band, below them: Handoff, cache, What next?, gates. It is not in the `primaries` pack, since it is useful only with /unlazy.

## For other mods

The mod publishes what it shows in `$.state` as `gate-meter.view` (see `types/index.d.ts`): the bound scopes with their counts, cells, states and the first open gate.

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
